export interface Product {
  part_number: string;
  brand: string;
  description: string;
  category: string;
  list_price: string;
  cost: string;
  min_qty: number;
  lead_days: number;
  unit: string;
}

export interface Customer {
  code: string;
  name: string;
  trn: string | null;
  sector: string;
  address: string;
  emirate: string;
}

export interface ClauseVersion {
  v: number;
  from: string;
  to: string | null;
  text: string;
}

export interface Assets {
  brand: { wordmark: string; tagline: string; ink: string; rule: string; approved: string; note: string };
  clauses: { id: string; title: string; versions: ClauseVersion[] }[];
  policy: { margin_floor_pct: string; discount_approval_pct: string; default_valid_days: number; approver: string };
}

export interface Data {
  catalogue: Product[];
  customers: Customer[];
  company: { name: string; address: string; trn: string; phone: string; email: string; bank: string };
  assets: Assets;
}

export interface DraftLine {
  id?: string;
  part_number: string;
  qty: number;
  unit_price: string;
  discount_pct: string;
}

export interface Draft {
  quote_id?: string;
  quote_no: string;
  version: number;
  customer_code: string;
  their_ref: string;
  issue_date: string;
  valid_days: number;
  prepared_by: string;
  approved_by: string;
  lines: DraftLine[];
  clauses: string[];
  clause_versions: Record<string, number>;
}

export interface Checked {
  lines: {
    n: number;
    part_number: string;
    description: string;
    unit: string;
    qty: number;
    list_price: string;
    unit_price: string;
    discount_pct: string;
    net: string;
    cost: string;
    margin: string;
    margin_pct: string | null;
    lead_days: number;
  }[];
  subtotal: string;
  vat: string;
  total: string;
  margin: string;
  margin_pct: string | null;
  valid_until: string;
  longest_lead: number;
  clauses: { id: string; title: string; v: number; text: string; current_v: number | null }[];
  blocked: boolean;
  findings: { severity: "block" | "warn" | "note"; message: string; line: number | null }[];
}

export interface SavedVersion {
  draft: Draft;
  saved_at: string;
  total: string;
}
