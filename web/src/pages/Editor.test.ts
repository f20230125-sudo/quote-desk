import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { Editor } from "./Editor";
import { exampleDraft } from "../lib/drafts";
import type { Data } from "../lib/types";

afterEach(() => vi.unstubAllGlobals());

it("shows saved history and number changes after renaming and reloading", () => {
  const first = { ...exampleDraft(), quote_id: "stable-quotation" };
  const current = { ...first, quote_no: "Q-RENAMED", version: 2 };
  const values = {
    "quote-desk:draft": JSON.stringify(current),
    "quote-desk:versions": JSON.stringify([{ draft: first, saved_at: "2026-10-22T00:00:00Z", total: "100.00" }]),
  };
  vi.stubGlobal("localStorage", { getItem: (key: keyof typeof values) => values[key] ?? null });
  const data = { catalogue: [], customers: [], assets: { clauses: [], policy: { discount_approval_pct: "15" } } } as unknown as Data;
  const html = renderToStaticMarkup(createElement(Editor, { data }));
  expect(html).toContain("Q-RENAMED");
  expect(html).toContain("What changed since");
});
