import { randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

import { countingAs } from "@/lib/count-messages";
import { generatePin } from "@/server/auth/credential-rules";
import { createActiveProfile } from "@/server/auth/operator-service";

import { skipWithoutDatabase } from "./support/database";
import { removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * 021 AC-37: one identity header, showing the display name, that wraps at any character.
 *
 * The profile's name is ONE UNBROKEN RUN OF 80 LETTERS — the longest name the rules allow
 * (`MAX_NAME_LENGTH`), with no hyphen or space for a browser to break at. Before #21 the
 * same header overflowed on three pages with a 61-character run (010's fifth and sixth
 * amendments, 011 AC-20). `/profiles`, the admin section, is the fourth.
 */
const created: string[] = [];

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutDatabase(testInfo);
});

test.afterAll(async () => {
  for (const username of created.splice(0)) {
    await removeUser(username);
  }
});

/** 80 lower-case letters drawn at runtime: no break opportunity anywhere in the name. */
function unbrokenName(): string {
  return Array.from(randomBytes(80), (byte) => String.fromCharCode(97 + (byte % 26))).join("");
}

async function unbrokenProfile(role: "ADMIN" | "YARD_STAFF"): Promise<TestUser> {
  const name = unbrokenName();
  const username = `e2e-${randomBytes(10).toString("hex")}`;
  const pin = generatePin(6);
  const user = await createActiveProfile({ name, username, role, pin });
  created.push(username);
  return { id: user.id, username, name, pin, role };
}

for (const width of [390, 320]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test(`AC-37: at ${width} px an 80-character unbroken name widens none of the four pages`, async ({
      page,
    }) => {
      const admin = await unbrokenProfile("ADMIN");
      await signIn(page, admin);

      for (const path of ["/stock-entry", "/stock-takes", "/analysis", "/profiles"]) {
        await page.goto(path);
        const name = page.getByTestId("signed-in-name");
        await expect(name, path).toHaveText(admin.name);
        await expect(page.getByTestId("sign-out"), path).toBeVisible();

        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth, path).toBeLessThanOrEqual(clientWidth);

        const header = await page.locator("header").first().boundingBox();
        expect(header, path).not.toBeNull();
        expect(header?.x ?? -1, path).toBeGreaterThanOrEqual(0);
        expect((header?.x ?? 0) + (header?.width ?? Infinity), path).toBeLessThanOrEqual(width);
      }
    });
  });
}

test("AC-37: the header shows the display name, never the username", async ({ page }) => {
  const staff = await unbrokenProfile("YARD_STAFF");
  await signIn(page, staff);

  for (const path of ["/stock-entry", "/stock-takes"]) {
    await page.goto(path);
    await expect(page.getByTestId("signed-in-name"), path).toHaveText(staff.name);
    expect(await page.locator("header").first().innerText(), path).not.toContain(staff.username);
  }
});

test("AC-37: /stock-entry/new renders only the name inside counting-as", async ({ page }) => {
  const staff = await unbrokenProfile("YARD_STAFF");
  await signIn(page, staff);

  await page.goto("/stock-entry/new");

  const countingAsText = page.getByTestId("counting-as");
  await expect(countingAsText).toHaveText(countingAs(staff.name));
  expect(await countingAsText.innerText()).not.toContain(staff.username);
});
