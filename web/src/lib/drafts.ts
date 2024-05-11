import type { Draft, SavedVersion } from "./types";

// The draft being edited and the versions saved so far. Kept in this browser only (localStorage).

const DRAFT = "quote-desk:draft";
const VERSIONS = "quote-desk:versions";
const SNAPSHOT = "quote-desk:version:";

const today = () => new Date().toISOString().slice(0, 10);

// A realistic starting point: a bank's server refresh, with four problems a check should catch.
export function exampleDraft(): Draft {
  return withLineIds({
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
  });
}

export function withLineIds(d: Draft): Draft {
  const counts = new Map<string, number>();
  return { ...d, lines: d.lines.map((l) => {
    const n = (counts.get(l.part_number) ?? 0) + 1;
    counts.set(l.part_number, n);
    return { ...l, id: l.id ?? `legacy:${l.part_number}:${n}` };
  }) };
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
    return true;
  } catch {
    return false;
  }
}

function versions(): SavedVersion[] {
  const old = JSON.parse(localStorage.getItem(VERSIONS) ?? "[]") as SavedVersion[];
  const keys = Object.keys(localStorage).filter((key) => key.startsWith(SNAPSHOT));
  return [...old, ...keys.map((key) => JSON.parse(localStorage.getItem(key)!) as SavedVersion)]
    .map((v) => ({ ...v, draft: withLineIds(v.draft) }));
}

export const drafts = {
  load: (): Draft => withLineIds(read(DRAFT, exampleDraft())),
  save: (d: Draft) => write(DRAFT, d),
  versions: (): SavedVersion[] => {
    try {
      return versions();
    } catch {
      return [];
    }
  },
  addVersion: async (v: SavedVersion): Promise<string | null> => {
    const save = () => {
      if (versions().some((x) => x.draft.quote_no === v.draft.quote_no && x.draft.version === v.draft.version)) {
        return "This quotation version is already saved. Continue in the tab that saved it or change the quotation number.";
      }
      return write(`${SNAPSHOT}${crypto.randomUUID()}`, v) ? null : "The version could not be saved. Check browser storage and try again.";
    };
    try {
      return navigator.locks ? await navigator.locks.request(VERSIONS, save) : save();
    } catch {
      // storage blocked: work continues for this visit
    }
    return "The version could not be saved. Check browser storage and try again.";
  },
  reset: () => {
    try {
      localStorage.removeItem(DRAFT);
      localStorage.removeItem(VERSIONS);
      for (const key of Object.keys(localStorage)) if (key.startsWith(SNAPSHOT)) localStorage.removeItem(key);
    } catch {
      // nothing to clear
    }
  },
};
