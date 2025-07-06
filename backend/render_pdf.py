"""The quotation as a PDF: our letterhead, the customer, the lines, the totals, the clauses and a signature block.

One template for every quotation, so every quotation looks the same. A quotation that a check still blocks is
marked DRAFT across every page, so it cannot be mistaken for one that may be sent.
"""

import io
from decimal import Decimal

from reportlab.lib.colors import Color, black
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

from backend import catalog
from backend.quote import Quote, pct

GREY = Color(0.42, 0.42, 0.42)
RULE = Color(0.55, 0.55, 0.55)
W, H = A4
M = 18 * mm


def money(x: Decimal) -> str:
    return f"{x:,.2f}"


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if stringWidth(trial, font, size) <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            while stringWidth(w, font, size) > width:
                end = 1
                while end < len(w) and stringWidth(w[: end + 1], font, size) <= width:
                    end += 1
                lines.append(w[:end])
                w = w[end:]
            cur = w
    if cur:
        lines.append(cur)
    return lines or [""]


class Page:
    def __init__(self, quote: Quote):
        self.quote = quote
        self.buf = io.BytesIO()
        self.c = Canvas(self.buf, pagesize=A4, invariant=1)
        self.c.setTitle(f"Quotation {quote.q.quote_no} v{quote.q.version}")
        self.c.setAuthor(catalog.company()["name"])
        self.page = 1
        self.y = 0.0

    def text(self, x, y, s, size=9, bold=False, color=black, right=False, font=None):
        self.c.setFillColor(color)
        f = font or ("Helvetica-Bold" if bold else "Helvetica")
        self.c.setFont(f, size)
        (self.c.drawRightString if right else self.c.drawString)(x, H - y, s)

    def rule(self, y, width=0.5, color=RULE, x1=M, x2=W - M):
        self.c.setStrokeColor(color)
        self.c.setLineWidth(width)
        self.c.line(x1, H - y, x2, H - y)

    def letterhead(self):
        co, brand = catalog.company(), catalog.assets()["brand"]
        self.text(M, 22 * mm, brand["wordmark"], size=20, bold=True)
        self.text(
            M + stringWidth(brand["wordmark"], "Helvetica-Bold", 20) + 6, 22 * mm, brand["tagline"], size=11
        )
        self.text(W - M, 16 * mm, co["name"], size=8, right=True)
        self.text(W - M, 20 * mm, co["address"], size=8, right=True, color=GREY)
        self.text(W - M, 24 * mm, f"TRN {co['trn']}   {co['email']}", size=8, right=True, color=GREY)
        self.rule(28 * mm, width=1.2, color=black)
        if self.quote.blocked:
            self.c.saveState()
            self.c.setFillColor(Color(0.85, 0.85, 0.85))
            self.c.setFont("Helvetica-Bold", 90)
            self.c.translate(W / 2, H / 2)
            self.c.rotate(35)
            self.c.drawCentredString(0, 0, "DRAFT")
            self.c.restoreState()

    def footer(self, total_pages: int | str):
        co = catalog.company()
        self.rule(H - 16 * mm, width=0.4)
        self.text(M, H - 11 * mm, co["bank"], size=7, color=GREY)
        q = self.quote.q
        self.text(
            W - M,
            H - 11 * mm,
            f"{q.quote_no} v{q.version}   Page {self.page} of {total_pages}",
            size=7,
            color=GREY,
            right=True,
        )

    def new_page(self, total_pages):
        self.footer(total_pages)
        self.c.showPage()
        self.page += 1
        self.letterhead()
        self.y = 38 * mm

    def need(self, height, total_pages):
        if self.y + height > H - 24 * mm:
            self.new_page(total_pages)


COLS = [
    ("#", M, "l"),
    ("Part and description", M + 8 * mm, "l"),
    ("Qty", 128 * mm, "r"),
    ("Unit price", 150 * mm, "r"),
    ("Disc.", 162 * mm, "r"),
    ("Amount AED", W - M, "r"),
]
DESC_W = 128 * mm - (M + 8 * mm) - 14 * mm


def _draw(quote: Quote, total_pages) -> Page:
    p = Page(quote)
    q, cust = quote.q, quote.customer
    p.letterhead()
    p.text(M, 42 * mm, "Quotation", size=18, bold=True)
    meta = [
        ("Quotation", f"{q.quote_no}  (version {q.version})"),
        ("Date", f"{q.issue_date:%d %B %Y}"),
        ("Valid until", f"{quote.valid_until:%d %B %Y}"),
        ("Your reference", q.their_ref or "-"),
        ("Prepared by", q.prepared_by or "-"),
    ]
    meta_y = 40 * mm
    for label, value in meta:
        lines = wrap(value, "Helvetica", 8.5, W - M - 145 * mm)
        p.text(118 * mm, meta_y, label, size=8, color=GREY)
        for k, line in enumerate(lines):
            p.text(145 * mm, meta_y + k * 4 * mm, line, size=8.5)
        meta_y += max(5 * mm, len(lines) * 4 * mm + mm)
    p.text(M, 52 * mm, "For", size=8, color=GREY)
    p.text(M, 57 * mm, cust["name"], size=10, bold=True)
    p.text(M, 62 * mm, f"{cust['address']}, {cust['emirate']}", size=8.5)
    p.text(
        M,
        67 * mm,
        f"TRN {cust['trn']}" if cust.get("trn") else "TRN not on file",
        size=8.5,
        color=black if cust.get("trn") else GREY,
    )
    p.y = max(80 * mm, meta_y + 10 * mm)
    p.rule(p.y - 4 * mm, width=1, color=black)
    for label, x, align in COLS:
        p.text(x, p.y, label, size=8, bold=True, right=(align == "r"))
    p.rule(p.y + 2.5 * mm)
    p.y += 8 * mm
    for ln in quote.lines:
        desc = wrap(ln.description, "Helvetica", 8, DESC_W)
        height = 6.5 * mm + len(desc) * 3.6 * mm
        p.need(height, total_pages)
        p.text(M, p.y, str(ln.n), size=8.5)
        p.text(M + 8 * mm, p.y, ln.part_number, size=8.5, font="Courier-Bold")
        for k, d in enumerate(desc):
            p.text(M + 8 * mm, p.y + (k + 1) * 3.6 * mm, d, size=8, color=GREY)
        p.text(128 * mm, p.y, f"{ln.qty} {ln.unit if ln.qty == 1 else ln.unit + 's'}", size=8.5, right=True)
        p.text(150 * mm, p.y, money(ln.unit_price), size=8.5, right=True)
        p.text(162 * mm, p.y, f"{pct(ln.discount_pct)}%" if ln.discount_pct else "", size=8.5, right=True)
        p.text(W - M, p.y, money(ln.net), size=8.5, right=True)
        p.y += height
        p.rule(p.y - 3 * mm, width=0.3)
    p.need(24 * mm, total_pages)
    for label, value, bold in (
        ("Subtotal", quote.subtotal, False),
        ("VAT 5%", quote.vat, False),
        ("Total AED", quote.total, True),
    ):
        p.text(150 * mm, p.y, label, size=9, bold=bold, right=True)
        p.text(W - M, p.y, money(value), size=9, bold=bold, right=True)
        p.y += 5.5 * mm
    p.y += 2 * mm
    p.text(
        M,
        p.y,
        f"Longest lead time on this quotation: {quote.longest_lead} days from your purchase order.",
        size=8,
        color=GREY,
    )
    p.y += 9 * mm
    if quote.clauses:
        p.need(12 * mm, total_pages)
        p.text(M, p.y, "Terms", size=10, bold=True)
        p.y += 6 * mm
        for c in quote.clauses:
            body = wrap(c["text"], "Helvetica", 8.5, W - 2 * M - 34 * mm)
            p.need(4 * mm + len(body) * 4 * mm, total_pages)
            p.text(M, p.y, c["title"], size=8.5, bold=True)
            for k, b in enumerate(body):
                p.text(M + 34 * mm, p.y + k * 4 * mm, b, size=8.5)
            p.y += len(body) * 4 * mm + 2.5 * mm
    p.need(26 * mm, total_pages)
    p.y += 8 * mm
    p.text(M, p.y, f"For {catalog.company()['name']}", size=8.5)
    p.text(110 * mm, p.y, f"Accepted for {cust['name']}", size=8.5)
    p.rule(p.y + 14 * mm, x1=M, x2=80 * mm)
    p.rule(p.y + 14 * mm, x1=110 * mm, x2=W - M)
    p.text(M, p.y + 18 * mm, "Name, signature, date", size=7, color=GREY)
    p.text(110 * mm, p.y + 18 * mm, "Name, signature, company stamp, date", size=7, color=GREY)
    return p


def render_pdf(quote: Quote) -> bytes:
    # Draw once to count the pages, then again with "Page n of N" filled in.
    pages = _draw(quote, "?").page
    p = _draw(quote, pages)
    p.footer(pages)
    p.c.save()
    return p.buf.getvalue()
