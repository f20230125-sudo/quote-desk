import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { exampleDraft } from "./drafts";

afterEach(() => vi.unstubAllGlobals());

it("keeps browser quotation and line IDs out of API requests", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetch);
  const draft = exampleDraft();
  await api.check(draft);
  const payload = JSON.parse(fetch.mock.calls[0][1].body);
  expect(payload).not.toHaveProperty("quote_id");
  expect(payload.lines[0]).not.toHaveProperty("id");
  expect(payload.quote_no).toBe(draft.quote_no);
  expect(draft.quote_id).toBeTruthy();
});
