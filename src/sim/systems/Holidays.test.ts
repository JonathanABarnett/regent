import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { World } from "../World";
import { Holidays } from "./Holidays";

/**
 * Holidays fire based on the player's local wall-clock date. We use
 * vi.useFakeTimers and vi.setSystemTime to test specific dates without
 * waiting for the calendar to roll over.
 */

describe("Holidays", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing on a non-holiday date", () => {
    vi.setSystemTime(new Date(2025, 6, 4, 12, 0, 0)); // July 4 (not in our list)
    const w = new World({ seed: 42 });
    const before = w.bus.recent().length;
    w.holidays.tick();
    expect(w.bus.recent().length).toBe(before);
  });

  it("fires Midsummer on June 21", () => {
    vi.setSystemTime(new Date(2025, 5, 21, 12, 0, 0)); // June 21
    const w = new World({ seed: 42 });
    const before = w.bus.recent().length;
    w.holidays.tick();
    expect(w.bus.recent().length).toBeGreaterThan(before);
    // The most recent event should be a festival
    const ev = w.bus.recent()[w.bus.recent().length - 1];
    expect(ev.kind).toBe("festival");
  });

  it("fires Hallowtide on October 31", () => {
    vi.setSystemTime(new Date(2025, 9, 31, 12, 0, 0)); // Oct 31
    const w = new World({ seed: 42 });
    w.holidays.tick();
    const ev = w.bus.recent()[w.bus.recent().length - 1];
    expect(ev.kind).toBe("festival");
    expect(ev.payload.label).toContain("Hallowtide");
  });

  it("does not fire the same holiday twice in one real day", () => {
    vi.setSystemTime(new Date(2025, 5, 21, 12, 0, 0));
    const w = new World({ seed: 42 });
    w.holidays.tick();
    const after1 = w.bus.recent().length;
    w.holidays.tick();
    w.holidays.tick();
    expect(w.bus.recent().length).toBe(after1);
  });

  it("fires the same holiday again the next real day", () => {
    // June 21, 2025
    vi.setSystemTime(new Date(2025, 5, 21, 12, 0, 0));
    const w = new World({ seed: 42 });
    w.holidays.tick();
    const after1 = w.bus.recent().length;
    // Roll to June 21, 2026 — should fire again
    vi.setSystemTime(new Date(2026, 5, 21, 12, 0, 0));
    w.holidays.tick();
    expect(w.bus.recent().length).toBeGreaterThan(after1);
  });

  it("can construct without crashing on edge dates", () => {
    vi.setSystemTime(new Date(2025, 1, 29, 12, 0, 0)); // Feb 29 (non-leap year fallback)
    const w = new World({ seed: 42 });
    expect(() => w.holidays.tick()).not.toThrow();
  });
});
