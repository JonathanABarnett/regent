import type { World } from "../World";
import type { Journal } from "./Journal";

/**
 * Custom decrees — player-authored laws.
 *
 * The player writes the decree's text (up to 140 chars) and picks ONE of
 * five mechanical effects. The chronicle records the decree verbatim on
 * proclamation and again on expiry (after 14 in-world days). Custom decrees
 * run alongside official Edicts — they're prose with a touch of game effect,
 * not a competing system.
 *
 * Effects:
 *   FAVOR_MERCHANTS — merchants +1 every 5 days while active
 *   FAVOR_SCHOLARS  — scholars  +1 every 5 days while active
 *   FAVOR_GUARD     — guard     +1 every 5 days while active
 *   LIGHTEN_TAXES   — slow gold trickle: -2 gold/day, +1 reputation/5d
 *   FILL_COFFERS    — +3 gold/day, merchants -1 every 5 days
 */

const DURATION_DAYS = 14;
const EFFECT_INTERVAL_DAYS = 5;

export type DecreeEffect =
  | "favor_merchants"
  | "favor_scholars"
  | "favor_guard"
  | "lighten_taxes"
  | "fill_coffers";

export interface DecreeSnapshot {
  text: string;
  effect: DecreeEffect | null;
  startedDay: number;
  endsOnDay: number;
  lastEffectDay: number;
}

const EFFECT_LABELS: Record<DecreeEffect, string> = {
  favor_merchants: "favours merchants",
  favor_scholars: "favours scholars",
  favor_guard: "favours the guard",
  lighten_taxes: "lightens taxes",
  fill_coffers: "fills the coffers",
};

export class CustomDecrees {
  state: DecreeSnapshot = { text: "", effect: null, startedDay: 0, endsOnDay: 0, lastEffectDay: 0 };

  constructor(private world: World, private journal: Journal) {}

  snapshot(): DecreeSnapshot { return { ...this.state }; }
  restore(s: DecreeSnapshot): void { this.state = { ...s }; }

  /** Currently active decree (or null). */
  active(): { text: string; effect: DecreeEffect; daysLeft: number } | null {
    if (!this.state.effect) return null;
    const daysLeft = Math.max(0, this.state.endsOnDay - this.world.state.day);
    return { text: this.state.text, effect: this.state.effect, daysLeft };
  }

  /** Proclaim a new decree. Returns true on success. */
  proclaim(text: string, effect: DecreeEffect): boolean {
    const cleaned = text.trim().slice(0, 140);
    if (!cleaned) return false;
    // If something is active, end it first.
    if (this.state.effect) this._expire();
    this.state.text = cleaned;
    this.state.effect = effect;
    this.state.startedDay = this.world.state.day;
    this.state.endsOnDay = this.world.state.day + DURATION_DAYS;
    this.state.lastEffectDay = this.world.state.day;
    this.journal.write(
      `By royal decree: "${cleaned}" — a decree which ${EFFECT_LABELS[effect]}, in force for ${DURATION_DAYS} days.`,
      "milestone",
    );
    return true;
  }

  /** Called once per in-world day. */
  tick(): void {
    if (!this.state.effect) return;
    const day = this.world.state.day;

    // Apply periodic effects.
    if (day - this.state.lastEffectDay >= EFFECT_INTERVAL_DAYS) {
      this.state.lastEffectDay = day;
      switch (this.state.effect) {
        case "favor_merchants": this.world.factions.adjust("merchants", 1); break;
        case "favor_scholars":  this.world.factions.adjust("scholars", 1);  break;
        case "favor_guard":     this.world.factions.adjust("guard", 1);     break;
        case "lighten_taxes":   this.world.reputation.adjust(1);            break;
        case "fill_coffers":    this.world.factions.adjust("merchants", -1); break;
      }
    }

    // Apply daily tickers for the gold-flow effects.
    if (this.state.effect === "lighten_taxes") {
      this.world.economy.state.gold = Math.max(0, this.world.economy.state.gold - 2);
    } else if (this.state.effect === "fill_coffers") {
      this.world.economy.state.gold = Math.min(99_999, this.world.economy.state.gold + 3);
    }

    // Expire when the window closes.
    if (day >= this.state.endsOnDay) this._expire();
  }

  private _expire(): void {
    if (!this.state.effect) return;
    this.journal.write(
      `The decree "${this.state.text}" came to its appointed end. The chronicler underlined the date.`,
      "event",
    );
    this.state.effect = null;
    this.state.text = "";
    this.state.endsOnDay = 0;
  }
}
