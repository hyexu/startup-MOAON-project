import { expect, test } from "@playwright/test";

test("privacy page explains AI processing in plain words", async ({ page }) => {
  await page.goto("/privacy");
  for (const t of ["AI 학습에 쓰지 않습니다", "마인드로직", "Anthropic", "Soniox", "Google", "내려받기", "지워"]) {
    await expect(page.getByText(t, { exact: false }).first()).toBeVisible();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const size = await page.locator("main p").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(20);
});
