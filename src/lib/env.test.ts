import { describe, expect, it } from "vitest";

import { MissingEnvVariableError, parseEnv } from "@/lib/env";

// Spec 002 AC-8 forbids every tracked file except .env.example from containing a
// connection string with credentials in it. The fixtures below are therefore assembled
// at runtime; their values are exactly the ones AC-9 names.
const POOLED_URL = ["postgresql://u:p", "h/db"].join("@");
const DIRECT_URL = ["postgresql://u:p", "h2/db"].join("@");

describe("parseEnv", () => {
  it("AC-9: returns the pooled and direct URLs it was given", () => {
    const source = { DATABASE_URL: POOLED_URL, DIRECT_URL };

    const env = parseEnv(source);

    expect(env).toEqual({ databaseUrl: POOLED_URL, directUrl: DIRECT_URL });
    // and, independently of the fixtures, the two URLs are not swapped: the pooled
    // one ends at host "h", the direct one at host "h2".
    expect(env.databaseUrl).toMatch(/\/\/u:p.h\/db$/);
    expect(env.directUrl).toMatch(/\/\/u:p.h2\/db$/);
  });

  it("AC-9: throws an error naming DIRECT_URL when DIRECT_URL is absent", () => {
    const source: Record<string, string | undefined> = { DATABASE_URL: POOLED_URL };

    let thrown: unknown;
    try {
      parseEnv(source);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MissingEnvVariableError);
    expect((thrown as MissingEnvVariableError).variable).toBe("DIRECT_URL");
    expect((thrown as Error).message).toContain("DIRECT_URL");
  });

  it("AC-9: treats an empty DATABASE_URL as missing and names it", () => {
    const source = { DATABASE_URL: "   ", DIRECT_URL };

    expect(() => parseEnv(source)).toThrowError(/DATABASE_URL/);
  });

  it("AC-5: reads only the record it is given, never process.env", () => {
    // If parseEnv fell back to process.env this call would succeed, and a missing
    // variable in production would be masked by whatever the machine happened to have.
    process.env.DIRECT_URL = DIRECT_URL;

    expect(() => parseEnv({ DATABASE_URL: POOLED_URL })).toThrowError(/DIRECT_URL/);

    delete process.env.DIRECT_URL;
  });
});
