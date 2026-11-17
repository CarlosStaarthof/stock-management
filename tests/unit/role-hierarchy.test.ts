import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Feature #22 AC-1 and AC-3 as facts about the source tree.
 *
 * The hierarchy is spelled once, in `roles.ts`, and every administrator surface asks the
 * predicate. The SUPER_ADMIN role is written by the migrations alone; no form, action or
 * service assigns it.
 */

const ROOT = process.cwd();
const CODE = /\.(ts|tsx)$/;
const TEST = /\.test\.(ts|tsx)$/;

function filesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(ROOT, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...filesUnder(relative));
    } else if (CODE.test(entry.name) && !TEST.test(entry.name)) {
      found.push(relative);
    }
  }
  return found;
}

const SERVER_AND_APP = [...filesUnder("src/server"), ...filesUnder("src/app")];

function read(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

describe("AC-1: one spelling of the hierarchy", () => {
  it("AC-1: no file outside roles.ts combines ADMIN and SUPER_ADMIN in one expression", () => {
    const offenders = SERVER_AND_APP.filter((file) => file !== "src/server/auth/roles.ts").filter(
      (file) =>
        read(file)
          .split("\n")
          .some((line) => line.includes('"ADMIN"') && line.includes('"SUPER_ADMIN"')),
    );

    expect(offenders).toEqual([]);
  });

  it("AC-1: no administrator gate compares the role itself any more", () => {
    const offenders: string[] = [];
    for (const file of SERVER_AND_APP) {
      const source = read(file);
      if (source.includes('assertRole(actor, "ADMIN")') || source.includes('requireRole("ADMIN")')) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("AC-3: no application path writes a SUPER_ADMIN", () => {
  it("AC-3: no src/app module names SUPER_ADMIN as a value to write", () => {
    for (const file of filesUnder("src/app")) {
      const source = read(file);
      expect(source, file).not.toMatch(/role\s*:\s*"SUPER_ADMIN"/);
      expect(source, file).not.toMatch(/role\s*=\s*"SUPER_ADMIN"/);
    }
  });

  it("AC-3: no src/server module except roles.ts and the operator fixture writes it", () => {
    for (const file of SERVER_AND_APP) {
      if (file === "src/server/auth/roles.ts" || file === "src/server/auth/operator-service.ts") {
        continue;
      }
      const source = read(file);
      expect(source, file).not.toMatch(/role\s*:\s*"SUPER_ADMIN"/);
      expect(source, file).not.toMatch(/role\s*=\s*"SUPER_ADMIN"/);
    }
  });

  it("AC-3: the profile forms offer only YARD_STAFF and ADMIN", () => {
    for (const file of [
      "src/components/profiles/CreateProfileAdminForm.tsx",
      "src/components/profiles/PendingProfileActions.tsx",
    ]) {
      const source = read(file);
      expect(source, file).toContain('value="YARD_STAFF"');
      expect(source, file).toContain('value="ADMIN"');
      expect(source, file).not.toContain('value="SUPER_ADMIN"');
    }
  });
});
