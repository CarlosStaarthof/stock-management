import { expect, test } from "@playwright/test";

test("AC-12: the home page responds 200 and shows the Macroads Stock heading", async ({
  page,
}) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);

  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("Macroads Stock");
});

test("AC-13: Tailwind is applied — the heading computes to text-3xl (30px)", async ({
  page,
}) => {
  await page.goto("/");

  const fontSize = await page
    .getByRole("heading", { level: 1 })
    .evaluate((element) => window.getComputedStyle(element).fontSize);

  // text-3xl is 1.875rem. Without the stylesheet the browser default for an h1 is 32px,
  // so this assertion fails if Tailwind is installed but not wired up.
  expect(fontSize).toBe("30px");
});

test("AC-15: the page renders output from code that imports @/lib/env", async ({ page }) => {
  await page.goto("/");

  const status = page.getByTestId("env-status");

  // The status is a boolean rendered as a sentence. Whether this machine has a .env or
  // not, one of the two forms must appear — and a connection string must never appear.
  await expect(status).toHaveText(/^Database configuration (present|missing)\.$/);
  await expect(page.locator("body")).not.toContainText("postgresql");
});
