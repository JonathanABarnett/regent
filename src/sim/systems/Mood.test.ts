import { describe, it, expect } from "vitest";
import { World } from "../World";
import { MOOD_HISTORY_DAYS } from "./Mood";

/**
 * Mood history + trend — the data behind the HUD sparkline that makes the
 * mood causality legible. Recorded one sample per in-world day, persisted,
 * and summarized as a rising/falling/steady trend.
 */
describe("Mood trend history", () => {
  it("records one sample per day, capped at MOOD_HISTORY_DAYS", () => {
    const w = new World({ seed: 1 });
    for (let i = 0; i < MOOD_HISTORY_DAYS + 10; i++) w.mood.tickDay();
    expect(w.mood.recentHistory().length).toBe(MOOD_HISTORY_DAYS);
  });

  it("trend() reads rising / falling / steady from recent samples", () => {
    const w = new World({ seed: 1 });
    w.mood.state.history = [-3, -2, -1, 0, 1, 2];
    expect(w.mood.trend()).toBe(1);
    w.mood.state.history = [2, 1, 0, -1, -2, -3];
    expect(w.mood.trend()).toBe(-1);
    w.mood.state.history = [0, 0, 0, 0, 0, 0];
    expect(w.mood.trend()).toBe(0);
    w.mood.state.history = [1]; // not enough data
    expect(w.mood.trend()).toBe(0);
  });

  it("snapshot copies history; restore re-caps length and clamps score", () => {
    const w = new World({ seed: 1 });
    w.mood.state.score = 3;
    w.mood.state.history = [-2, 0, 3];
    const snap = w.mood.snapshot();
    expect(snap.history).toEqual([-2, 0, 3]);
    // snapshot must be a copy, not a live reference
    w.mood.state.history.push(4);
    expect(snap.history).toEqual([-2, 0, 3]);

    const w2 = new World({ seed: 2 });
    w2.mood.restore({ score: 99, history: new Array(100).fill(5) });
    expect(w2.mood.state.score).toBe(10); // clamped
    expect(w2.mood.recentHistory().length).toBe(MOOD_HISTORY_DAYS); // re-capped

    // tolerates old saves with no history field
    w2.mood.restore({ score: 0 });
    expect(w2.mood.recentHistory()).toEqual([]);
  });

  it("away-replay records the days you missed", () => {
    const w = new World({ seed: 3 });
    const before = w.mood.recentHistory().length;
    w.fastForwardDays(10);
    expect(w.mood.recentHistory().length).toBeGreaterThan(before);
  });
});
