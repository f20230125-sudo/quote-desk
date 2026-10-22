import { useEffect } from "react";
import { drafts } from "../lib/drafts";
import type { Data } from "../lib/types";

const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// The company's approved pieces every document is built from: brand, letterhead details, clauses with their
// versions, and the commercial policy the checks enforce.
export function Assets({ data }: { data: Data }) {
  useEffect(() => {
    document.title = "Company assets: Quote Desk";
  }, []);
  const { brand, clauses, policy } = data.assets;
  const saved = drafts.versions();
  const usedIn = (id: string) => saved.filter((v) => v.draft.clauses.includes(id)).length;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="page">
      <h1>Company assets</h1>
      <p className="lede">The letterhead, clause versions and commercial policy used by every quotation. This demo shows them for reference.</p>

      <section aria-labelledby="brand-h">
        <h2 id="brand-h">Brand and letterhead</h2>
        <div className="brand-sheet">
          <p className="wordmark-sample">
            <span>{brand.wordmark}</span> {brand.tagline}
          </p>
          <dl className="kv">
            <dt>Company</dt>
            <dd>{data.company.name}</dd>
            <dt>Address</dt>
            <dd>{data.company.address}</dd>
            <dt>TRN</dt>
            <dd className="mono">{data.company.trn}</dd>
            <dt>Email</dt>
            <dd>{data.company.email}</dd>
            <dt>Bank (footer)</dt>
            <dd>{data.company.bank}</dd>
            <dt>Rule</dt>
            <dd>{brand.note} Approved {longDate(brand.approved)}.</dd>
          </dl>
        </div>
      </section>

      <section aria-labelledby="clauses-h">
        <h2 id="clauses-h">Clause library</h2>
        <p className="quiet">Each clause keeps its versions. A quotation uses the version in force on its date unless it says otherwise; the checks flag an old one.</p>
        <ul className="library">
          {clauses.map((c) => (
            <li key={c.id}>
              <h3>
                {c.title} <span className="quiet small mono">{c.id}</span>
              </h3>
              <ol className="clause-versions">
                {c.versions.map((v) => {
                  const inForce = v.from <= today && (v.to === null || today <= v.to);
                  return (
                    <li key={v.v} className={inForce ? "in-force" : "retired"}>
                      <p className="small">
                        <strong>Version {v.v}</strong> {inForce ? "in force" : v.from > today ? "not yet in force" : "retired"}:{" "}
                        {longDate(v.from)}
                        {v.to ? ` to ${longDate(v.to)}` : " onwards"}
                      </p>
                      <p>{v.text}</p>
                    </li>
                  );
                })}
              </ol>
              <p className="quiet small">In {usedIn(c.id)} of {saved.length} saved versions in this browser.</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="policy-h">
        <h2 id="policy-h">Commercial policy the checks enforce</h2>
        <dl className="kv">
          <dt>Margin floor</dt>
          <dd>{policy.margin_floor_pct}% (below it: a warning; below cost: blocked)</dd>
          <dt>Discount needing approval</dt>
          <dd>Over {policy.discount_approval_pct}%, by the {policy.approver}</dd>
          <dt>Default validity</dt>
          <dd>{policy.default_valid_days} days</dd>
          <dt>Pack sizes and minimums</dt>
          <dd>
            {data.catalogue
              .filter((p) => p.min_qty > 1)
              .map((p) => `${p.part_number} from ${p.min_qty} ${p.unit}s`)
              .join("; ")}
            .
          </dd>
        </dl>
      </section>
    </div>
  );
}
