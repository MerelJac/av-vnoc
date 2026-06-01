import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "merelbjacobs@gmail.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Testingtest";

const ROUTES = [
  "/dashboard",
  "/alerts",
  "/tickets",
  "/customers",
  "/devices",
  "/rooms",
  "/settings",
  "/profile",
  "/users",
];

async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

test("all main routes load without console errors or failed requests", async ({ page }) => {
  test.setTimeout(120_000);
  const problems: string[] = [];

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") problems.push(`[console:${page.url()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`[pageerror:${page.url()}] ${err.message}`));
  page.on("response", (res) => {
    const url = res.url();
    // Ignore Next.js HMR/dev noise and favicon
    if (res.status() >= 500 && !url.includes("__nextjs") && !url.includes("favicon")) {
      problems.push(`[http ${res.status()}] ${url}`);
    }
  });

  await login(page);

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    // Page should not show Next.js error overlay
    await expect(page.locator("text=Unhandled Runtime Error")).toHaveCount(0);
    await expect(page.locator("text=Application error")).toHaveCount(0);
    await page.waitForTimeout(400);
  }

  if (problems.length) {
    console.log("\n=== RUNTIME PROBLEMS ===\n" + problems.join("\n") + "\n");
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
