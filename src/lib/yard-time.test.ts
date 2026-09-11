import { describe, expect, it } from "vitest";

import { YARD_TIME_ZONE, todayInYard } from "@/lib/yard-time";

/**
 * Spec 007 AC-31. No database, no clock: `now` is an argument, so both sides of the Irish
 * summer-time boundary are values rather than something to wait for.
 */
describe("todayInYard", () => {
  it("AC-31: names the yard's zone rather than the server's", () => {
    expect(YARD_TIME_ZONE).toBe("Europe/Dublin");
  });

  it("AC-31: 2026-07-01T23:30:00Z is already 2026-07-02 in the yard (IST, UTC+1)", () => {
    expect(todayInYard(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
  });

  it("AC-31: 2026-01-01T23:30:00Z is still 2026-01-01 in the yard (GMT)", () => {
    expect(todayInYard(new Date("2026-01-01T23:30:00Z"))).toBe("2026-01-01");
  });

  it("AC-31: midday is the same day in either zone, so the format is all that is asserted", () => {
    expect(todayInYard(new Date("2026-09-01T12:00:00Z"))).toBe("2026-09-01");
    expect(todayInYard(new Date("2026-12-31T12:00:00Z"))).toBe("2026-12-31");
  });

  it("AC-31: every part is zero-padded, so the value sorts and compares as a key", () => {
    expect(todayInYard(new Date("2026-03-05T12:00:00Z"))).toBe("2026-03-05");
    expect(todayInYard(new Date("2026-03-05T12:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("AC-31: an unusable Date throws rather than silently becoming a plausible day", () => {
    // The failure path docs/verification.md Level 1 requires. `Intl` refuses an invalid
    // Date outright, which is the right answer: a wrong-looking date is better than a
    // plausible wrong one, and in the first five days of a month a wrong day is a wrong
    // PERIOD. Every caller passes a real clock or a fixture, so nothing reaches this.
    expect(() => todayInYard(new Date("not-a-date"))).toThrow(RangeError);
  });
});
