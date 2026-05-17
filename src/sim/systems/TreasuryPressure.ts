/**
 * TreasuryPressure — watches the kingdom's gold over time and fires
 * meaningful events when the economy is under real stress or thriving.
 *
 * Two states:
 *
 *   Bankruptcy threat (gold < 10 for 3+ days):
 *     - First firing: warning journal entry + factions take a hit
 *     - If it persists 5+ days: an NPC villager leaves (walks out)
 *     - Decisions cool down — the throne can't afford them anyway
 *
 *   Prosperity (gold > 500 for 5+ days):
 *     - Celebration milestone + small festival effect
 *     - Faction loyalty boost across the board
 *     - Fires at most once per 30 days
 */

import type { World } from "../World";
import type { Journal } from "./Journal";
import { makeEvent } from "../events/EventSchema";

const BROKE_THRESHOLD  = 10;
const BROKE_WARN_DAYS  = 3;
const BROKE_LEAVE_DAYS = 5;
const RICH_THRESHOLD   = 500;
const RICH_FIRE_DAYS   = 5;
const RICH_COOLDOWN    = 30;

const BROKE_WARNINGS: readonly string[] = [
  "The chamberlain left a note on the throne: the treasury is nearly empty. Creditors have been quietly asking questions.",
  "The treasury is running low. The keep's fires are burning shorter than usual, and the cooks are rationing.",
  "Gold is thin in the royal coffers. The guards are still paid — barely. Everyone knows.",
];

const BROKE_DEPARTURES: readonly string[] = [
  "{name} packed their things quietly and left before dawn. They didn't say anything. They didn't need to.",
  "{name} asked to be released from their position. When asked why, they gestured at the empty market stalls.",
  "Word got around. {name} was the first to leave. Others are watching to see what the crown does next.",
];

const PROSPERITY_LINES: readonly string[] = [
  "The treasury overflows. Merchants are setting up in the squares; the smiths have more orders than hours. The kingdom is thriving.",
  "Five seasons of rising gold. The keep's fires burn warm and long. The people are eating well and talking louder. This is what it should feel like.",
  "The crown's coffers are full. Not just comfortable — genuinely, visibly full. Even the most cautious advisors are smiling.",
];

export class TreasuryPressure {
  private brokeStreak    = 0;
  private richStreak     = 0;
  private brokeWarnFired = false;
  private brokeLeaveFired = false;
  private lastRichFiredDay = -99;
  private lastCheckedDay   = -1;
  private pickCounter      = 0;

  constructor(
    private world: World,
    private journal: Journal,
  ) {}

  tick(): void {
    const day = this.world.state.day;
    if (day === this.lastCheckedDay) return;
    this.lastCheckedDay = day;

    const gold = this.world.economy.state.gold;

    // ── Bankruptcy path ─────────────────────────────────────────────────────
    if (gold < BROKE_THRESHOLD) {
      this.brokeStreak++;
      this.richStreak = 0;

      if (this.brokeStreak >= BROKE_WARN_DAYS && !this.brokeWarnFired) {
        this.brokeWarnFired = true;
        const line = BROKE_WARNINGS[this.pickCounter++ % BROKE_WARNINGS.length];
        const castle = this.world.map.structures.find((s) => s.kind === "castle");
        this.journal.write(line, "weather", castle?.id);
        // Factions feel it
        this.world.factions.adjust("merchants", -2);
        this.world.factions.adjust("guard", -1);
      }

      if (this.brokeStreak >= BROKE_LEAVE_DAYS && !this.brokeLeaveFired) {
        this.brokeLeaveFired = true;
        // One villager leaves
        const leavers = this.world.npcs.filter((n) => n.role === "villager");
        if (leavers.length) {
          const leaver = leavers[Math.floor(Math.random() * leavers.length)];
          const name = leaver.name ?? "someone";
          const line = (BROKE_DEPARTURES[this.pickCounter++ % BROKE_DEPARTURES.length])
            .replace("{name}", name);
          const idx = this.world.npcs.indexOf(leaver);
          if (idx >= 0) this.world.npcs.splice(idx, 1);
          this.journal.write(line, "life", leaver.homeId);
        }
      }
    } else {
      // Gold recovering — reset streak and flags if back above threshold
      if (this.brokeStreak > 0) {
        if (this.brokeWarnFired) {
          this.journal.write(
            "The treasury is recovering. The keep is warmer again, and the chamberlain's notes are shorter.",
            "event",
          );
        }
        this.brokeStreak    = 0;
        this.brokeWarnFired = false;
        this.brokeLeaveFired = false;
      }
    }

    // ── Prosperity path ────────────────────────────────────────────────────
    if (gold > RICH_THRESHOLD) {
      this.richStreak++;
      if (
        this.richStreak >= RICH_FIRE_DAYS &&
        day - this.lastRichFiredDay >= RICH_COOLDOWN
      ) {
        this.lastRichFiredDay = day;
        const line = PROSPERITY_LINES[this.pickCounter++ % PROSPERITY_LINES.length];
        const castle = this.world.map.structures.find((s) => s.kind === "castle");
        this.journal.write(line, "milestone", castle?.id);
        // Festival visual
        if (castle) {
          this.world.bus.publish(
            makeEvent("festival", {
              source: "narrative",
              intensity: 0.8,
              duration_ms: 30_000,
              payload: { structure: castle.id, label: "the treasury overflows" },
            }),
          );
        }
        // Faction boost
        this.world.factions.adjust("merchants", 2);
        this.world.factions.adjust("scholars",  1);
        this.world.factions.adjust("guard",     1);
      }
    } else {
      this.richStreak = 0;
    }
  }

  snapshot() {
    return {
      brokeStreak: this.brokeStreak,
      richStreak:  this.richStreak,
      brokeWarnFired: this.brokeWarnFired,
      brokeLeaveFired: this.brokeLeaveFired,
      lastRichFiredDay: this.lastRichFiredDay,
    };
  }

  hydrate(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;
    if (typeof r.brokeStreak    === "number") this.brokeStreak    = r.brokeStreak;
    if (typeof r.richStreak     === "number") this.richStreak     = r.richStreak;
    if (typeof r.brokeWarnFired === "boolean") this.brokeWarnFired = r.brokeWarnFired;
    if (typeof r.brokeLeaveFired === "boolean") this.brokeLeaveFired = r.brokeLeaveFired;
    if (typeof r.lastRichFiredDay === "number") this.lastRichFiredDay = r.lastRichFiredDay;
  }
}
