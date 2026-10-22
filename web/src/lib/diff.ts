import type { Draft } from "./types";

// What changed between two versions of a quotation, line by line and term by term, in plain words.

const money = (s: string) => Number(s).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function diff(before: Draft, after: Draft): string[] {
  const out: string[] = [];
  const b = new Map(before.lines.map((l) => [l.part_number, l]));
  const a = new Map(after.lines.map((l) => [l.part_number, l]));
  for (const [part, l] of a) {
    const old = b.get(part);
    if (!old) {
      out.push(`Added ${l.qty} x ${part} at ${money(l.unit_price)}.`);
      continue;
    }
    if (old.qty !== l.qty) out.push(`${part}: quantity ${old.qty} to ${l.qty}.`);
    if (Number(old.unit_price) !== Number(l.unit_price)) out.push(`${part}: unit price ${money(old.unit_price)} to ${money(l.unit_price)}.`);
    if (Number(old.discount_pct || 0) !== Number(l.discount_pct || 0)) {
      out.push(`${part}: discount ${Number(old.discount_pct || 0)}% to ${Number(l.discount_pct || 0)}%.`);
    }
  }
  for (const [part, l] of b) if (!a.has(part)) out.push(`Removed ${l.qty} x ${part}.`);
  if (before.customer_code !== after.customer_code) out.push(`Customer ${before.customer_code} to ${after.customer_code}.`);
  if (before.valid_days !== after.valid_days) out.push(`Validity ${before.valid_days} to ${after.valid_days} days.`);
  if (before.issue_date !== after.issue_date) out.push(`Date ${before.issue_date} to ${after.issue_date}.`);
  for (const c of after.clauses) if (!before.clauses.includes(c)) out.push(`Clause "${c}" added.`);
  for (const c of before.clauses) if (!after.clauses.includes(c)) out.push(`Clause "${c}" removed.`);
  for (const c of after.clauses) {
    const vb = before.clause_versions[c];
    const va = after.clause_versions[c];
    if (vb !== va && before.clauses.includes(c)) out.push(`Clause "${c}": version ${vb ?? "in force"} to ${va ?? "in force"}.`);
  }
  if ((before.approved_by || "") !== (after.approved_by || "")) out.push(`Approval: ${after.approved_by || "removed"}.`);
  return out;
}
