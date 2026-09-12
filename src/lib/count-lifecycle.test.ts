import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  canApprove,
  canReopen,
  canSubmit,
  isApproved,
  isDraft,
  isSubmitted,
} from "@/lib/count-lifecycle";
import { COUNT_STATUSES } from "@/types/stock-count";

/**
 * Spec 009 AC-31: pure, so the transition table is proved with no database at all.
 */
describe("AC-17, AC-16, AC-18: the transition table, as six predicates", () => {
  it("AC-17: exactly one status is a draft, one is submitted and one is approved", () => {
    expect(COUNT_STATUSES.filter(isDraft)).toEqual(["DRAFT"]);
    expect(COUNT_STATUSES.filter(isSubmitted)).toEqual(["SUBMITTED"]);
    expect(COUNT_STATUSES.filter(isApproved)).toEqual(["APPROVED"]);
  });

  it("AC-17: only a DRAFT may be submitted", () => {
    expect(COUNT_STATUSES.filter(canSubmit)).toEqual(["DRAFT"]);
  });

  it("AC-16: only a SUBMITTED count may be approved", () => {
    expect(COUNT_STATUSES.filter(canApprove)).toEqual(["SUBMITTED"]);
  });

  it("AC-18: a SUBMITTED count is reopenable as well as an APPROVED one, and a DRAFT is not", () => {
    // Open question 1, approved: otherwise a known-wrong count must be approved before it
    // can be undone.
    expect(COUNT_STATUSES.filter(canReopen)).toEqual(["SUBMITTED", "APPROVED"]);
  });

  it("AC-26: the module is pure — it imports a type and no runtime", () => {
    const source = readFileSync("src/lib/count-lifecycle.ts", "utf8");

    const imports = [...source.matchAll(/^import .*from "([^"]+)";$/gm)].map((match) => match[1]);
    expect(imports).toEqual(["@/types/stock-count"]);
    expect(source).toContain('import type { CountStatus }');
  });
});
