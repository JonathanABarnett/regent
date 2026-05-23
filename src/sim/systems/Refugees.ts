import type { World } from "../World";
import type { Journal } from "./Journal";
import type { NPC, NPCRole } from "../types";
import { generateName } from "./Names";
import { traitFor } from "./Traits";

/**
 * Refugees — periodic parties fleeing trouble in named off-map kingdoms.
 * Different from immigration wanderers: they arrive en masse (3-6 souls),
 * with a story of escape, and the decision has weight.
 *
 *   ACCEPT   — they join the kingdom. Population boost, gold cost,
 *              reputation +2. Faction dynamics shift.
 *   QUARTER  — kept outside the walls, fed for a week. Costs gold,
 *              minor reputation gain, none join.
 *   REFUSE   — turned away. Reputation -3, journal note that the
 *              kingdom remembers.
 *
 * Gated to year 2+, cooldown of 30 days between events.
 */

const REFUGEE_COOLDOWN_DAYS = 30;
const REFUGEE_CHANCE = 0.25;        // checked once per cooldown window
const ACCEPT_GOLD_COST = 12;
const QUARTER_GOLD_COST = 20;

const TROUBLE_TEMPLATES = [
  "the burning of {partner}",
  "the long winter that took {partner}",
  "the war between {partner} and its neighbours",
  "the flooding of {partner}'s lowlands",
  "the plague that came to {partner}",
  "the famine in {partner}",
  "the coup that ended {partner}'s council",
];

const TRADE_PARTNERS: readonly string[] = [
  "the Verdant League",
  "Kestmark",
  "the Saltwater Companies",
  "the Greycrown Alliance",
  "the Ashwood League",
  "the Bridgewater Companies",
  "the Orevast valley",
  "the Hollow Hills",
];

const ACCEPT_LINES: readonly string[] = [
  "The gates opened today for {count} refugees from {trouble}. They were given bread, then beds, then names on the kingdom's roll.",
  "{count} souls from {trouble} were welcomed at the south gate. The kitchens worked late. The keep stood a little fuller this evening.",
  "The kingdom took in {count} fleeing {trouble}. They will be slow to call this home. They will, eventually.",
];

const QUARTER_LINES: readonly string[] = [
  "{count} refugees from {trouble} were given a week of food and shelter outside the walls. They moved on at week's end with full waterskins and the kingdom's name in their thanks.",
  "A camp was raised for the refugees of {trouble}. Food was sent out each day. After seven days the camp was empty. No one had asked them to stay; no one had pushed them to leave.",
];

const REFUSE_LINES: readonly string[] = [
  "The gates stayed shut to the {count} refugees from {trouble}. The chronicler wrote it down without comment. The kingdom will remember.",
  "The kingdom turned away the people fleeing {trouble}. They camped for a night under the walls and were gone by morning. Their dust took a long time to settle.",
];

export interface RefugeesSnapshot {
  lastEventDay: number;
  totalAccepted: number;
}

export class Refugees {
  state: RefugeesSnapshot = { lastEventDay: -REFUGEE_COOLDOWN_DAYS, totalAccepted: 0 };

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): RefugeesSnapshot { return { ...this.state }; }
  restore(s: RefugeesSnapshot): void { this.state = { ...s }; }

  tick(): void {
    if (this.world.decisions.current()) return;
    if (this.world.state.year < 2) return;
    const day = this.world.state.day;
    if (day - this.state.lastEventDay < REFUGEE_COOLDOWN_DAYS) return;
    if (this.rand() > REFUGEE_CHANCE) return;
    this.state.lastEventDay = day;
    this._propose();
  }

  private _propose(): void {
    const partner = TRADE_PARTNERS[Math.floor(this.rand() * TRADE_PARTNERS.length)];
    const trouble = TROUBLE_TEMPLATES[Math.floor(this.rand() * TROUBLE_TEMPLATES.length)]
      .replace("{partner}", partner);
    const count = 3 + Math.floor(this.rand() * 4); // 3-6 souls

    // Pre-generate the refugee NPCs so the prose can mention names.
    const candidates = Array.from({ length: count }, () => {
      const seed = Math.floor(this.rand() * 2 ** 31);
      const role: NPCRole = this._weightedRole();
      return { role, seed, name: generateName(role, seed) };
    });
    const sampleNames = candidates.slice(0, Math.min(3, candidates.length))
      .map((c) => c.name).join(", ");

    this.world.decisions.propose({
      id: `refugees_${this.world.state.day}`,
      title: `Refugees from ${partner}`,
      body: `${count} souls have arrived at the south gate, fleeing ${trouble}. Among them are ${sampleNames}. How does the kingdom answer?`,
      options: [
        {
          id: "accept",
          label: `Open the gates (${ACCEPT_GOLD_COST} gold)`,
          onChoose: (w) => {
            if (w.economy.state.gold < ACCEPT_GOLD_COST) {
              this.journal.write(
                `The kingdom would have welcomed the refugees from ${partner} but could not afford to feed them. They were turned away with apology.`,
                "event",
              );
              w.reputation.adjust(-1);
              return;
            }
            w.economy.state.gold -= ACCEPT_GOLD_COST;
            w.reputation.adjust(2);
            let added = 0;
            for (const c of candidates) {
              const npc = this._buildNpc(c.role, c.name, c.seed);
              if (w.pushNpc(npc)) added++;
            }
            this.state.totalAccepted += added;
            const line = ACCEPT_LINES[Math.floor(this.rand() * ACCEPT_LINES.length)]
              .replace("{count}", String(added))
              .replace("{trouble}", trouble);
            this.journal.write(line, "milestone");
          },
        },
        {
          id: "quarter",
          label: `Quarter them outside the walls (${QUARTER_GOLD_COST} gold)`,
          onChoose: (w) => {
            if (w.economy.state.gold < QUARTER_GOLD_COST) {
              this.journal.write(
                `The crown intended to quarter the refugees but the treasury could not bear the cost. They were sent on with what bread the kitchens could spare.`,
                "event",
              );
              return;
            }
            w.economy.state.gold -= QUARTER_GOLD_COST;
            w.reputation.adjust(1);
            const line = QUARTER_LINES[Math.floor(this.rand() * QUARTER_LINES.length)]
              .replace("{count}", String(count))
              .replace("{trouble}", trouble);
            this.journal.write(line, "event");
          },
        },
        {
          id: "refuse",
          label: "Turn them away",
          onChoose: (w) => {
            w.reputation.adjust(-3);
            const line = REFUSE_LINES[Math.floor(this.rand() * REFUSE_LINES.length)]
              .replace("{count}", String(count))
              .replace("{trouble}", trouble);
            this.journal.write(line, "event");
          },
        },
      ],
      expiresAt: Date.now() + 180_000,
      defaultOnExpire: false,
    });
  }

  private _weightedRole(): NPCRole {
    const pool: NPCRole[] = [
      "villager", "villager", "villager",
      "miner", "blacksmith", "guard", "scholar",
    ];
    return pool[Math.floor(this.rand() * pool.length)];
  }

  private _buildNpc(role: NPCRole, name: string, seed: number): NPC {
    const w = this.world;
    const homes = w.map.structures.filter((s) => s.kind === "town" || s.kind === "castle");
    const home = homes[Math.floor(this.rand() * homes.length)] ?? w.map.structures[0];
    const workKindFor: Partial<Record<NPCRole, string>> = {
      blacksmith: "forge",
      miner: "mine",
      scholar: "library",
      guard: "castle",
    };
    const wk = workKindFor[role];
    const work = (wk ? w.map.structures.find((s) => s.kind === wk) : undefined) ?? home;
    const center = {
      x: home.pos.x + Math.floor(home.size.x / 2),
      y: home.pos.y + Math.floor(home.size.y / 2),
    };
    return {
      id: `npc_ref_${seed}_${w.state.day}`,
      role,
      name,
      age: 18 + Math.floor(this.rand() * 38),
      trait: traitFor(seed),
      pos: { ...center },
      prevPos: { ...center },
      facing: "s",
      homeId: home.id,
      workId: work.id,
      activity: "idle",
      path: [],
      activityTimer: 1 + this.rand() * 4,
      seed,
    };
  }
}
