import { describe, expect, it } from "vitest";
import { diff } from "./diff";
import type { Draft } from "./types";

const v1: Draft = {
  quote_no: "Q-1", version: 1, customer_code: "GCB", their_ref: "", issue_date: "2026-10-22", valid_days: 30,
  prepared_by: "", approved_by: "", clauses: ["payment", "validity"], clause_versions: { payment: 1 },
  lines: [
    { part_number: "PER760-XS2", qty: 4, unit_price: "45900.00", discount_pct: "0" },
    { part_number: "VVF-CORE-1Y", qty: 8, unit_price: "620.00", discount_pct: "0" },
  ],
};

describe("what changed between versions", () => {
  it("is empty for the same draft", () => {
    expect(diff(v1, v1)).toEqual([]);
  });
  it("says each change in words", () => {
    const v2: Draft = {
      ...v1, version: 2, approved_by: "R. Menon", clause_versions: { payment: 2 }, clauses: ["payment", "validity", "law"],
      lines: [
        { part_number: "PER760-XS2", qty: 4, unit_price: "44900.00", discount_pct: "5" },
        { part_number: "SFP28-SR-25G", qty: 8, unit_price: "640.00", discount_pct: "0" },
      ],
    };
    expect(diff(v1, v2)).toEqual([
      "PER760-XS2: unit price 45,900.00 to 44,900.00.",
      "PER760-XS2: discount 0% to 5%.",
      "Added 8 x SFP28-SR-25G at 640.00.",
      "Removed 8 x VVF-CORE-1Y.",
      'Clause "law" added.',
      'Clause "payment": version 1 to 2.',
      "Approval: R. Menon.",
    ]);
  });
});
