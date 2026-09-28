import { spawnSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { generatePin } from "@/server/auth/credential-rules";
import { createActiveProfile } from "@/server/auth/operator-service";
import { resetTestDb } from "@/server/test-db";
import { workingTreeChanges } from "../../../tests/support/feature-scope";
import { makeSupplier } from "../../../tests/support/item-master-fixture";
import { without } from "../../../tests/support/run-script";

/**
 * Spec 016 AC-8, the database half: `npm run operator:production -- db:census`, started for
 * real with DATABASE_URL and DIRECT_URL absent from its own environment, given the TEST
 * database's two strings at the prompt, while `.env` names the development database. The
 * census it runs must describe the test database, which holds a number of suppliers drawn
 * at run time.
 */

beforeEach(async () => {
  await resetTestDb();
});

/** Whether `.env` assigns DATABASE_URL a value: yes or no, with no value read out. */
function envFileNamesADatabase(): boolean {
  const text = existsSync(".env") ? readFileSync(".env", "utf8") : "";
  return /^\s*(?:export\s+)?DATABASE_URL\s*=\s*\S/m.test(text);
}

describe("016 AC-8: the launcher runs the command on the answers, not on .env", () => {
  it("AC-8: db:census through the launcher reports what the test database holds", async () => {
    const suppliers = randomInt(3, 8);
    for (let index = 0; index < suppliers; index += 1) {
      await makeSupplier(`Launcher Supplier ${index} ${randomBytes(3).toString("hex")}`);
    }
    await createActiveProfile({
      name: `Launcher Admin ${randomBytes(3).toString("hex")}`,
      username: `la${randomBytes(6).toString("hex")}`,
      role: "ADMIN",
      pin: generatePin(6),
    });
    const answers = [process.env.DATABASE_URL ?? "", process.env.DIRECT_URL ?? "", process.env.PIN_PEPPER ?? ""];
    const env = without(process.env, ["DATABASE_URL", "DIRECT_URL", "PIN_PEPPER", "NEW_PIN"]);
    const changesBefore = workingTreeChanges(["."]);

    expect(envFileNamesADatabase(), ".env names a database").toBe(true);
    expect(answers.every((answer) => answer.length > 0)).toBe(true);

    const result = spawnSync("npm run --silent operator:production -- db:census", {
      shell: true,
      encoding: "utf8",
      env,
      input: `${answers.join("\n")}\n`,
    });
    const printed = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

    expect(result.status, "exit status").toBe(0);
    expect(result.stdout).toContain(`[db:census] suppliers: ${suppliers}\n`);
    expect(result.stdout).toContain("[db:census] profiles: ADMIN ACTIVE 1\n");
    expect(result.stdout).toContain("[db:census] pins: 1 of 1 made under the given PIN_PEPPER");
    expect(answers.filter((answer) => printed.includes(answer)).length, "answers printed").toBe(0);
    expect(printed.includes(new URL(answers[0] ?? "").hostname), "host printed").toBe(false);
    expect(workingTreeChanges(["."])).toEqual(changesBefore);
  });
});
