import type { World } from "../World";

/**
 * Kingdom mood — a single -10..+10 value that drifts based on what's
 * happening. Distinct from reputation (which is the monarch's standing);
 * mood is the kingdom's emotional state day-to-day.
 *
 * Inputs that nudge mood:
 *   +1 every festival (player or in-world holiday)
 *   +1 every visitor (bard/scholar/knight/etc.)
 *   -2 every war casualty
 *   -1 every plague death
 *   -1 per famine day
 *   +0.05/day drift toward 0 (mood normalises over time)
 *
 * Read into the HUD as one of four banner labels:
 *   "the kingdom is celebrating" (>5)
 *   "the kingdom is content"      (0..5)   — includes a neutral kingdom
 *   "the kingdom is uneasy"       (-5..0)
 *   "the kingdom is anxious"      (<-5)
 *
 * A fresh kingdom starts at score 0 and should read as *content*, not
 * uneasy — uneasy implies a negative event has happened. Found in
 * browser playtest day-1 view.
 */

/** How many days of mood the HUD sparkline remembers. */
export const MOOD_HISTORY_DAYS = 32;

export interface MoodSnapshot {
  score: number;
  /**
   * One sample per in-world day, oldest→newest, capped at MOOD_HISTORY_DAYS.
   * Drives the HUD trend sparkline so the player can SEE the people souring
   * (or warming) before unrest fires — the causality made legible. Recorded
   * during away-replay too, so the trend covers the days you missed.
   */
  history: number[];
}

export class Mood {
  state: MoodSnapshot = { score: 0, history: [] };

  constructor(private world: World) {}

  snapshot(): MoodSnapshot {
    return { score: this.state.score, history: [...this.state.history] };
  }
  restore(s: { score: number; history?: number[] }): void {
    this.state = {
      score: Math.max(-10, Math.min(10, s.score)),
      history: Array.isArray(s.history) ? s.history.slice(-MOOD_HISTORY_DAYS) : [],
    };
  }

  /** Bump mood by `delta`, clamped to [-10, 10]. */
  adjust(delta: number): void {
    this.state.score = Math.max(-10, Math.min(10, this.state.score + delta));
  }

  /** Slow drift toward 0 each day. */
  tickDay(): void {
    const s = this.state.score;
    if (s > 0) this.state.score = Math.max(0, s - 0.05);
    else if (s < 0) this.state.score = Math.min(0, s + 0.05);
    // Famine drags mood actively.
    if (this.world.disasters.state.active === "famine") {
      this.adjust(-0.2);
    }
    // One sample per day for the trend sparkline (end-of-day score).
    this.state.history.push(Math.round(this.state.score * 10) / 10);
    if (this.state.history.length > MOOD_HISTORY_DAYS) {
      this.state.history.splice(0, this.state.history.length - MOOD_HISTORY_DAYS);
    }
  }

  /** Recent daily samples, oldest→newest (a copy, for the sparkline). */
  recentHistory(): number[] {
    return [...this.state.history];
  }

  /**
   * Trend over the last `window` samples: +1 rising, -1 falling, 0 steady.
   * The HUD shows this as an arrow next to the mood label so the direction
   * reads at a glance, not just the current value.
   */
  trend(window = 6): -1 | 0 | 1 {
    const h = this.state.history;
    if (h.length < 2) return 0;
    const seg = h.slice(-window);
    const delta = seg[seg.length - 1] - seg[0];
    if (delta > 0.3) return 1;
    if (delta < -0.3) return -1;
    return 0;
  }

  /** Human-readable label for the HUD. */
  label(): string {
    const s = this.state.score;
    if (s > 5)  return "the kingdom is celebrating";
    if (s >= 0) return "the kingdom is content";
    if (s > -5) return "the kingdom is uneasy";
    return "the kingdom is anxious";
  }

  /** A semantic tier for styling (0=neutral, +=happy, -=worried). */
  tier(): "celebrating" | "content" | "uneasy" | "anxious" {
    const s = this.state.score;
    if (s > 5)  return "celebrating";
    if (s >= 0) return "content";
    if (s > -5) return "uneasy";
    return "anxious";
  }
}
