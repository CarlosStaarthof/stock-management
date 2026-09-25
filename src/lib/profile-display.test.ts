import { describe, expect, it } from "vitest";

import { yardDate, yardDateTime } from "@/lib/profile-display";

describe("021 AC-22, AC-26: /profiles writes instants in the yard's zone", () => {
  it("AC-22: a creation date is the Dublin date, which is a day ahead of UTC late in a summer evening", () => {
    expect(yardDate("2026-07-01T23:30:00.000Z")).toBe("2026-07-02");
    expect(yardDate("2026-01-15T23:30:00.000Z")).toBe("2026-01-15");
  });

  it("AC-26: a lock's end is the Dublin date and 24-hour time, in summer and in winter", () => {
    expect(yardDateTime("2026-07-01T23:30:00.000Z")).toBe("2026-07-02 00:30");
    expect(yardDateTime("2026-01-15T13:05:00.000Z")).toBe("2026-01-15 13:05");
  });
});
