import type { WeatherKind } from "../types";

/**
 * Markov-ish weather. Each minute, transition to the next state based on the
 * current state's transition table. `force` lets storm events from external
 * sources override the natural progression for a few minutes.
 */
export class Weather {
  current: WeatherKind = "clear";
  /** time (sim seconds) when forced override expires */
  private forcedUntil = 0;

  /** seconds until next transition roll */
  private nextRollIn = 60;

  /**
   * Captain of the Guard seated — when true, transitions that would otherwise
   * go to "storm" instead stay in the previous milder state. Doesn't suppress
   * `forceStorm` (an external system-triggered storm still lands). Set by
   * `World.setCourt`.
   */
  captainBonus = false;

  constructor(private rand: () => number = Math.random) {}

  tick(dt: number, simSeconds: number) {
    if (simSeconds < this.forcedUntil) return;
    this.nextRollIn -= dt;
    if (this.nextRollIn > 0) return;
    this.nextRollIn = 60 + this.rand() * 60;
    this.current = this.next(this.current);
  }

  forceStorm(simSeconds: number, durationSec = 60) {
    this.current = "storm";
    this.forcedUntil = simSeconds + durationSec;
  }

  private next(c: WeatherKind): WeatherKind {
    const r = this.rand();
    // Captain of the Guard seated → demote storm transitions to the calmer
    // outcome they would have produced one step back. This makes a kingdom
    // with a seated captain visibly safer without making storms impossible.
    const dampen = (kind: WeatherKind, fallback: WeatherKind): WeatherKind =>
      this.captainBonus && kind === "storm" ? fallback : kind;
    switch (c) {
      case "clear":
        if (r < 0.6) return "clear";
        if (r < 0.9) return "cloudy";
        return "rain";
      case "cloudy":
        if (r < 0.4) return "cloudy";
        if (r < 0.65) return "clear";
        if (r < 0.9) return "rain";
        return dampen("storm", "rain");
      case "rain":
        if (r < 0.45) return "rain";
        if (r < 0.7) return "cloudy";
        if (r < 0.85) return dampen("storm", "rain");
        return "clear";
      case "storm":
        if (r < 0.5) return dampen("storm", "rain");
        if (r < 0.85) return "rain";
        return "cloudy";
      case "snow":
        if (r < 0.7) return "snow";
        return "cloudy";
    }
  }
}
