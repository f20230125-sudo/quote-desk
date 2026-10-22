import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drafts, exampleDraft } from "./drafts";
import { diff } from "./diff";

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); Object.defineProperty(storage, key, { value, configurable: true, enumerable: true }); },
    removeItem: (key: string) => { values.delete(key); Reflect.deleteProperty(storage, key); },
  };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("navigator", {});
});

const saved = (draft = exampleDraft()) => ({ draft, saved_at: "2026-10-22T00:00:00Z", total: "100.00" });

describe("quotation numbers in browser storage", () => {
  it.each([" Q-TEST ", "\u0085Q-TEST\u0085", "\u00a0Q-TEST\u2003"])("normalizes %j before storing and detecting a conflict", async (number) => {
    const first = { ...exampleDraft(), quote_no: number };
    expect(drafts.save(first)).toBe(true);
    expect(JSON.parse(localStorage.getItem("quote-desk:draft")!).quote_no).toBe("Q-TEST");
    expect(await drafts.addVersion(saved(first))).toBeNull();
    expect(drafts.versions()[0].draft.quote_no).toBe("Q-TEST");
    expect(await drafts.addVersion(saved({ ...exampleDraft(), quote_no: "Q-TEST" }))).toContain("already saved");
  });

  it("normalizes legacy numbers on load and preserves backend-significant characters", async () => {
    const draft = { ...exampleDraft(), quote_no: "\u0085Q-TEST " };
    localStorage.setItem("quote-desk:draft", JSON.stringify(draft));
    localStorage.setItem("quote-desk:versions", JSON.stringify([saved(draft)]));
    expect(drafts.load().quote_no).toBe("Q-TEST");
    expect(drafts.versions()[0].draft.quote_no).toBe("Q-TEST");
    const distinct = { ...exampleDraft(), quote_no: "\ufeffQ-TEST\ufeff" };
    expect(await drafts.addVersion(saved(distinct))).toBeNull();
    expect(drafts.versions()[1].draft.quote_no).toBe(distinct.quote_no);
    expect(diff(draft, { ...draft, quote_no: "Q-TEST" })).toEqual([]);
  });

  it("detects a normalized number conflict against a legacy snapshot", async () => {
    const legacy = { ...exampleDraft(), quote_no: "\u0085Q-TEST " };
    localStorage.setItem("quote-desk:versions", JSON.stringify([saved(legacy)]));
    expect(await drafts.addVersion(saved({ ...exampleDraft(), quote_no: "Q-TEST" }))).toContain("already saved");
  });
});

describe("quotation identity", () => {
  it("keeps a stable ID through renaming, saving and reloading", async () => {
    const first = exampleDraft();
    expect(first.quote_id).toBeTruthy();
    expect(exampleDraft().quote_id).not.toBe(first.quote_id);
    expect(await drafts.addVersion(saved(first))).toBeNull();
    const renamed = { ...first, quote_no: "Q-RENAMED", version: 2 };
    drafts.save(renamed);
    expect(drafts.load().quote_id).toBe(first.quote_id);
    expect(await drafts.addVersion(saved(renamed))).toBeNull();
    expect(drafts.versions().every((v) => v.draft.quote_id === first.quote_id)).toBe(true);
    expect(await drafts.addVersion(saved({ ...renamed, quote_no: "Q-AGAIN" }))).toContain("already saved");
  });

  it("links legacy drafts and snapshots by normalized number before the first rename", () => {
    const { quote_id: _id, ...legacy } = exampleDraft();
    localStorage.setItem("quote-desk:draft", JSON.stringify({ ...legacy, quote_no: " Q-TEST " }));
    localStorage.setItem("quote-desk:versions", JSON.stringify([saved({ ...legacy, quote_no: "Q-TEST" })]));
    const loaded = drafts.load();
    expect(loaded.quote_id).toBeTruthy();
    expect(loaded.quote_id).toBe(drafts.versions()[0].draft.quote_id);
    drafts.save({ ...loaded, quote_no: "Q-RENAMED" });
    expect(drafts.load().quote_id).toBe(drafts.versions()[0].draft.quote_id);
  });
});
