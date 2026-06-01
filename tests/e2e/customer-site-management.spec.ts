import { test, expect, type Page } from "@playwright/test";

// Seeded super admin (prisma/seed.ts). Override via env for other environments.
const EMAIL = process.env.E2E_EMAIL ?? "merelbjacobs@gmail.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "Testingtest";

async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard");
}

test("create, edit, and delete a customer and site", async ({ page }) => {
  const stamp = Date.now();
  const customerName = `E2E Customer ${stamp}`;
  const siteName = `E2E Site ${stamp}`;

  await login(page);
  await page.goto("/customers");

  // Add customer
  await page.getByRole("button", { name: /add customer/i }).click();
  await page.getByPlaceholder("e.g. Acme Corp").fill(customerName);
  await page.getByRole("button", { name: /^create$/i }).click();
  const customerRow = page.locator("div").filter({ hasText: customerName }).last();
  await expect(page.getByText(customerName)).toBeVisible();

  // Expand customer, then add a site
  await customerRow.getByRole("button", { name: /expand/i }).click();
  await customerRow.getByTitle("Add site").click();
  await page.getByPlaceholder("e.g. HQ").fill(siteName);
  await page.getByPlaceholder("New York").fill("Chicago");
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByText(siteName)).toBeVisible();

  // Edit the site's city
  const siteRow = page.locator("div").filter({ hasText: siteName }).last();
  await siteRow.getByTitle("Edit").click();
  await page.getByPlaceholder("New York").fill("Boston");
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText("Boston")).toBeVisible();

  // Delete the site (confirm)
  const siteRow2 = page.locator("div").filter({ hasText: siteName }).last();
  await siteRow2.getByTitle("Delete").click();
  await page.getByRole("button", { name: /^delete$/i }).click();
  await expect(page.getByText(siteName)).toHaveCount(0);

  // Delete the customer (confirm shows cascade warning)
  const customerRow2 = page.locator("div").filter({ hasText: customerName }).last();
  await customerRow2.getByTitle("Delete").click();
  await expect(page.getByText(/Removes .* sites/i)).toBeVisible();
  await page.getByRole("button", { name: /^delete$/i }).click();
  await expect(page.getByText(customerName)).toHaveCount(0);
});
