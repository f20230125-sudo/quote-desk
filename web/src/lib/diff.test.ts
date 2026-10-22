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
  it("keeps duplicate product rows in the comparison", () => {
    const before = { ...v1, lines: [v1.lines[0], { ...v1.lines[0] }] };
    const after = { ...before, lines: [{ ...before.lines[0], qty: 100 }, before.lines[1]] };
    expect(diff(before, after)).toEqual(["PER760-XS2: quantity 4 to 100."]);
  });
  it("reports removal of one duplicate product row", () => {
    const before = { ...v1, lines: [v1.lines[0], { ...v1.lines[0] }] };
    expect(diff(before, { ...before, lines: [before.lines[0]] })).toEqual(["Removed 4 x PER760-XS2."]);
  });
  it("uses line IDs when duplicate rows are removed or reordered", () => {
    const before = { ...v1, lines: [{ ...v1.lines[0], id: "first" }, { ...v1.lines[0], id: "second", qty: 8 }] };
    expect(diff(before, { ...before, lines: [...before.lines].reverse() })).toEqual([]);
    expect(diff(before, { ...before, lines: [{ ...before.lines[1], qty: 9 }] })).toEqual([
      "PER760-XS2: quantity 8 to 9.", "Removed 4 x PER760-XS2.",
    ]);
  });
  it.each([
    ["their_ref", "RFQ-A", "RFQ-B", "Reference RFQ-A to RFQ-B."],
    ["quote_no", "Q-A", "Q-B", "Quotation number Q-A to Q-B."],
    ["prepared_by", "Uzair", "Khan", "Prepared by Uzair to Khan."],
  ])("includes changes to %s", (field, before, after, message) => {
    expect(diff({ ...v1, [field]: before }, { ...v1, [field]: after })).toEqual([message]);
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
