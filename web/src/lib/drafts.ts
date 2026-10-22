import type { Draft, SavedVersion } from "./types";

// The draft being edited and the versions saved so far. Kept in this browser only (localStorage).

const DRAFT = "quote-desk:draft";
const VERSIONS = "quote-desk:versions";

const today = () => new Date().toISOString().slice(0, 10);

// A realistic starting point: a bank's server refresh, with four problems a check should catch.
export function exampleDraft(): Draft {
  return {
    quote_no: "Q-2026-0412",
    version: 1,
    customer_code: "GCB",
    their_ref: "RFQ-IT-2026-118",
    issue_date: today(),
    valid_days: 30,
    prepared_by: "Uzair Khan",
    approved_by: "",
    lines: [
      { part_number: "PER760-XS2", qty: 4, unit_price: "45900.00", discount_pct: "0" },
      { part_number: "VVF-CORE-1Y", qty: 8, unit_price: "620.00", discount_pct: "0" },
      { part_number: "PS-PRO-3Y-NBD", qty: 4, unit_price: "6100.00", discount_pct: "20" },
      { part_number: "SFP28-SR-25G", qty: 8, unit_price: "560.00", discount_pct: "0" },
    ],
    clauses: ["payment", "validity", "delivery", "warranty", "einvoice", "law"],
    clause_versions: { payment: 1 },
  };
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked: work continues for this visit
  }
}

export const drafts = {
  load: (): Draft => read(DRAFT, exampleDraft()),
  save: (d: Draft) => write(DRAFT, d),
  versions: (): SavedVersion[] => read(VERSIONS, []),
  addVersion: (v: SavedVersion) => write(VERSIONS, [...drafts.versions().filter((x) => x.draft.version !== v.draft.version), v]),
  reset: () => {
    try {
      localStorage.removeItem(DRAFT);
      localStorage.removeItem(VERSIONS);
    } catch {
      // nothing to clear
    }
  },
};
