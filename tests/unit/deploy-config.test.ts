import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Spec 016 AC-1: the settings of Vercel's that can live in the repository do, and the gate
 * never runs the release's own commands.
 */

type VercelJson = {
  regions?: unknown;
  buildCommand?: unknown;
  git?: { deploymentEnabled?: unknown };
  env?: unknown;
  build?: { env?: unknown };
};

const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as VercelJson;
const scripts =
  (JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};

/**
 * Vercel's rule for `git.deploymentEnabled`, as its documentation states it: a branch
 * matching no key deploys; a branch matching keys deploys when any matching key is `true`.
 * Only the two key shapes this repository uses are understood: `**`, which matches every
 * branch, and a literal branch name.
 */
function deploys(rules: Record<string, boolean>, branch: string): boolean {
  const matching = Object.entries(rules).filter(([key]) => key === "**" || key === branch);
  return matching.length === 0 ? true : matching.some(([, enabled]) => enabled);
}

/** The five commands AC-1 keeps out of the gate, and the files they run. */
const RELEASE_COMMANDS = [
  "build:vercel",
  "db:export",
  "db:restore",
  "operator:production",
  "verify:deploy",
  "vercel-build",
  "db-export",
  "db-restore",
  "operator-production",
  "verify-deployment",
];

function releaseCommandsIn(text: string): string[] {
  return RELEASE_COMMANDS.filter((command) => text.includes(command));
}

describe("016 AC-1: vercel.json", () => {
  it("AC-1: declares regions equal to [lhr1] and buildCommand equal to npm run build:vercel", () => {
    expect(vercel.regions).toEqual(["lhr1"]);
    expect(vercel.buildCommand).toBe("npm run build:vercel");
  });

  it("AC-1: enables Git deployments for the branch production and disables them for every other branch, main included", () => {
    const rules = vercel.git?.deploymentEnabled as Record<string, boolean>;

    expect(rules).toEqual({ "**": false, production: true });
    expect(deploys(rules, "production")).toBe(true);
    for (const branch of ["main", "dev", "feature/pin-auth", "preview", "production-2"]) {
      expect(deploys(rules, branch), branch).toBe(false);
    }
  });

  it("AC-1: the deployment rule is read the way Vercel reads it (non-vacuity)", () => {
    // Without the catch-all, every branch but the ones named would deploy.
    expect(deploys({ production: true }, "main")).toBe(true);
    expect(deploys({ main: false, production: true }, "dev")).toBe(true);
  });

  it("AC-1: it has no env and no build.env key", () => {
    expect(Object.keys(vercel)).not.toContain("env");
    expect(vercel.build?.env).toBeUndefined();
  });
});

describe("016 AC-1: package.json", () => {
  it("AC-1: gains build:vercel, db:census, db:export, db:restore, operator:production and verify:deploy", () => {
    for (const name of [
      "build:vercel",
      "db:census",
      "db:export",
      "db:restore",
      "operator:production",
      "verify:deploy",
    ]) {
      expect(scripts[name], name).toBeTruthy();
    }
    expect(scripts["build:vercel"]).toBe("tsx scripts/vercel-build.ts");
    expect(scripts["operator:production"]).toBe("node scripts/operator-production.mjs");
  });

  it("AC-1: build stays exactly next build", () => {
    expect(scripts.build).toBe("next build");
  });
});

describe("016 AC-1: the gate never runs a release command", () => {
  const testScripts = Object.entries(scripts).filter(([name]) => name.startsWith("test:"));
  const runnerFiles = testScripts.flatMap(([, command]) => command.match(/scripts\/[\w.-]+\.(?:mjs|ts)/g) ?? []);

  it("AC-1: neither init.sh nor init.ps1 invokes one", () => {
    expect(releaseCommandsIn(readFileSync("init.sh", "utf8"))).toEqual([]);
    expect(releaseCommandsIn(readFileSync("init.ps1", "utf8"))).toEqual([]);
  });

  it("AC-1: no test:* script invokes one, and neither do the runner files they name", () => {
    expect(testScripts.map(([name]) => name).sort()).toEqual(["test:db", "test:e2e", "test:unit"]);
    for (const [name, command] of testScripts) {
      expect(releaseCommandsIn(command), name).toEqual([]);
    }

    expect([...runnerFiles].sort()).toEqual(["scripts/run-db-tests.mjs", "scripts/run-e2e.mjs"]);
    for (const file of runnerFiles) {
      expect(releaseCommandsIn(readFileSync(file, "utf8")), file).toEqual([]);
    }
  });

  it("AC-1: the check sees each command it bans (non-vacuity)", () => {
    for (const command of RELEASE_COMMANDS) {
      expect(releaseCommandsIn(`npm run ${command}`)).toContain(command);
    }
  });
});
