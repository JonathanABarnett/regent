/**
 * Factions — three power blocs whose loyalty to the crown shifts based on
 * how the kingdom is governed. Loyalty ranges -10..+10, starts at 0.
 *
 * Factions:
 *   merchants — track gold/trade health; bonus: +2 gold/day when pleased
 *   scholars  — track tome production; bonus: +0.3 tomes/day when pleased
 *   guard     — track security record; bonus: -15% threat chance when pleased
 *
 * Auto-adjustment happens daily from world state. Callers (quest decisions,
 * usurper/uprising resolutions) can call adjust() for immediate shifts.
 *
 * Journal entries fire when a faction crosses ±5 for the first time, and
 * reset so they can re-fire if loyalty falls below ±3 and rises again.
 */

import type { World } from "../World";
import type { Journal } from "./Journal";

export type FactionId = "merchants" | "scholars" | "guard";

export interface FactionState {
  merchants: number;
  scholars: number;
  guard: number;
}

// ── Threshold journal prose pools ────────────────────────────────────────────

const PLEASED_LINES: Record<FactionId, readonly string[]> = {
  merchants: [
    "The Merchant Guild sent a formal letter of appreciation to the crown.",
    "The trading families of the towns have been unusually cooperative this season. Word is they consider themselves well-treated.",
    "A merchant consortium donated a small sum to the castle's hospitality fund, unprompted.",
  ],
  scholars: [
    "The Scriptorium sent the crown a bound copy of the kingdom's history to date. The dedication page was unusually warm.",
    "The scholars have been working late — not because they were asked to, but because they wanted to.",
    "The library's head scholar mentioned, in passing, that they have never had so much to write about in a good way.",
  ],
  guard: [
    "The captain of the watch submitted an unsolicited report commending the crown's handling of recent matters.",
    "The night watch has been notably crisp lately. The guard is in good spirits.",
    "The barracks collected a small fund to repair the gatehouse roof without being asked. The crown was informed, not consulted.",
  ],
};

const DISPLEASED_LINES: Record<FactionId, readonly string[]> = {
  merchants: [
    "The trading houses are grumbling about policy. Nothing formal yet — but grumbling is how it starts.",
    "Three merchants declined the usual season's contracts without explanation. The chamberlain is watching.",
    "The market stalls on the south road have been slower this month. Coincidence, says no one who knows these things.",
  ],
  scholars: [
    "The Scriptorium has been quiet. Not productive-quiet. Something-wrong-quiet.",
    "A scholar submitted their resignation and withdrew it the same afternoon. No one asked why.",
    "Three manuscripts due this season are still unfinished. The scholars say they have been 'preoccupied.'",
  ],
  guard: [
    "Two guards requested reassignment to a different post. They gave no reason. The captain accepted without pressing.",
    "The watch changes have been slower this week. Not dereliction — something closer to low morale.",
    "The gatehouse log has been written in shorter sentences than usual. The guard is unhappy about something.",
  ],
};

// ── Class ────────────────────────────────────────────────────────────────────

export class Factions {
  state: FactionState = { merchants: 0, scholars: 0, guard: 0 };

  private lastCheckedDay = -1;
  /** Faction ids currently above the +5 pleased threshold (for dedup). */
  private notifiedPositive = new Set<FactionId>();
  /** Faction ids currently below the -5 displeased threshold (for dedup). */
  private notifiedNegative = new Set<FactionId>();
  /** Seeded pick counter for prose variety. */
  private pickCounter = 0;

  constructor(
    private world: World,
    private journal: Journal,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Shift a faction's loyalty by `delta`. Clamped to [-10, 10]. */
  adjust(faction: FactionId, delta: number): void {
    this.state[faction] = Math.max(-10, Math.min(10, this.state[faction] + delta));
  }

  get merchantBonus(): boolean { return this.state.merchants > 3; }
  get scholarBonus(): boolean  { return this.state.scholars  > 3; }
  get guardBonus(): boolean    { return this.state.guard     > 3; }

  // ── Tick ───────────────────────────────────────────────────────────────────

  tick(): void {
    const day = this.world.state.day;
    if (day === this.lastCheckedDay) return;
    this.lastCheckedDay = day;

    this._autoAdjust();
    this._applyPassiveEffects();
    this._checkThresholds();
  }

  private _autoAdjust(): void {
    const { economy, usurper, uprising } = this.world;

    // Merchants track gold.
    if (economy.state.gold > 100) this.adjust("merchants",  0.05);
    else if (economy.state.gold < 20) this.adjust("merchants", -0.1);

    // Scholars track tome output.
    if (economy.state.tomes > 20) this.adjust("scholars",  0.05);
    else if (economy.state.tomes < 5) this.adjust("scholars", -0.05);

    // Guard tracks how well threats were handled.
    const stressed = usurper.state.active || uprising.state.active;
    if (stressed) {
      this.adjust("guard", -0.1);
    } else {
      const totalChallenges = usurper.state.totalChallenges + uprising.state.totalUprisings;
      const totalRepelled   = usurper.state.totalRepelled;
      if (totalChallenges > 0 && totalRepelled >= totalChallenges) {
        this.adjust("guard", 0.05); // every threat repelled — guard is proud
      }
    }

    // Slow drift back toward 0 from extremes.
    for (const faction of ["merchants", "scholars", "guard"] as FactionId[]) {
      const v = this.state[faction];
      if (Math.abs(v) > 5) {
        this.state[faction] += v > 0 ? -0.1 : 0.1;
      }
    }
  }

  private _applyPassiveEffects(): void {
    const { economy } = this.world;
    if (this.merchantBonus) economy.state.gold      += 2;
    if (this.scholarBonus)  economy.state.tomes     += 0.3;
    // Guard bonus is read by Threats.ts directly via world.factions.guardBonus.
  }

  private _checkThresholds(): void {
    const FACTIONS: FactionId[] = ["merchants", "scholars", "guard"];
    for (const f of FACTIONS) {
      const loyalty = this.state[f];

      // Pleased threshold: cross +5 for the first time.
      if (loyalty >= 5 && !this.notifiedPositive.has(f)) {
        this.notifiedPositive.add(f);
        const lines = PLEASED_LINES[f];
        this.journal.write(lines[this.pickCounter++ % lines.length], "milestone");
      } else if (loyalty < 3) {
        this.notifiedPositive.delete(f); // reset so it can fire again
      }

      // Displeased threshold: cross -5 for the first time.
      if (loyalty <= -5 && !this.notifiedNegative.has(f)) {
        this.notifiedNegative.add(f);
        const lines = DISPLEASED_LINES[f];
        this.journal.write(lines[this.pickCounter++ % lines.length], "weather");
      } else if (loyalty > -3) {
        this.notifiedNegative.delete(f); // reset
      }
    }
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  snapshot(): FactionState {
    return { ...this.state };
  }

  hydrate(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;
    const clamp = (v: unknown) =>
      typeof v === "number" && isFinite(v) ? Math.max(-10, Math.min(10, v)) : 0;
    this.state.merchants = clamp(r.merchants);
    this.state.scholars  = clamp(r.scholars);
    this.state.guard     = clamp(r.guard);
  }
}
