import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "merelbjacobs@gmail.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Testingtest";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

test.describe("authentication", () => {
  test("valid credentials land on the dashboard", async ({ page }) => {
    await login(page, EMAIL, PASSWORD);
    await page.waitForURL("**/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("invalid credentials show an error and stay on /login", async ({ page }) => {
    await login(page, EMAIL, "definitely-wrong-password");
    await expect(page.getByText(/invalid/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("visiting an app route while logged out redirects to /login", async ({ page }) => {
    await page.goto("/tickets");
    await page.waitForURL("**/login**");
    await expect(page).toHaveURL(/\/login/);
  });

  test("logout returns to /login and app routes are locked again", async ({ page }) => {
    await login(page, EMAIL, PASSWORD);
    await page.waitForURL("**/dashboard");

    await page.getByRole("button", { name: /log out/i }).click();
    await page.waitForURL("**/login**");

    await page.goto("/dashboard");
    await page.waitForURL("**/login**");
    await expect(page).toHaveURL(/\/login/);
  });
});
