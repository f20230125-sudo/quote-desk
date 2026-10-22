"""Quote Desk: Flask API that checks quotations and writes them as PDF and Word, plus the built React app.

Stateless on purpose: the reference data (catalogue, customers, company assets, clauses) ships with the app, and
drafts and versions stay in the browser. Vercel runs this as one function; deep links get the app shell.
"""

from datetime import date
from io import BytesIO
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_file
from pydantic import ValidationError
from werkzeug.exceptions import HTTPException

from backend import catalog
from backend.pdf_text import pdf_text_errors
from backend.quote import Quote, QuoteIn, build
from backend.render_docx import render_docx
from backend.render_pdf import render_pdf

ROOT = Path(__file__).resolve().parent
INDEX_HTML = ROOT / "public" / "index.html"

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 256 * 1024


def error(status: int, code: str, message: str, details=None):
    body = {"error": {"code": code, "message": message}}
    if details is not None:
        body["error"]["details"] = details
    return jsonify(body), status


@app.errorhandler(HTTPException)
def _http(err: HTTPException):
    return error(err.code or 500, "http_error", err.description or err.name)


def _quote() -> Quote:
    try:
        q = QuoteIn.model_validate(request.get_json(silent=True) or {})
    except ValidationError as exc:
        raise BadQuote(
            [{"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in exc.errors()]
        ) from exc
    return build(q, today=date.today())


class BadQuote(Exception):
    def __init__(self, details):
        self.details = details


@app.errorhandler(BadQuote)
def _bad(err: BadQuote):
    return error(400, "check_the_form", "Some values need a look.", err.details)


def _money(x):
    return f"{x:.2f}" if x is not None else None


@app.get("/api/data")
def data():
    return jsonify(
        catalogue=catalog.load("catalogue"),
        customers=catalog.load("customers"),
        company=catalog.company(),
        assets=catalog.assets(),
    )


@app.post("/api/quote/check")
def check():
    qt = _quote()
    return jsonify(
        lines=[
            {
                "n": ln.n,
                "part_number": ln.part_number,
                "description": ln.description,
                "unit": ln.unit,
                "qty": ln.qty,
                "list_price": _money(ln.list_price),
                "unit_price": _money(ln.unit_price),
                "discount_pct": _money(ln.discount_pct),
                "net": _money(ln.net),
                "cost": _money(ln.cost),
                "margin": _money(ln.margin),
                "margin_pct": _money(ln.margin_pct),
                "lead_days": ln.lead_days,
            }
            for ln in qt.lines
        ],
        subtotal=_money(qt.subtotal),
        vat=_money(qt.vat),
        total=_money(qt.total),
        margin=_money(qt.margin),
        margin_pct=_money(qt.margin_pct),
        valid_until=qt.valid_until.isoformat(),
        longest_lead=qt.longest_lead,
        clauses=qt.clauses,
        blocked=qt.blocked,
        findings=[{"severity": f.severity, "message": f.message, "line": f.line} for f in qt.findings],
    )


def _file(data: bytes, mime: str, name: str) -> Response:
    response = send_file(
        BytesIO(data),
        mimetype=mime,
        as_attachment=True,
        download_name=name,
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@app.post("/api/quote/pdf")
def pdf():
    qt = _quote()
    if details := pdf_text_errors(qt):
        raise BadQuote(details)
    return _file(render_pdf(qt), "application/pdf", f"{qt.q.quote_no}-v{qt.q.version}.pdf")


@app.post("/api/quote/docx")
def docx():
    qt = _quote()
    return _file(
        render_docx(qt),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        f"{qt.q.quote_no}-v{qt.q.version}.docx",
    )


@app.route("/api/", defaults={"path": ""}, methods=["GET", "POST"])
@app.route("/api/<path:path>", methods=["GET", "POST"])
def api_404(path: str):
    return error(404, "not_found", f"No API route /api/{path}")


@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def spa(path: str):
    if not INDEX_HTML.is_file():
        return "The web app is not built yet: run npm --prefix web run build", 503
    return send_file(INDEX_HTML, max_age=0)


@app.after_request
def _headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return resp
