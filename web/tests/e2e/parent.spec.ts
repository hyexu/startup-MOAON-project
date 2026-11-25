import { expect, test, type Page } from "@playwright/test";

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("demo: consent, answer once, end the day", async ({ page }) => {
  await page.goto("/r?demo=1");
  await expect(page.getByText("체험 화면입니다. 아무것도 저장되지 않아요.")).toBeVisible();
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "동의합니다" }).click();
  await page.getByRole("button", { name: "동의합니다" }).click();
  await page.getByRole("button", { name: "마이크 켜기" }).click();

  const q1 = page.locator(".question");
  await expect(q1).toContainText("어릴 적 살던 집");
  const first = await q1.textContent();
  const speak = page.getByRole("button", { name: "● 말하기" });
  expect((await speak.boundingBox())!.height).toBeGreaterThanOrEqual(64);
  await noSideScroll(page);

  await speak.click();
  await expect(page.getByText("듣고 있어요")).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "■ 다 했어요" }).click();
  await expect(page.getByText("잘 들었어요. 잠시만요…")).toBeVisible();
  await expect(page.locator(".question")).not.toHaveText(first!, { timeout: 10_000 });

  await page.getByRole("button", { name: "오늘은 여기까지" }).click();
  await expect(page.getByText("언제든 이 링크를 다시 누르시면")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("도움이 필요하시면 전화 주세요")).toBeVisible();
});

test.describe("inside KakaoTalk", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36 KAKAOTALK 10.8.1" });
  test("shows how to open another browser instead of a dead end", async ({ page }) => {
    await page.goto("/r?demo=1");
    await page.getByRole("button", { name: "시작하기" }).click();
    await page.getByRole("button", { name: "동의합니다" }).click();
    await page.getByRole("button", { name: "동의합니다" }).click();
    await page.getByRole("button", { name: "마이크 켜기" }).click();
    await expect(page.getByText("카카오톡 안에서는 녹음이 안 될 수 있어요.")).toBeVisible();
    await page.getByRole("button", { name: "여기서 그냥 해 볼게요" }).click();
    await expect(page.locator(".question")).toBeVisible();
  });
});

test("a link without a token says it cannot be used", async ({ page }) => {
  await page.goto("/r");
  await expect(page.getByText("링크가 더 이상 쓸 수 없어요.")).toBeVisible();
});
