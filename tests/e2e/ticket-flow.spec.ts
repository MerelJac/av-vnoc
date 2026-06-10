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

test.describe("ticket workflow", () => {
  test("queue lists tickets, detail shows the timeline, and a note can be added", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await login(page);

    await page.goto("/tickets");
    const firstTicket = page.locator('a[href^="/tickets/"]').first();

    const ticketCount = await firstTicket.count();
    test.skip(ticketCount === 0, "No seeded tickets available to exercise the flow");

    await firstTicket.click();
    await page.waitForURL(/\/tickets\/[^/]+$/);

    // Detail page renders the note composer
    const composer = page.getByPlaceholder("Add a note...");
    await expect(composer).toBeVisible();

    const note = `E2E note ${Date.now()}`;
    await composer.fill(note);
    await page.getByRole("button", { name: /add note/i }).click();

    // The new action appears in the timeline
    await expect(page.getByText(note)).toBeVisible({ timeout: 10_000 });
  });
});
