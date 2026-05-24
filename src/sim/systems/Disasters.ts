import type { World } from "../World";
import type { Journal } from "./Journal";
import { makeEvent } from "../events/EventSchema";
import { plantGrave } from "./Graves";

/**
 * Disasters system — periodic catastrophes that touch the kingdom in a way
 * named NPCs feel. Three flavours:
 *
 *   PLAGUE  — illness sweeps through; 1-2 specific NPCs die over a few days.
 *             Uses LifeEvents.warDeath() so partners grieve by name.
 *   FAMINE  — slow burn over a season. Population growth halts, faction
 *             loyalty (Merchants in particular) takes a hit, treasury bleeds
 *             a small amount each day. Ends when a season turns or treasury
 *             dips below threshold.
 *   FLOOD   — sudden. Damages a coastal/riverside structure (one journal
 *             entry, gold cost to repair, weather effect on screen).
 *
 * Disasters are rare. Base ~0.4% chance per day, gated to year 2+, with a
 * cooldown so the player doesn't get hammered.
 *
 * Wars and disasters can't co-exist — if a war is active, no disaster fires.
 */

// ── Balance ──────────────────────────────────────────────────────────────────

const MIN_YEAR             = 2;
const COOLDOWN_DAYS        = 35;
const DAILY_CHANCE         = 0.004;
const PLAGUE_DEATH_CHANCE  = 0.65;  // chance per plague-day a named NPC dies
const PLAGUE_DURATION_DAYS = 5;
const FAMINE_DURATION_DAYS = 14;    // one full season
const FAMINE_GOLD_LOSS     = 2;     // per day during famine
const FLOOD_GOLD_LOSS      = 25;

// ── Prose pools ──────────────────────────────────────────────────────────────

const PLAGUE_DECLARATION: readonly string[] = [
  "A fever is spreading through the south quarter. The kingdom's healers have asked everyone to stay home.",
  "Reports of illness have reached the keep. It is not localised. It is moving.",
  "Three families fell sick at once on the same street. It will be more before it is less.",
  "The chronicler notes today: 'a sickness with no name has come to the kingdom.'",
];

const PLAGUE_DEATH_LINES: readonly string[] = [
  "{name} did not survive the fever. They were ill for three days, then quiet, then gone.",
  "{name}, the {role}, was taken by the sickness this morning. Their household will not be visited until the danger passes.",
  "The fever claimed {name} before dawn. The healers were with them. So was {role_phrase}.",
  "{name} was the seventh person on their street to fall ill. They did not rise.",
];

const PLAGUE_GRIEF: readonly string[] = [
  " {partner} was not allowed to be at the bedside. They learned at the doorway. They have not stopped washing their hands.",
  " {partner} sat in the courtyard at the news and did not move for the rest of the day.",
  " {partner} keeps working. They have no other way to do this.",
];

const PLAGUE_END_LINES: readonly string[] = [
  "The fever broke over the kingdom today. No new cases for three days. The healers think it is over.",
  "The sickness has passed. The kingdom is quieter than it was, and more careful, and learning.",
  "A bell rang at the keep at noon — the all-clear. The plague is over. The dead are counted.",
];

const FAMINE_DECLARATION: readonly string[] = [
  "The harvest came in thin this year. The mill stewards have already raised concerns. The kingdom is facing a hungry season.",
  "The fields did not produce what they should have. Word has reached the keep. Famine.",
  "Granaries are below the level they should be at this point in the year. The stewards have begun rationing.",
  "An accounting of the kingdom's stores was made this morning. The numbers do not flatter.",
];

const FAMINE_END_LINES: readonly string[] = [
  "The famine has eased. The next harvest came in fuller. People are eating again.",
  "After a hungry season, the granaries are filling. The kingdom remembers.",
  "The bread queues thinned this morning. The famine is officially declared ended.",
];

const FLOOD_LINES: readonly string[] = [
  "Heavy rains in the north filled the river to spilling. Water came through the lower gate by morning. {structure} has water damage.",
  "The river burst its banks overnight. The kingdom's south quarter is wading. Repairs to {structure} will run to {gold} gold.",
  "A flood has reached {structure}. The water has receded; the damage has not. Repairs are underway.",
];

// ── State ────────────────────────────────────────────────────────────────────

export type DisasterKind = "plague" | "famine" | "flood" | null;

export interface DisasterSnapshot {
  active: DisasterKind;
  startedDay: number;
  lastCheckedDay: number;
  lastDisasterEndedDay: number;
  /** plague-specific: days remaining */
  daysRemaining: number;
  /** plague-specific: names of NPCs killed in this outbreak */
  victimNames: string[];
}

function fresh(): DisasterSnapshot {
  return {
    active: null,
    startedDay: 0,
    lastCheckedDay: -1,
    lastDisasterEndedDay: -COOLDOWN_DAYS,
    daysRemaining: 0,
    victimNames: [],
  };
}

// ── System ───────────────────────────────────────────────────────────────────

export class Disasters {
  state: DisasterSnapshot = fresh();

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): DisasterSnapshot { return { ...this.state, victimNames: [...this.state.victimNames] }; }
  restore(s: DisasterSnapshot): void { this.state = { ...s, victimNames: [...s.victimNames] }; }

  tick(): void {
    const day = this.world.state.day;
    if (day === this.state.lastCheckedDay) return;
    this.state.lastCheckedDay = day;

    if (this.state.active) {
      this._tickActive(day);
      return;
    }

    if (this.world.war.state.active) return;             // no overlap with war
    if (this.world.state.year < MIN_YEAR) return;
    if (day - this.state.lastDisasterEndedDay < COOLDOWN_DAYS) return;
    if (this.rand() > DAILY_CHANCE) return;

    // Pick a disaster kind. Plague slightly favoured for the named-victim
    // emotional payoff that's the system's whole point.
    const roll = this.rand();
    if (roll < 0.5) this._startPlague(day);
    else if (roll < 0.85) this._startFamine(day);
    else this._startFlood(day);
  }

  // ── Plague ──────────────────────────────────────────────────────────────

  private _startPlague(day: number): void {
    this.state.active = "plague";
    this.state.startedDay = day;
    this.state.daysRemaining = PLAGUE_DURATION_DAYS;
    this.state.victimNames = [];

    const line = PLAGUE_DECLARATION[Math.floor(this.rand() * PLAGUE_DECLARATION.length)];
    this.journal.write(line, "event");

    // Storm visual to mark the moment.
    this.world.bus.publish(
      makeEvent("storm", { source: "internal", intensity: 0.4, duration_ms: 8_000, payload: {} }),
    );
  }

  private _tickPlague(day: number): void {
    this.state.daysRemaining--;

    if (this.rand() < PLAGUE_DEATH_CHANCE) {
      // Pick a victim — prefer non-monarch, weighted toward older NPCs.
      const candidates = this.world.npcs.filter(
        (n) => n.role !== "monarch" && (n.age ?? 0) >= 5,
      );
      if (candidates.length > 0) {
        candidates.sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
        const pickFrom = candidates.slice(0, Math.max(3, Math.floor(candidates.length / 2)));
        const victim = pickFrom[Math.floor(this.rand() * pickFrom.length)];
        if (victim.name) this.state.victimNames.push(victim.name);
        this._plagueDeath(victim);
      }
    }

    if (this.state.daysRemaining <= 0) this._endPlague();
  }

  /** Custom plague-death entry — uses LifeEvents pattern but plague-specific prose. */
  private _plagueDeath(npc: import("../types").NPC): void {
    const idx = this.world.npcs.findIndex((n) => n.id === npc.id);
    if (idx < 0) return;
    this.world.npcs.splice(idx, 1);

    const partner = npc.partnerId
      ? this.world.npcs.find((n) => n.id === npc.partnerId)
      : undefined;
    const children = this.world.npcs.filter((n) => n.parentIds?.includes(npc.id));

    let line = PLAGUE_DEATH_LINES[Math.floor(this.rand() * PLAGUE_DEATH_LINES.length)];
    const rolePhrase =
      npc.role === "guard" ? "their captain"
      : npc.role === "blacksmith" ? "the apprentice"
      : npc.role === "scholar" ? "a fellow scholar"
      : "a friend";
    line = line
      .replace("{name}", npc.name ?? "one of us")
      .replace("{role}", npc.role)
      .replace("{role_phrase}", rolePhrase);

    if (partner?.name) {
      const addendum = PLAGUE_GRIEF[Math.floor(this.rand() * PLAGUE_GRIEF.length)]
        .replace("{partner}", partner.name);
      line += addendum;
    } else if (children.length > 0) {
      const names = children
        .filter((c) => c.name)
        .map((c) => c.name!)
        .slice(0, 2)
        .join(" and ");
      if (names) line += ` Their ${children.length === 1 ? "child" : `${children.length} children`} — ${names} — survive them.`;
    }

    if (partner) {
      partner.partnerId = undefined;
      partner.partneredOnDay = undefined;
    }
    for (const child of children) {
      if (child.parentIds) {
        child.parentIds = child.parentIds.filter((id) => id !== npc.id);
      }
    }
    this.journal.write(line, "life", npc.homeId);

    // Plant a grave for the plague victim and record for remembrance.
    if (npc.name) {
      plantGrave(this.world, npc.name);
      this.world.remembrance.record(npc.name, this.world.state.day, this.world.state.year);
    }
  }

  private _endPlague(): void {
    const line = PLAGUE_END_LINES[Math.floor(this.rand() * PLAGUE_END_LINES.length)];
    this.journal.write(line, "milestone");
    this.state.active = null;
    this.state.lastDisasterEndedDay = this.world.state.day;
    this.state.daysRemaining = 0;
  }

  // ── Famine ──────────────────────────────────────────────────────────────

  private _startFamine(day: number): void {
    this.state.active = "famine";
    this.state.startedDay = day;
    this.state.daysRemaining = FAMINE_DURATION_DAYS;
    const line = FAMINE_DECLARATION[Math.floor(this.rand() * FAMINE_DECLARATION.length)];
    this.journal.write(line, "event");
  }

  private _tickFamine(): void {
    this.state.daysRemaining--;
    // Bleed gold to feed the kingdom from reserves.
    this.world.economy.state.gold = Math.max(0, this.world.economy.state.gold - FAMINE_GOLD_LOSS);
    // Merchants take the hit hardest.
    if (this.rand() < 0.10) this.world.factions.adjust("merchants", -1);

    if (this.state.daysRemaining <= 0) this._endFamine();
  }

  private _endFamine(): void {
    const line = FAMINE_END_LINES[Math.floor(this.rand() * FAMINE_END_LINES.length)];
    this.journal.write(line, "milestone");
    this.state.active = null;
    this.state.lastDisasterEndedDay = this.world.state.day;
    this.state.daysRemaining = 0;
  }

  // ── Flood ───────────────────────────────────────────────────────────────

  private _startFlood(day: number): void {
    // Pick a structure near water (or any structure if none).
    const target =
      this.world.map.structures.find((s) => s.kind === "mill")
      ?? this.world.map.structures.find((s) => s.kind === "town")
      ?? this.world.map.structures[0];
    if (!target) return;

    this.state.active = "flood";
    this.state.startedDay = day;
    this.state.daysRemaining = 1;

    const goldLoss = Math.min(this.world.economy.state.gold, FLOOD_GOLD_LOSS);
    this.world.economy.state.gold -= goldLoss;

    const line = FLOOD_LINES[Math.floor(this.rand() * FLOOD_LINES.length)]
      .replace("{structure}", target.name)
      .replace("{gold}", String(Math.floor(goldLoss)));
    this.journal.write(line, "event", target.id);

    this.world.bus.publish(
      makeEvent("storm", { source: "internal", intensity: 0.9, duration_ms: 20_000, payload: {} }),
    );

    // Flood is instantaneous; resolve next tick.
    this.state.lastDisasterEndedDay = day;
    this.state.active = null;
  }

  // ── Active dispatch ─────────────────────────────────────────────────────

  private _tickActive(day: number): void {
    if (this.state.active === "plague") this._tickPlague(day);
    else if (this.state.active === "famine") this._tickFamine();
    // flood resolves immediately in _startFlood and clears active before this is reached
  }
}
