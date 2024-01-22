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

test("company assets list the clause versions and the policy", async ({ page }) => {
  await page.getByRole("link", { name: "Company assets" }).click();
  await expect(page.getByRole("heading", { name: "Clause library" })).toBeVisible();
  await expect(page.locator(".clause-versions li.retired")).toHaveCount(1);
  await expect(page.locator(".kv").last()).toContainText("Over 15%");
  await accessible(page);
});

test("phone width, no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/assets"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});
