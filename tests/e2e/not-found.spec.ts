import { expect, test } from "@playwright/test";

test("AC-12: an unknown route returns 404 and renders not-found.tsx", async ({ page }) => {
  const response = await page.goto("/no-such-page");

  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toHaveText(
    "That page does not exist in Macroads Stock.",
  );
});
