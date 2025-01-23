"""The reference data every quotation is built from: products, customers, our company and its assets."""

import json
from functools import cache
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"


@cache
def load(name: str):
    return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))


def products() -> dict[str, dict]:
    return {p["part_number"]: p for p in load("catalogue")}


def customers() -> dict[str, dict]:
    return {c["code"]: c for c in load("customers")}


def company() -> dict:
    return load("company")


def assets() -> dict:
    return load("assets")


def clause(clause_id: str) -> dict | None:
    return next((c for c in assets()["clauses"] if c["id"] == clause_id), None)


def current_version(clause_id: str, on: str) -> dict | None:
    """The version of a clause in force on a date (YYYY-MM-DD)."""
    c = clause(clause_id)
    if not c:
        return None
    for v in c["versions"]:
        if v["from"] <= on and (v["to"] is None or on <= v["to"]):
            return v
    return None
