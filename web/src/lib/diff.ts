import type { Draft } from "./types";
import { withLineIds } from "./drafts";

// What changed between two versions of a quotation, line by line and term by term, in plain words.

const money = (s: string) => Number(s).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function diff(before: Draft, after: Draft): string[] {
  const out: string[] = [];
  const b = new Map(withLineIds(before).lines.map((l) => [l.id, l]));
  const a = new Map(withLineIds(after).lines.map((l) => [l.id, l]));
  for (const [id, l] of a) {
    const part = l.part_number;
    const old = b.get(id);
    if (!old) {
      out.push(`Added ${l.qty} x ${part} at ${money(l.unit_price)}.`);
      continue;
    }
    if (old.part_number !== part) out.push(`Part ${old.part_number} to ${part}.`);
    if (old.qty !== l.qty) out.push(`${part}: quantity ${old.qty} to ${l.qty}.`);
    if (Number(old.unit_price) !== Number(l.unit_price)) out.push(`${part}: unit price ${money(old.unit_price)} to ${money(l.unit_price)}.`);
    if (Number(old.discount_pct || 0) !== Number(l.discount_pct || 0)) {
      out.push(`${part}: discount ${Number(old.discount_pct || 0)}% to ${Number(l.discount_pct || 0)}%.`);
    }
  }
  for (const [id, l] of b) if (!a.has(id)) out.push(`Removed ${l.qty} x ${l.part_number}.`);
  if (before.quote_no !== after.quote_no) out.push(`Quotation number ${before.quote_no} to ${after.quote_no}.`);
  if (before.their_ref !== after.their_ref) out.push(`Reference ${before.their_ref || "-"} to ${after.their_ref || "-"}.`);
  if (before.prepared_by !== after.prepared_by) out.push(`Prepared by ${before.prepared_by || "-"} to ${after.prepared_by || "-"}.`);
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
