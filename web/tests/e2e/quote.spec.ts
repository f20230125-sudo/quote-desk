import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function accessible(page: Page) {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(r.violations.map((v) => `${scheme}: ${v.id}`)).toEqual([]);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator(".lede")).toContainText("AED");
});

test("the example quotation shows what blocks it", async ({ page }) => {
  await expect(page.locator(".lede")).toHaveText("AED 223,188.00 including VAT. 2 checks block sending; 2 need a look.");
  await expect(page.locator(".findings li")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Download draft PDF" })).toBeVisible();
  await accessible(page);
});

test("fixing the problems clears the checks", async ({ page }) => {
  await page.getByLabel("Line 2 quantity").fill("16");
  await page.getByLabel("Discount approved by").fill("R. Menon");
  await page.getByLabel("Line 4 unit price").fill("640.00");
  await page.getByLabel("Payment version").selectOption("");
  await expect(page.locator(".lede")).toContainText("Nothing stops it going out.");
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeVisible();
});

test("the PDF and the Word file download", async ({ page }) => {
  let download = page.waitForEvent("download");
  await page.getByRole("button", { name: /PDF/ }).click();
  expect((await download).suggestedFilename()).toBe("Q-2026-0412-v1.pdf");
  download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Word file" }).click();
  expect((await download).suggestedFilename()).toBe("Q-2026-0412-v1.docx");
});

test("saving a version and seeing what changed since", async ({ page }) => {
  await page.getByRole("button", { name: "Save as version 1" }).click();
  await expect(page.locator("h1")).toContainText("version 2");
  await page.getByLabel("Line 1 unit price").fill("44900.00");
  await page.getByRole("button", { name: "What changed since" }).click();
  await expect(page.locator(".diff")).toContainText("PER760-XS2: unit price 45,900.00 to 44,900.00.");
});

test("a second tab cannot replace a saved quotation version", async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".lede")).toContainText("AED");
  await other.getByLabel("Their reference").fill("SECOND-TAB");
  await expect(other.getByRole("button", { name: "Save as version 1" })).toBeEnabled();
  await page.getByRole("button", { name: "Save as version 1" }).click();
  await expect(page.locator("h1")).toContainText("version 2");
  await other.getByRole("button", { name: "Save as version 1" }).click();
  await expect(other.getByRole("alert")).toContainText("already saved");
  await expect(other.locator("h1")).toContainText("version 1");
  await page.reload();
  await page.getByLabel("Their reference").fill("SECOND-TAB");
  await page.getByRole("button", { name: "What changed since" }).click();
  await expect(page.locator(".diff")).toContainText("Reference RFQ-IT-2026-118 to SECOND-TAB.");
});

test("different quotations keep their own version one", async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".lede")).toContainText("AED");
  await other.getByLabel("Quotation number").fill("Q-OTHER");
  await expect(other.getByRole("button", { name: "Save as version 1" })).toBeEnabled();
  await page.getByRole("button", { name: "Save as version 1" }).click();
  await other.getByRole("button", { name: "Save as version 1" }).click();
  await page.reload();
  await expect(page.getByRole("list", { name: "Versions" })).toContainText("Version 1");
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("quote-desk:version:")).length)).toBe(2);
});

test("simultaneous saves in two tabs keep one immutable version", async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".lede")).toContainText("AED");
  await other.getByLabel("Their reference").fill("OTHER-TAB");
  await expect(other.getByRole("button", { name: "Save as version 1" })).toBeEnabled();
  await Promise.all([
    page.getByRole("button", { name: "Save as version 1" }).click(),
    other.getByRole("button", { name: "Save as version 1" }).click(),
  ]);
  await expect.poll(async () => (await page.locator("h1").textContent())! + (await other.locator("h1").textContent())!).toContain("version 2");
  const failed = (await page.locator("h1").textContent())!.includes("version 1") ? page : other;
  await expect(failed.getByRole("alert")).toContainText("already saved");
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("quote-desk:version:")).length)).toBe(1);
});

test("saving waits for checks of the current draft", async ({ page }) => {
  await page.clock.install();
  await page.getByLabel("Line 1 unit price").fill("44900.00");
  const save = page.getByRole("button", { name: "Save as version 1" });
  await expect(save).toBeDisabled();
  await page.clock.runFor(300);
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole("list", { name: "Versions" })).toContainText("218,988.00");
});

test("an older response cannot replace newer checks", async ({ page }) => {
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const requested = new Promise<void>((resolve) => { started = resolve; });
  await page.route("**/api/quote/check", async (route) => {
    const response = await route.fetch();
    if (route.request().postDataJSON().lines[0].unit_price === "44900.00") {
      started();
      await held;
    }
    await route.fulfill({ response });
  });
  await page.getByLabel("Line 1 unit price").fill("44900.00");
  await requested;
  await page.getByLabel("Line 1 unit price").fill("43900.00");
  await expect(page.locator(".lede")).toContainText("214,788.00");
  const response = page.waitForResponse((r) => r.url().endsWith("/api/quote/check") && r.request().postDataJSON().lines[0].unit_price === "44900.00");
  release();
  await response;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator(".lede")).toContainText("214,788.00");
});

test("a failed check clears the previous success", async ({ page }) => {
  await page.route("**/api/quote/check", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), findings: [], blocked: false } });
  });
  await page.reload();
  await expect(page.getByText("Every check passes.")).toBeVisible();
  await page.route("**/api/quote/check", (route) => route.fulfill({ status: 400, json: { error: { message: "Some values need a look." } } }));
  await page.getByLabel("Line 1 unit price").fill("invalid");
  await expect(page.getByRole("alert")).toContainText("Some values need a look.");
  await expect(page.getByText("Every check passes.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save as version 1" })).toBeDisabled();
});

test("a failed version write is visible and leaves the version unchanged", async ({ page }) => {
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("quote-desk:version")) throw new DOMException("Full", "QuotaExceededError");
      setItem.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Save as version 1" }).click();
  await expect(page.getByRole("alert")).toContainText("could not be saved");
  await expect(page.locator("h1")).toContainText("version 1");
  await page.getByLabel("Their reference").fill("STILL-EDITING");
  await expect(page.locator(".lede")).toContainText("AED");
  await expect(page.locator("h1")).toContainText("version 1");
});

test("blocked draft storage is reported while editing continues", async ({ page }) => {
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Blocked", "SecurityError"); };
  });
  await page.getByLabel("Their reference").fill("UNSAVED");
  await expect(page.getByRole("alert")).toContainText("draft could not be saved");
  await expect(page.locator(".lede")).toContainText("AED");
  await expect(page.getByLabel("Their reference")).toHaveValue("UNSAVED");
});

test("duplicate rows keep their identity after saving, removal and reload", async ({ page }) => {
  await page.getByRole("button", { name: "Add a line" }).click();
  await page.getByLabel("Line 5 part").selectOption("SFP28-SR-25G");
  await page.getByRole("button", { name: "Save as version 1" }).click();
  await page.getByLabel("Line 4 quantity").fill("100");
  await page.getByRole("button", { name: "What changed since" }).click();
  await expect(page.locator(".diff")).toContainText("SFP28-SR-25G: quantity 8 to 100.");
  await page.getByRole("button", { name: "Remove line 4" }).click();
  await page.reload();
  await page.getByRole("button", { name: "What changed since" }).click();
  await expect(page.locator(".diff")).toContainText("Removed 8 x SFP28-SR-25G.");
  await expect(page.locator(".diff")).not.toContainText("quantity");
});

test("versions saved before line IDs were added remain comparable", async ({ page }) => {
  await page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem("quote-desk:draft")!);
    draft.lines = draft.lines.map(({ id: _id, ...line }: { id?: string }) => line);
    localStorage.setItem("quote-desk:versions", JSON.stringify([{ draft, saved_at: "2026-10-22T00:00:00Z", total: "223188.00" }]));
    localStorage.setItem("quote-desk:draft", JSON.stringify({ ...draft, version: 2 }));
  });
  await page.reload();
  await page.getByLabel("Line 1 unit price").fill("44900.00");
  await page.getByRole("button", { name: "What changed since" }).click();
  await expect(page.locator(".diff")).toContainText("PER760-XS2: unit price 45,900.00 to 44,900.00.");
  await page.getByRole("button", { name: "Save as version 2" }).click();
  await page.reload();
  await expect(page.getByRole("list", { name: "Versions" }).getByRole("listitem")).toHaveCount(2);
});

test("company assets list the clause versions and the policy", async ({ page }) => {
  await page.getByRole("link", { name: "Company assets" }).click();
  await expect(page.getByRole("heading", { name: "Clause library" })).toBeVisible();
  await expect(page.locator(".clause-versions li.retired")).toHaveCount(1);
  await expect(page.locator(".kv").last()).toContainText("Over 15%");
  await accessible(page);
});

test("phone width, no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/company"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});
