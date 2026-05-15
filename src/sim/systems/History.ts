/**
 * Per-day history snapshots for the stats sparklines.
 *
 * Stores up to 90 days of (population, gold, vault count) tuples. The stats
 * panel renders these as tiny SVG sparklines so the player can see their
 * kingdom's arc over the last few months at a glance.
 *
 * Capture cadence: one snapshot per in-world day rollover. Bounded ring
 * buffer — when 90 days fill, the oldest entry is shifted off. Total memory
 * cost is trivially small (~90 × 3 numbers = 1 KB).
 */

import type { World } from "../World";

export interface DaySnapshot {
  day: number;
  year: number;
  population: number;
  gold: number;
  vault: number;
}

/** Cap on retained days. Tuned so the sparkline visually fits ~60-90px wide. */
export const HISTORY_MAX_DAYS = 90;

export class History {
  /** Oldest first. Capped at HISTORY_MAX_DAYS. */
  snapshots: DaySnapshot[] = [];

  /** Capture a snapshot of the current world stats. No-op if today is already captured. */
  capture(world: World): void {
    const day = world.state.day;
    const year = world.state.year;
    // Skip if we already have today's snapshot (defensive — day rollover should be the only caller).
    const last = this.snapshots[this.snapshots.length - 1];
    if (last && last.day === day && last.year === year) return;
    this.snapshots.push({
      day,
      year,
      population: world.npcs.length,
      gold: Math.floor(world.economy.state.gold),
      vault: world.treasury.count(),
    });
    while (this.snapshots.length > HISTORY_MAX_DAYS) {
      this.snapshots.shift();
    }
  }

  /** Hydrate from a save. Filters anything invalid; caps to HISTORY_MAX_DAYS. */
  hydrate(raw: unknown): void {
    if (!Array.isArray(raw)) return;
    const out: DaySnapshot[] = [];
    for (const item of raw.slice(-HISTORY_MAX_DAYS)) {
      if (!item || typeof item !== "object") continue;
      const i = item as Record<string, unknown>;
      const day = num(i.day, -1);
      const year = num(i.year, -1);
      if (day < 0 || year < 0) continue;
      out.push({
        day: Math.floor(day),
        year: Math.floor(year),
        population: clamp(num(i.population, 0), 0, 10_000),
        gold: clamp(num(i.gold, 0), 0, 999_999),
        vault: clamp(num(i.vault, 0), 0, 1_000),
      });
    }
    this.snapshots = out;
  }

  /** Series of values for a given metric, oldest first. */
  series(metric: "population" | "gold" | "vault"): number[] {
    return this.snapshots.map((s) => s[metric]);
  }
}

function num(v: unknown, def: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return def;
  return v;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
