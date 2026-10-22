"""A quotation: what the person typed (QuoteIn), the figures computed from it, and the checks before it goes out.

Money is Decimal, rounded half-up to the fils at the line, as an invoice would be. The checks speak in plain
sentences and say whether a problem blocks sending ("block"), needs a look ("warn") or is worth knowing ("note").
"""

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

from backend import catalog
from backend.pdf_text import pdf_text_errors

CENT = Decimal("0.01")
VAT = Decimal("0.05")


def r2(x: Decimal) -> Decimal:
    return x.quantize(CENT, rounding=ROUND_HALF_UP)


def pct(x: Decimal) -> str:
    """20.00 -> "20", 12.50 -> "12.5": percentages as people write them."""
    s = format(x.quantize(CENT), "f").rstrip("0").rstrip(".")
    return s or "0"


class LineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    part_number: str
    qty: int = Field(gt=0, le=100000)
    unit_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    discount_pct: Decimal = Field(default=Decimal(0), ge=0, le=100, decimal_places=2)


class QuoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    quote_no: str = Field(min_length=3, max_length=40)
    version: int = Field(default=1, ge=1)
    customer_code: str
    their_ref: str = Field(default="", max_length=60)
    issue_date: date
    valid_days: int = Field(default=30, ge=1, le=180, validate_default=True)
    prepared_by: str = Field(default="", max_length=60)
    lines: list[LineIn] = Field(default_factory=list, max_length=100)
    clauses: list[str] = Field(default_factory=list, max_length=20)
    clause_versions: dict[str, int] = Field(
        default_factory=dict
    )  # a saved quote keeps the versions it was sent with
    approved_by: str = Field(default="", max_length=60)

    @field_validator("quote_no", mode="before")
    @classmethod
    def _single_line_number(cls, v):
        if isinstance(v, str) and ("\r" in v or "\n" in v):
            raise ValueError("quotation number cannot contain line breaks")
        return v

    @field_validator("quote_no", "their_ref", "prepared_by", "approved_by", mode="before")
    @classmethod
    def _document_text(cls, v):
        if isinstance(v, str) and any(
            not (c in "\t\n\r" or "\x20" <= c <= "\ud7ff" or "\ue000" <= c <= "\ufffd" or ord(c) >= 0x10000)
            for c in v
        ):
            raise ValueError("text contains a character that cannot be used in a document")
        return v

    @field_validator("valid_days")
    @classmethod
    def _valid_expiry(cls, v, info: ValidationInfo):
        issued = info.data.get("issue_date")
        if issued is not None and v > (date.max - issued).days:
            raise ValueError("validity ends beyond the supported calendar")
        return v

    @field_validator("clause_versions")
    @classmethod
    def _known_versions(cls, v):
        for cid, version in v.items():
            c = catalog.clause(cid)
            if c is None or not any(x["v"] == version for x in c["versions"]):
                raise ValueError(f"no version {version} for clause {cid}")
        return v

    @field_validator("customer_code")
    @classmethod
    def _known_customer(cls, v):
        if v not in catalog.customers():
            raise ValueError(f"no customer {v}")
        return v


@dataclass
class Line:
    n: int
    part_number: str
    description: str
    unit: str
    qty: int
    list_price: Decimal
    unit_price: Decimal
    discount_pct: Decimal
    net: Decimal
    cost: Decimal
    margin: Decimal  # net - cost * qty
    margin_pct: Decimal | None
    lead_days: int


@dataclass
class Finding:
    severity: str  # block, warn, note
    message: str
    line: int | None = None


@dataclass
class Quote:
    q: QuoteIn
    customer: dict
    lines: list[Line]
    subtotal: Decimal
    vat: Decimal
    total: Decimal
    margin: Decimal
    margin_pct: Decimal | None
    valid_until: date
    longest_lead: int
    clauses: list[dict] = field(default_factory=list)  # {id, title, v, text, current_v}
    findings: list[Finding] = field(default_factory=list)

    @property
    def blocked(self) -> bool:
        return any(f.severity == "block" for f in self.findings)


def build(q: QuoteIn, today: date | None = None) -> Quote:
    today = today or date.today()
    products = catalog.products()
    customer = catalog.customers()[q.customer_code]
    policy = catalog.assets()["policy"]
    lines, findings = [], []
    for n, li in enumerate(q.lines, start=1):
        p = products.get(li.part_number)
        if p is None:
            findings.append(Finding("block", f"Line {n}: {li.part_number} is not in the catalogue.", n))
            continue
        net = r2(li.unit_price * li.qty * (1 - li.discount_pct / 100))
        cost = Decimal(p["cost"])
        margin = net - r2(cost * li.qty)
        lines.append(
            Line(
                n,
                li.part_number,
                p["description"],
                p["unit"],
                li.qty,
                Decimal(p["list_price"]),
                li.unit_price,
                li.discount_pct,
                net,
                cost,
                margin,
                r2(margin / net * 100) if net else None,
                p["lead_days"],
            )
        )
    subtotal = sum((ln.net for ln in lines), Decimal(0))
    vat = r2(subtotal * VAT)
    margin = sum((ln.margin for ln in lines), Decimal(0))
    on = q.issue_date.isoformat()
    clauses = []
    for cid in q.clauses:
        c = catalog.clause(cid)
        if c is None:
            findings.append(Finding("block", f"Clause {cid} is not in the clause library."))
            continue
        cur = catalog.current_version(cid, on)
        v = q.clause_versions.get(cid, cur["v"] if cur else c["versions"][-1]["v"])
        text = next(x["text"] for x in c["versions"] if x["v"] == v)
        clauses.append(
            {"id": cid, "title": c["title"], "v": v, "text": text, "current_v": cur["v"] if cur else None}
        )
    quote = Quote(
        q,
        customer,
        lines,
        subtotal,
        vat,
        subtotal + vat,
        margin,
        r2(margin / subtotal * 100) if subtotal else None,
        q.issue_date + timedelta(days=q.valid_days),
        max((ln.lead_days for ln in lines), default=0),
        clauses,
        findings,
    )
    quote.findings += check(quote, today, policy)
    return quote


def check(quote: Quote, today: date, policy: dict) -> list[Finding]:
    out: list[Finding] = []
    q = quote.q
    out += [Finding("block", error["message"]) for error in pdf_text_errors(quote)]
    floor = Decimal(policy["margin_floor_pct"])
    approval = Decimal(policy["discount_approval_pct"])
    products = catalog.products()
    if not q.lines:
        out.append(Finding("block", "The quotation has no lines."))
    for ln in quote.lines:
        p = products[ln.part_number]
        if ln.net < ln.cost * ln.qty:
            out.append(
                Finding(
                    "block",
                    f"Line {ln.n}: {ln.part_number} is quoted below our cost "
                    f"({ln.unit_price * (1 - ln.discount_pct / 100):,.2f} each against a cost of {ln.cost:,.2f}).",
                    ln.n,
                )
            )
        elif ln.net and ln.margin / ln.net * 100 < floor:
            out.append(
                Finding(
                    "warn",
                    f"Line {ln.n}: margin on {ln.part_number} is {pct(ln.margin_pct)}%, under the "
                    f"{pct(floor)}% floor.",
                    ln.n,
                )
            )
        if ln.discount_pct > approval and not q.approved_by:
            out.append(
                Finding(
                    "block",
                    f"Line {ln.n}: a {pct(ln.discount_pct)}% discount needs the "
                    f"{policy['approver']}'s approval (over {pct(approval)}%). Record who approved it.",
                    ln.n,
                )
            )
        if ln.qty < p["min_qty"]:
            out.append(
                Finding(
                    "block",
                    f"Line {ln.n}: {ln.part_number} is sold in at least {p['min_qty']} "
                    f"{p['unit']}s; {ln.qty} cannot be ordered.",
                    ln.n,
                )
            )
        if ln.unit_price > ln.list_price:
            out.append(
                Finding(
                    "note", f"Line {ln.n}: the price is above the list price of {ln.list_price:,.2f}.", ln.n
                )
            )
    if not quote.customer.get("trn"):
        out.append(
            Finding(
                "warn",
                f"{quote.customer['name']} has no TRN on file. The tax invoice needs it, and from "
                "2027 so does the electronic invoice: ask for it now.",
            )
        )
    if quote.valid_until < today:
        out.append(
            Finding("block", f"Validity ended on {quote.valid_until:%d %b %Y}. Reprice before sending.")
        )
    for c in quote.clauses:
        if c["current_v"] is not None and c["v"] != c["current_v"]:
            out.append(
                Finding(
                    "warn",
                    f'Clause "{c["title"]}" is version {c["v"]}; version {c["current_v"]} is in '
                    "force. Update it unless this quotation was agreed on the old terms.",
                )
            )
        if c["current_v"] is None:
            out.append(Finding("warn", f'Clause "{c["title"]}" was not in force on {q.issue_date:%d %b %Y}.'))
    missing = [cid for cid in ("payment", "validity") if cid not in q.clauses]
    for cid in missing:
        out.append(Finding("warn", f'The "{catalog.clause(cid)["title"]}" clause is not included.'))
    return out
