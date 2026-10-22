"""Check text against the PDF's built-in fonts before they substitute missing glyphs."""

from functools import cache
from unicodedata import name

from reportlab.pdfbase.pdfmetrics import getFont

from backend import catalog


@cache
def _supported(character: str, font: str) -> bool:
    primary = getFont(font)
    for candidate in [primary, *primary.substitutionFonts]:
        try:
            character.encode(candidate.encName)
            return True
        except UnicodeEncodeError:
            pass
    return False


def pdf_text_errors(quote) -> list[dict[str, str]]:
    q, customer = quote.q, quote.customer
    fields = [
        ("quote_no", "Quotation number", q.quote_no, "Helvetica"),
        ("their_ref", "Your reference", q.their_ref, "Helvetica"),
        ("prepared_by", "Prepared by", q.prepared_by, "Helvetica"),
    ]
    for key in ("name", "address", "emirate", "trn"):
        fields.append((f"customer.{key}", f"Customer {key}", customer.get(key) or "", "Helvetica"))
    for key in ("name", "address", "trn", "email", "bank"):
        fields.append((f"company.{key}", f"Company {key}", catalog.company()[key], "Helvetica"))
    for key in ("wordmark", "tagline"):
        fields.append((f"brand.{key}", f"Brand {key}", catalog.assets()["brand"][key], "Helvetica"))
    for line in quote.lines:
        for key in ("part_number", "description", "unit"):
            fields.append(
                (
                    f"lines.{line.n - 1}.{key}",
                    f"Line {line.n} {key}",
                    getattr(line, key),
                    "Courier-Bold" if key == "part_number" else "Helvetica",
                )
            )
    for clause in quote.clauses:
        for key in ("title", "text"):
            fields.append(
                (f"clauses.{clause['id']}.{key}", f"Clause {clause['id']} {key}", clause[key], "Helvetica")
            )
    errors = []
    for field, label, text, font in fields:
        missing = [c for c in text if not _supported(c, font)]
        if missing:
            kind = "Arabic text" if any("ARABIC" in name(c, "") for c in missing) else "This text"
            errors.append(
                {
                    "field": field,
                    "message": f"{label}: {kind} cannot be printed in the PDF yet; the Word file keeps it.",
                }
            )
    return errors
