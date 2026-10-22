"""Build data/*.json from Order Desk's synthetic catalogue (same products, customers and company).

PYTHONPATH=../order-desk ../order-desk/.venv/Scripts/python.exe tools/export_data.py
"""

import json
from decimal import Decimal
from pathlib import Path

from synth.catalogue import CUSTOMERS, PRODUCTS, US

OUT = Path(__file__).resolve().parent.parent / "data"

# What the reseller pays the distributor, as a share of list price, by category (made up but typical in shape).
COST_SHARE = {
    "server": "0.78",
    "storage": "0.76",
    "backup": "0.77",
    "network": "0.80",
    "endpoint": "0.86",
    "software": "0.82",
    "security": "0.80",
    "service": "0.55",
}
PACKS = {"RSA-SID-700-50": 1}  # sold per pack of 50 tokens: quantity counts packs
MIN_QTY = {
    "VVF-CORE-1Y": 16,
    "COH-DP-1TB-3Y": 1,
    "CUP-DEX-USR-1Y": 25,
    "FP-DLP-ENT-1Y": 25,
    "SYM-SEP-USR-1Y": 10,
}
LEAD_DAYS = {
    "server": 21,
    "storage": 28,
    "backup": 28,
    "network": 14,
    "endpoint": 10,
    "software": 3,
    "security": 7,
    "service": 5,
}


def main() -> None:
    OUT.mkdir(exist_ok=True)
    catalogue = []
    for p in PRODUCTS:
        catalogue.append(
            {
                "part_number": p.part_number,
                "brand": p.brand,
                "description": p.description,
                "category": p.category,
                "list_price": str(p.list_price),
                "cost": str((p.list_price * Decimal(COST_SHARE[p.category])).quantize(Decimal("0.01"))),
                "min_qty": MIN_QTY.get(p.part_number, 1),
                "lead_days": LEAD_DAYS[p.category],
                "unit": "pack of 50"
                if p.part_number in PACKS
                else (
                    "licence"
                    if p.category in ("software", "security") and "per" in p.description
                    else ("day" if "per day" in p.description else "unit")
                ),
            }
        )
    customers = [
        {
            "code": c.short_code,
            "name": c.name,
            "trn": c.trn,
            "sector": c.sector,
            "address": c.address,
            "emirate": c.emirate,
        }
        for c in CUSTOMERS
    ]
    # One customer without a TRN on file, as happens with a new account.
    customers.append(
        {
            "code": "NWH",
            "name": "Nakheel Wharf Hotels",
            "trn": None,
            "sector": "enterprise",
            "address": "Tower B, Al Sufouh 2",
            "emirate": "Dubai",
        }
    )
    (OUT / "catalogue.json").write_text(
        json.dumps(catalogue, indent=1) + "\n", encoding="utf-8", newline="\n"
    )
    (OUT / "customers.json").write_text(
        json.dumps(customers, indent=1) + "\n", encoding="utf-8", newline="\n"
    )
    company = {
        "name": US["name"],
        "address": US["address"],
        "trn": US["trn"],
        "phone": "+971 4 000 0000 (demo)",
        "email": "sales@keystone-data.example",
        "bank": "Demo Bank PJSC, IBAN AE00 0000 0000 0000 0000 000 (demo)",
    }
    (OUT / "company.json").write_text(json.dumps(company, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(len(catalogue), "products,", len(customers), "customers")


if __name__ == "__main__":
    main()
