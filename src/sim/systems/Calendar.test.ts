import { describe, expect, it } from "vitest";
import { Calendar, seasonTint, type Season } from "./Calendar";

describe("Calendar", () => {
  it("day 1 at the moment of founding", () => {
    const founded = Date.now();
    const cal = new Calendar({ foundedAtMs: founded });
    const s = cal.snapshot(founded);
    expect(s.day).toBe(1);
    expect(s.year).toBe(1);
    expect(s.season).toBe("spring");
  });

  it("advances to day 2 after one full day of real time", () => {
    const founded = Date.now();
    const cal = new Calendar({ foundedAtMs: founded, minutesPerDay: 1 });
    const s = cal.snapshot(founded + 60_000);
    expect(s.day).toBe(2);
  });

  it("season rotates after DAYS_PER_SEASON days", () => {
    const founded = Date.now();
    const cal = new Calendar({ foundedAtMs: founded, minutesPerDay: 0.0001 }); // ~6ms/day
    const s14 = cal.snapshot(founded + 14 * 6 + 5); // ~day 15 → second season
    expect(s14.season).toBe("summer");
  });

  it("wraps around a full year (4 seasons) to year 2", () => {
    const founded = Date.now();
    const cal = new Calendar({ foundedAtMs: founded, minutesPerDay: 0.0001 });
    // 4 seasons × 14 days = 56 days; advance to day ~57 → year 2
    const s = cal.snapshot(founded + 57 * 6 + 5);
    expect(s.year).toBe(2);
  });

  it("clamps to non-negative elapsed when nowMs < foundedAtMs (clock skew)", () => {
    const founded = Date.now();
    const cal = new Calendar({ foundedAtMs: founded });
    const s = cal.snapshot(founded - 100_000); // pretend time went backwards
    expect(s.day).toBe(1);
    expect(s.year).toBe(1);
  });

  it("day-of-week names cycle through 7 unique values", () => {
    const founded = Date.now();
    const cal = new Calendar({ foundedAtMs: founded, minutesPerDay: 0.0001 });
    const names = new Set<string>();
    for (let d = 0; d < 7; d++) {
      const s = cal.snapshot(founded + d * 6 + 5);
      names.add(s.dayOfWeek);
    }
    expect(names.size).toBe(7);
  });

  it("seasonTint returns finite RGB multipliers for every season", () => {
    const seasons: Season[] = ["spring", "summer", "autumn", "winter"];
    for (const s of seasons) {
      const t = seasonTint(s);
      expect(Number.isFinite(t.r)).toBe(true);
      expect(Number.isFinite(t.g)).toBe(true);
      expect(Number.isFinite(t.b)).toBe(true);
      expect(t.r).toBeGreaterThan(0);
      expect(t.g).toBeGreaterThan(0);
      expect(t.b).toBeGreaterThan(0);
    }
  });

  it("follow-real-seasons returns a valid season for any date", () => {
    const cal = new Calendar({ foundedAtMs: 0, followRealSeasons: true });
    const dates = [
      new Date(2024, 0, 15), // Jan → winter
      new Date(2024, 3, 15), // Apr → spring
      new Date(2024, 6, 15), // Jul → summer
      new Date(2024, 9, 15), // Oct → autumn
    ];
    const expected: Season[] = ["winter", "spring", "summer", "autumn"];
    for (let i = 0; i < dates.length; i++) {
      const s = cal.snapshot(dates[i].getTime());
      expect(s.season).toBe(expected[i]);
    }
  });
});
