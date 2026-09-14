import { describe, expect, it } from "vitest";

import { deepKeys } from "@/lib/money-boundary";
import { filterCalendarByYard, scopeTallies } from "@/lib/stock-takes-view";
import type { CalendarMonth } from "@/types/stock-count";

/**
 * Spec 010 AC-7: the scope is a pure filter over ONE query's result, and this whole file
 * runs with no database — which is the point of it being pure (AC-20).
 *
 * The fixture is AC-7's own: three counts across two days of a 30-day month — Dublin and
 * Clonmel on the 1st, Clonmel on the 14th.
 */
function monthFixture(): CalendarMonth {
  const days = Array.from({ length: 30 }, (_unused, index) => ({
    date: `2026-04-${String(index + 1).padStart(2, "0")}`,
    counts: [] as CalendarMonth["days"][number]["counts"],
  }));

  days[0].counts = [
    {
      countId: "count_dub_1",
      locationCode: "DUBLIN",
      locationName: "Dublin",
      status: "DRAFT",
      periodKey: "2026-03",
    },
    {
      countId: "count_clo_1",
      locationCode: "CLONMEL",
      locationName: "Clonmel",
      status: "DRAFT",
      periodKey: "2026-03",
    },
  ];
  days[13].counts = [
    {
      countId: "count_clo_14",
      locationCode: "CLONMEL",
      locationName: "Clonmel",
      status: "DRAFT",
      periodKey: "2026-04",
    },
  ];

  return {
    monthKey: "2026-04",
    monthLabel: "April 2026",
    previousMonthKey: "2026-03",
    nextMonthKey: "2026-05",
    todayKey: "2026-04-20",
    days,
    countsInMonth: 3,
    anyCountEver: true,
  };
}

describe("filterCalendarByYard", () => {
  it("AC-7: DUBLIN keeps one count, and every badge left is Dublin's", () => {
    const scoped = filterCalendarByYard(monthFixture(), "DUBLIN");

    expect(scoped.countsInMonth).toBe(1);

    const badges = scoped.days.flatMap((day) => day.counts);
    expect(badges).toHaveLength(1);
    for (const badge of badges) expect(badge.locationCode).toBe("DUBLIN");
  });

  it("AC-7: CLONMEL keeps two, on the two different days they happened", () => {
    const scoped = filterCalendarByYard(monthFixture(), "CLONMEL");

    expect(scoped.countsInMonth).toBe(2);
    expect(scoped.days[0].counts.map((badge) => badge.countId)).toEqual(["count_clo_1"]);
    expect(scoped.days[13].counts.map((badge) => badge.countId)).toEqual(["count_clo_14"]);
  });

  it("AC-7: BOTH returns a value deeply equal to the input", () => {
    // This is what makes AC-4's badge-set equality true BY CONSTRUCTION: `/stock-takes`
    // under `BOTH` renders exactly what `/stock-entry` renders, because it is the same
    // value from the same call to the same function.
    const month = monthFixture();

    expect(filterCalendarByYard(month, "BOTH")).toEqual(month);
  });

  it("AC-7: every call leaves the input unmutated", () => {
    const month = monthFixture();
    const before = structuredClone(month);

    filterCalendarByYard(month, "DUBLIN");
    filterCalendarByYard(month, "CLONMEL");
    filterCalendarByYard(month, "BOTH");

    expect(month).toEqual(before);
  });

  it("AC-7: days keeps one entry per day of the month, in order, including the emptied ones", () => {
    const month = monthFixture();

    for (const scope of ["DUBLIN", "CLONMEL", "BOTH"] as const) {
      const scoped = filterCalendarByYard(month, scope);

      expect(scoped.days).toHaveLength(30);
      expect(scoped.days.map((day) => day.date)).toEqual(month.days.map((day) => day.date));
    }

    // The 14th is empty under DUBLIN and is still there, which is why a filtered grid
    // cannot shift a day into another column.
    expect(filterCalendarByYard(month, "DUBLIN").days[13]).toEqual({
      date: "2026-04-14",
      counts: [],
    });
  });

  it("AC-7: everything except the badges and the tally is carried through unchanged", () => {
    const scoped = filterCalendarByYard(monthFixture(), "DUBLIN");

    expect(scoped.monthKey).toBe("2026-04");
    expect(scoped.monthLabel).toBe("April 2026");
    expect(scoped.previousMonthKey).toBe("2026-03");
    expect(scoped.nextMonthKey).toBe("2026-05");
    expect(scoped.todayKey).toBe("2026-04-20");

    // `anyCountEver` is a fact about the database, not about the selector: a scope with no
    // counts in it is `No counts in this month.`, never `No stock counts recorded yet.`
    expect(scoped.anyCountEver).toBe(true);
  });

  it("AC-7: badge order within a day survives the filter", () => {
    // Dublin before Clonmel is `Location.sortOrder`, decided once in `listCalendarMonth`
    // (007 AC-20). A filter that re-sorted would be a second definition of that order.
    const scoped = filterCalendarByYard(monthFixture(), "BOTH");

    expect(scoped.days[0].counts.map((badge) => badge.locationCode)).toEqual([
      "DUBLIN",
      "CLONMEL",
    ]);
  });

  it("AC-12: the filtered month carries no monetary key at any depth, for any scope", () => {
    for (const scope of ["DUBLIN", "CLONMEL", "BOTH"] as const) {
      const keys = deepKeys(filterCalendarByYard(monthFixture(), scope));

      expect(keys.filter((key) => /price|value|total|amount/i.test(key))).toEqual([]);
    }
  });
});

describe("scopeTallies", () => {
  it("AC-7: the fixture tallies { DUBLIN: 1, CLONMEL: 2, BOTH: 3 }", () => {
    expect(scopeTallies(monthFixture())).toEqual({ DUBLIN: 1, CLONMEL: 2, BOTH: 3 });
  });

  it("AC-6: a month with no counts tallies zero for all three", () => {
    const month = monthFixture();
    const empty = { ...month, days: month.days.map((day) => ({ ...day, counts: [] })) };

    expect(scopeTallies(empty)).toEqual({ DUBLIN: 0, CLONMEL: 0, BOTH: 0 });
  });

  it("AC-6: the tally of a scope equals the countsInMonth of that scope's filter", () => {
    // The selector's `n` and the grid it leads to must never disagree.
    const month = monthFixture();
    const tallies = scopeTallies(month);

    for (const scope of ["DUBLIN", "CLONMEL", "BOTH"] as const) {
      expect(filterCalendarByYard(month, scope).countsInMonth).toBe(tallies[scope]);
    }
  });

  it("AC-7: it mutates nothing", () => {
    const month = monthFixture();
    const before = structuredClone(month);

    scopeTallies(month);

    expect(month).toEqual(before);
  });
});
