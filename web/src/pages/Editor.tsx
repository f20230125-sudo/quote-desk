import { useEffect, useMemo, useRef, useState } from "react";
import { PencilRing } from "../components/Marks";
import { api, saveBlob } from "../lib/api";
import { diff } from "../lib/diff";
import { drafts, exampleDraft } from "../lib/drafts";
import type { Checked, Data, Draft, SavedVersion } from "../lib/types";

const fmt = (s: string | null | undefined) =>
  s == null ? "" : Number(s).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Mark({ severity }: { severity: "block" | "warn" | "note" }) {
  if (severity === "block") return <PencilRing variant={1} label="Blocks sending" />;
  return <span className={`mark-${severity}`} role="img" aria-label={severity === "warn" ? "Needs a look" : "Note"} />;
}

export function Editor({ data }: { data: Data }) {
  const [draft, setDraft] = useState<Draft>(drafts.load);
  const [result, setResult] = useState<{ draft: Draft; value: Checked } | null>(null);
  const checked = result?.draft === draft ? result.value : null;
  const [error, setError] = useState<string | null>(null);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [savedVersions, setVersions] = useState<SavedVersion[]>(drafts.versions);
  const versions = savedVersions.filter((v) => v.draft.quote_id === draft.quote_id);
  const [compare, setCompare] = useState<number | null>(null);
  const [busy, setBusy] = useState<"pdf" | "docx" | "save" | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const products = useMemo(() => new Map(data.catalogue.map((p) => [p.part_number, p])), [data]);

  useEffect(() => {
    let active = true;
    document.title = `${draft.quote_no} v${draft.version}: Quote Desk`;
    const saved = drafts.save(draft);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setDraftError(saved ? null : "The draft could not be saved in this browser. Keep this tab open and check browser storage.");
      setError(null);
      api
        .check(draft)
        .then((c) => {
          if (!active) return;
          setResult({ draft, value: c });
          setError(null);
        })
        .catch((e: Error) => {
          if (!active) return;
          setResult(null);
          setError(e.message);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer.current);
    };
  }, [draft, checkAttempt]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setLine = (i: number, patch: Partial<Draft["lines"][number]>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const blocks = checked?.findings.filter((f) => f.severity === "block").length ?? 0;
  const warns = checked?.findings.filter((f) => f.severity === "warn").length ?? 0;
  const byLine = (n: number) => checked?.findings.filter((f) => f.line === n) ?? [];

  const download = async (kind: "pdf" | "docx") => {
    setDownloadError(null);
    setBusy(kind);
    try {
      saveBlob(await api.file(draft, kind), `${draft.quote_no}-v${draft.version}.${kind}`);
    } catch (e) {
      setDownloadError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const saveVersion = async () => {
    if (!checked || busy) return;
    const v = { draft, saved_at: new Date().toISOString(), total: checked.total };
    setBusy("save");
    const failure = await drafts.addVersion(v);
    setBusy(null);
    if (failure) {
      setStorageError(failure);
      return;
    }
    setStorageError(null);
    const all = drafts.versions();
    setVersions(all);
    setDraft((d) => d.quote_id === draft.quote_id ? { ...d, version: Math.max(d.version, ...all.filter((x) => x.draft.quote_id === d.quote_id).map((x) => x.draft.version)) + 1 } : d);
  };
  const compared = compare !== null ? versions.find((v) => v.draft.version === compare) : null;

  return (
    <div className="page">
      <p className="caption">Quotation</p>
      <h1>
        <span className="mono">{draft.quote_no}</span> <span className="version">version {draft.version}</span>
      </h1>
      <p className="intro">Build an IT quotation, check prices and terms, then download a PDF or Word file. Demo data.</p>
      <p className="first-step">Start with the checks on this example, then edit the quotation. <a href="#checks-h">Review checks</a> · <a href="#lines-h">Edit lines</a></p>
      <p className="lede" aria-live="polite">
        {checked ? (
          <>
            AED {fmt(checked.total)} including VAT.{" "}
            {blocks === 0 && warns === 0
              ? "Nothing stops it going out."
              : `${blocks ? `${blocks} ${blocks === 1 ? "check blocks" : "checks block"} sending` : "Nothing blocks sending"}${warns ? `; ${warns} ${warns === 1 ? "needs" : "need"} a look` : ""}.`}
          </>
        ) : (
          error ? "Checks could not finish. Retry below." : "Checking prices and terms. Totals will appear here."
        )}
      </p>

      <div className="editor-grid">
        <form className="editor" onSubmit={(e) => e.preventDefault()}>
          <fieldset>
            <legend>Customer and dates</legend>
            <div className="row2">
              <label>
                <span>Customer</span>
                <select value={draft.customer_code} onChange={(e) => set("customer_code", e.target.value)}>
                  {data.customers.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Their reference</span>
                <input value={draft.their_ref} onChange={(e) => set("their_ref", e.target.value)} />
              </label>
            </div>
            <div className="row3">
              <label>
                <span>Date</span>
                <input type="date" value={draft.issue_date} onChange={(e) => set("issue_date", e.target.value)} />
              </label>
              <label>
                <span>Valid for (days)</span>
                <input type="number" min={1} max={180} value={draft.valid_days} onChange={(e) => set("valid_days", Number(e.target.value) || 1)} />
              </label>
              <label>
                <span>Quotation number</span>
                <input className="mono" value={draft.quote_no} onChange={(e) => set("quote_no", e.target.value)} />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend id="lines-h" tabIndex={-1}>Lines</legend>
            <p className="field-hint">Prices and amounts in AED. Margin is internal.</p>
            <table className="lines" role="table" aria-label="Quotation lines">
              <thead>
                <tr>
                  <th scope="col">Part</th>
                  <th scope="col" className="num">
                    Qty
                  </th>
                  <th scope="col" className="num">
                    Unit price
                  </th>
                  <th scope="col" className="num">
                    Disc. %
                  </th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col" className="num">
                    Margin <span className="quiet">(internal)</span>
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((l, i) => {
                  const c = checked?.lines.find((x) => x.n === i + 1);
                  const issues = byLine(i + 1);
                  return [
                    <tr key={l.id} role="row" className={issues.some((f) => f.severity === "block") ? "blocked" : ""}>
                      <td role="cell">
                        <span className="mobile-label" aria-hidden="true">Line {i + 1} part</span>
                        <select
                          className="mono"
                          aria-label={`Line ${i + 1} part`}
                          value={l.part_number}
                          onChange={(e) => setLine(i, { part_number: e.target.value, unit_price: products.get(e.target.value)?.list_price ?? l.unit_price })}
                        >
                          {data.catalogue.map((p) => (
                            <option key={p.part_number} value={p.part_number}>
                              {p.part_number}
                            </option>
                          ))}
                        </select>
                        <span className="sub">{products.get(l.part_number)?.description}</span>
                      </td>
                      <td className="num" role="cell">
                        <span className="mobile-label" aria-hidden="true">Quantity</span>
                        <input aria-label={`Line ${i + 1} quantity`} inputMode="numeric" value={l.qty}
                          onChange={(e) => setLine(i, { qty: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) })} />
                      </td>
                      <td className="num" role="cell">
                        <span className="mobile-label" aria-hidden="true">Unit price (AED)</span>
                        <input aria-label={`Line ${i + 1} unit price`} inputMode="decimal" value={l.unit_price}
                          onChange={(e) => setLine(i, { unit_price: e.target.value })} />
                      </td>
                      <td className="num" role="cell">
                        <span className="mobile-label" aria-hidden="true">Discount %</span>
                        <input aria-label={`Line ${i + 1} discount percent`} inputMode="decimal" value={l.discount_pct}
                          onChange={(e) => setLine(i, { discount_pct: e.target.value || "0" })} />
                      </td>
                      <td className="num figure" role="cell"><span className="mobile-label" aria-hidden="true">Amount (AED)</span>{c ? fmt(c.net) : "Pending"}</td>
                      <td className="num figure quiet" role="cell"><span className="mobile-label" aria-hidden="true">Margin (internal)</span>{c?.margin_pct != null ? `${Number(c.margin_pct)}%` : c ? "Not available" : "Pending"}</td>
                      <td role="cell">
                        <button type="button" className="link" aria-label={`Remove line ${i + 1}`}
                          onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((_, j) => j !== i) }))}>
                          Remove
                        </button>
                      </td>
                    </tr>,
                    ...issues.map((f, k) => (
                      <tr key={`f${l.id}-${k}`} className={`line-issue ${f.severity}`}>
                        <td colSpan={7}>
                          <Mark severity={f.severity} /> {sentence(f.message.replace(/^Line \d+: /, ""))}
                        </td>
                      </tr>
                    )),
                  ];
                })}
              </tbody>
            </table>
            {draft.lines.length === 0 && <p className="quiet">No lines yet. Add a line to choose a product and enter its quantity and price.</p>}
            <button type="button" className="link add"
              onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, { id: crypto.randomUUID(), part_number: data.catalogue[0].part_number, qty: 1, unit_price: data.catalogue[0].list_price, discount_pct: "0" }] }))}>
              Add a line
            </button>
          </fieldset>

          <fieldset>
            <legend>Terms</legend>
            <ul className="clauses">
              {data.assets.clauses.map((c) => {
                const on = draft.clauses.includes(c.id);
                const shown = checked?.clauses.find((x) => x.id === c.id);
                return (
                  <li key={c.id}>
                    <label className="check">
                      <input type="checkbox" checked={on}
                        onChange={(e) => set("clauses", e.target.checked ? [...draft.clauses, c.id] : draft.clauses.filter((x) => x !== c.id))} />
                      <strong>{c.title}</strong>
                    </label>
                    {on && c.versions.length > 1 && (
                      <select aria-label={`${c.title} version`} value={draft.clause_versions[c.id] ?? ""}
                        onChange={(e) => {
                          const { [c.id]: _drop, ...rest } = draft.clause_versions;
                          set("clause_versions", e.target.value ? { ...rest, [c.id]: Number(e.target.value) } : rest);
                        }}>
                        <option value="">Version in force</option>
                        {c.versions.map((v) => (
                          <option key={v.v} value={v.v}>
                            Version {v.v}
                            {v.to ? ` (until ${longDate(v.to)})` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    {on && shown && <p className="clause-text">{shown.text}</p>}
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <fieldset>
            <legend>People</legend>
            <div className="row2">
              <label>
                <span>Prepared by</span>
                <input value={draft.prepared_by} onChange={(e) => set("prepared_by", e.target.value)} />
              </label>
              <label>
                <span>Discount approved by</span>
                <input value={draft.approved_by} aria-describedby="approval-hint"
                  onChange={(e) => set("approved_by", e.target.value)} />
                <span className="field-hint" id="approval-hint">Needed for discounts above {data.assets.policy.discount_approval_pct}%.</span>
              </label>
            </div>
          </fieldset>
        </form>

        <aside className="side" aria-labelledby="checks-h">
          <h2 id="checks-h" tabIndex={-1}>Before it goes out</h2>
          {(error || downloadError || storageError || draftError) && (
            <p className="form-error" role="alert">
              {error || downloadError || storageError || draftError}
            </p>
          )}
          {error && <button type="button" className="button" onClick={() => { setError(null); setCheckAttempt((n) => n + 1); }}>Retry checks</button>}
          {!checked && !error && <p className="quiet" role="status">Checking the current quotation. Totals and findings will appear here.</p>}
          {checked && checked.findings.length === 0 && <p>Every check passes.</p>}
          <ul className="findings">
            {checked?.findings.map((f, i) => (
              <li key={i} className={f.severity}>
                <Mark severity={f.severity} />
                <span><strong className="finding-label">{f.severity === "block" ? "Blocks sending" : f.severity === "warn" ? "Review" : "Note"}</strong>{f.message}</span>
              </li>
            ))}
          </ul>
          {checked && (
            <dl className="totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{fmt(checked.subtotal)}</dd>
              </div>
              <div>
                <dt>VAT 5%</dt>
                <dd>{fmt(checked.vat)}</dd>
              </div>
              <div className="grand">
                <dt>Total AED</dt>
                <dd>{fmt(checked.total)}</dd>
              </div>
              <div className="internal">
                <dt>Margin (internal)</dt>
                <dd>
                  {fmt(checked.margin)} {checked.margin_pct != null && `(${Number(checked.margin_pct)}%)`}
                </dd>
              </div>
              <div className="internal">
                <dt>Valid until</dt>
                <dd>{longDate(checked.valid_until)}</dd>
              </div>
            </dl>
          )}
          <h2 className="side-section">Download files</h2>
          <div className="actions" aria-busy={busy === "pdf" || busy === "docx"}>
            <button type="button" className={`button${checked && !checked.blocked ? " primary" : ""}`} disabled={busy !== null} onClick={() => void download("pdf")}>
              {busy === "pdf" ? "Preparing PDF..." : checked?.blocked ? "Download draft PDF" : "Download PDF"}
            </button>
            <button type="button" className="button" disabled={busy !== null} onClick={() => void download("docx")}>
              {busy === "docx" ? "Preparing Word file..." : "Download Word file"}
            </button>
          </div>
          {checked?.blocked && <p className="quiet small">A quotation a check still blocks is marked DRAFT on every page.</p>}

          <h2 id="versions-h" className="side-section">Versions</h2>
          <p className="quiet small">Draft edits save automatically in this browser. Save a version to keep a snapshot for comparison.</p>
          <button type="button" className="button" disabled={!checked || busy !== null} onClick={() => void saveVersion()}>
            {busy === "save" ? "Saving version..." : `Save as version ${draft.version}`}
          </button>
          {versions.length === 0 ? (
            <p className="quiet small">None saved yet. Save one to compare later changes against it.</p>
          ) : (
            <ul className="versions" aria-labelledby="versions-h">
              {[...versions].sort((a, b) => b.draft.version - a.draft.version).map((v) => (
                <li key={v.draft.version}>
                  <span>
                    Version {v.draft.version} <span className="quiet small">AED {fmt(v.total)}</span>
                  </span>
                  <button type="button" className="link" aria-pressed={compare === v.draft.version}
                    onClick={() => setCompare(compare === v.draft.version ? null : v.draft.version)}>
                    {compare === v.draft.version ? "Hide changes" : "What changed since"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {compared && (
            <div className="diff">
              <p className="small">
                <strong>
                  Version {compared.draft.version} to the current draft (version {draft.version})
                </strong>
              </p>
              {(() => {
                const d = diff(compared.draft, draft);
                return d.length ? (
                  <ul>
                    {d.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="quiet small">No changes.</p>
                );
              })()}
            </div>
          )}
          <p className="small">
            <button type="button" className="link" onClick={() => {
              drafts.reset();
              setVersions([]);
              setCompare(null);
              setDraft(exampleDraft());
            }}>
              Start again from the example
            </button>
          </p>
        </aside>
      </div>
    </div>
  );
}
