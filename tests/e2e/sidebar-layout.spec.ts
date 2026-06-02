import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "merelbjacobs@gmail.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Testingtest";

async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

// Regression guard: the persistent sidebar must never overlap main content
// at desktop widths (the bug was a 768px breakpoint dropping ~700px windows
// into an overlay drawer that covered the page).
for (const width of [640, 700, 768, 1024, 1440]) {
  test(`sidebar does not overlap content @ ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    const aside = await page.locator("aside").first().boundingBox();
    const main = await page.locator("main").first().boundingBox();
    expect(aside, "aside present").not.toBeNull();
    expect(main, "main present").not.toBeNull();

    const position = await page.locator("aside").first().evaluate((el) => getComputedStyle(el).position);
    expect(position, "sidebar is in-flow at desktop widths").toBe("static");

    const overlap = aside!.x + aside!.width - main!.x;
    expect(overlap, "sidebar right edge does not cross main left edge").toBeLessThanOrEqual(1);
  });
}

test("below 640px the sidebar is an off-canvas drawer (closed by default)", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await login(page);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const aside = await page.locator("aside").first().boundingBox();
  // Drawer is translated off-screen to the left when closed.
  expect(aside!.x).toBeLessThan(0);
});
