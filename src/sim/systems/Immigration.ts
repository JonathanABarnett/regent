import type { World } from "../World";
import type { Journal } from "./Journal";
import type { NPC, NPCRole, Structure } from "../types";
import { generateName } from "./Names";
import { traitFor } from "./Traits";
import { makeEvent } from "../events/EventSchema";

/**
 * Immigration system — how new NPCs join the kingdom.
 *
 * There are two growth pathways:
 *
 * 1. Wanderers  — individuals who drift in as the frontier expands.
 *    Every WANDERER_INTERVAL in-world days (once the explored radius
 *    has grown past the starting bubble), there is a random chance a
 *    traveller arrives at the gates. A Decision fires:
 *      • "Welcome them" — free, they settle at their own pace.
 *      • "Pay to recruit" — faster, costs gold.
 *      • "Turn them away" — they leave and the kingdom is the quieter for it.
 *
 * 2. Rival camps — when a "camp" structure enters the explored zone a
 *    Decision fires offering three options:
 *      • "Send diplomats" — expensive but clean; reputation gains slightly.
 *      • "Raid at dawn"   — cheap and ugly; forces join, reputation drops,
 *                           a brief conflict effect fires on the world bus.
 *      • "Leave them be"  — the camp stays neutral.
 *
 * Population growth is intentionally slow at first — the founding party
 * of 5 people should feel intimate before the kingdom expands.
 */

/** Days between eligible wanderer windows. */
const WANDERER_INTERVAL = 14;

/** Base probability a wanderer arrives in an eligible window. */
const WANDERER_CHANCE = 0.45;

/** Gold cost for the "pay to recruit" wanderer option. */
const RECRUIT_GOLD_COST = 20;

/** Gold cost for sending diplomats to a rival camp. */
const DIPLOMACY_GOLD_COST = 25;

/** Gold cost for raiding a rival camp (minimal outfitting). */
const RAID_GOLD_COST = 8;

/**
 * Weighted role pool for wanderers. Scholars appear rarely — they're
 * valuable and should feel like a meaningful find.
 */
const WANDERER_ROLE_POOL: NPCRole[] = [
  "villager", "villager", "villager",
  "guard", "guard",
  "blacksmith", "blacksmith",
  "miner", "miner",
  "scholar",
  "courier",
];

/** First-person arrival flavour text, keyed by role. {name} is replaced. */
const WANDERER_FLAVOR: Partial<Record<NPCRole, string>> = {
  villager:
    "{name} arrived at the south gate with a cart, a family of three, and the earnest expectation of somewhere to plant roots.",
  guard:
    "A discharged soldier named {name} — bearing the quiet marks of a distant campaign — arrived at the gate, asking for honest service.",
  blacksmith:
    "{name} arrived with a full toolkit and a letter of reference from a city that no longer exists. The tools are real, at least.",
  miner:
    "{name} appeared at the east gate before dawn with nothing but a pickaxe and the expectation of deep work.",
  scholar:
    "{name}, a wandering academic, heard the kingdom had a library. They came to investigate whether it deserved the rumor.",
  courier:
    "{name} arrived between posts, between payrolls, and between kingdoms — looking for one that would keep them.",
};

export interface ImmigrationSnapshot {
  lastWandererDay: number;
  processedCampIds: string[];
}

export class Immigration {
  private lastWandererDay = 0;
  private processedCampIds = new Set<string>();

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): ImmigrationSnapshot {
    return {
      lastWandererDay: this.lastWandererDay,
      processedCampIds: [...this.processedCampIds],
    };
  }

  restore(snap: ImmigrationSnapshot): void {
    this.lastWandererDay = snap.lastWandererDay;
    this.processedCampIds = new Set(snap.processedCampIds);
  }

  /** Called once per in-world day from World.tick(). */
  tick(): void {
    // Check explored camps first — they take priority over wanderers.
    this._checkNewCamps();
    this._checkWandererArrival();
  }

  // ── private ────────────────────────────────────────────────────────────────

  /**
   * True when ANY decision is queued. Immigration won't stack on top of
   * war-strategy, usurper, uprising, or construction decisions — the player
   * should answer one thing at a time.
   */
  private _hasPendingDecision(): boolean {
    return this.world.decisions.current() !== null;
  }

  private _checkNewCamps(): void {
    if (this._hasPendingDecision()) return;
    for (const s of this.world.map.structures) {
      if (s.kind !== "camp") continue;
      if (this.processedCampIds.has(s.id)) continue;
      const tile = this.world.map.tiles[s.pos.y * this.world.map.width + s.pos.x];
      if (!tile?.explored) continue;
      this.processedCampIds.add(s.id);
      this._proposeCampDecision(s);
      break; // one camp decision at a time
    }
  }

  private _checkWandererArrival(): void {
    if (this._hasPendingDecision()) return;
    const day = this.world.state.day;
    if (day - this.lastWandererDay < WANDERER_INTERVAL) return;
    // Require meaningful frontier expansion beyond the starting bubble.
    if (this.world.exploration.radius < 32) return;
    // Prosperity bonus: flush treasury attracts more people.
    const bonus = this.world.economy.state.gold > 80 ? 0.2 : 0;
    if (this.rand() > WANDERER_CHANCE + bonus) return;

    this.lastWandererDay = day;
    this._proposeWandererDecision();
  }

  private _proposeWandererDecision(): void {
    const role = WANDERER_ROLE_POOL[Math.floor(this.rand() * WANDERER_ROLE_POOL.length)];
    const seed = Math.floor(this.rand() * 2 ** 31);
    const name = generateName(role, seed);
    const template = WANDERER_FLAVOR[role] ?? "{name} has arrived at the kingdom gates.";
    const body = template.replace("{name}", name);

    // Close over the NPC data so it's available in both choice callbacks.
    const spawnNPC = (w: World) => {
      const npc = this._buildNpc(role, name, seed);
      if (w.pushNpc(npc)) {
        this.journal.write(
          `${name} settled into the kingdom and took up work as a ${role}.`,
          "life",
        );
      }
    };

    this.world.decisions.propose({
      id: `imm_wanderer_${this.world.state.day}`,
      title: "A traveller at the gates",
      body,
      options: [
        {
          id: "welcome",
          label: "Welcome them (free)",
          onChoose: (w) => spawnNPC(w),
        },
        {
          id: "pay",
          label: `Pay to recruit (${RECRUIT_GOLD_COST} gold)`,
          onChoose: (w) => {
            if (w.economy.state.gold >= RECRUIT_GOLD_COST) {
              w.economy.state.gold -= RECRUIT_GOLD_COST;
              spawnNPC(w);
            } else {
              this.journal.write(
                `The treasury could not fund ${name}'s recruitment — they moved on.`,
                "event",
              );
            }
          },
        },
        {
          id: "refuse",
          label: "Turn them away",
          onChoose: () => {
            this.journal.write(
              `${name} was turned away at the gate. They did not look back.`,
              "life",
            );
          },
        },
      ],
      expiresAt: Date.now() + 120_000, // 2-minute window
      defaultOnExpire: false,          // silence = they quietly leave
    });
  }

  private _proposeCampDecision(camp: Structure): void {
    const count = 1 + Math.floor(this.rand() * 2); // 1 or 2 occupants
    const candidates = Array.from({ length: count }, () => {
      const role = WANDERER_ROLE_POOL[Math.floor(this.rand() * WANDERER_ROLE_POOL.length)];
      const seed = Math.floor(this.rand() * 2 ** 31);
      return { role, name: generateName(role, seed), seed };
    });
    const nameList = candidates.map((c) => c.name).join(" and ");
    const plural = count > 1;

    const addCandidates = (w: World) => {
      for (const c of candidates) {
        w.pushNpc(this._buildNpc(c.role, c.name, c.seed));
      }
    };

    this.world.decisions.propose({
      id: `imm_camp_${camp.id}`,
      title: `Rival encampment: ${camp.name}`,
      body:
        `Scouts have confirmed an occupied camp at ${camp.name}. ` +
        `${plural ? `${count} capable residents — ` : "One capable resident — "}` +
        `${nameList} — currently answer to no crown.`,
      options: [
        {
          id: "diplomacy",
          label: `Send diplomats (${DIPLOMACY_GOLD_COST} gold)`,
          onChoose: (w) => {
            if (w.economy.state.gold >= DIPLOMACY_GOLD_COST) {
              w.economy.state.gold -= DIPLOMACY_GOLD_COST;
              w.reputation.adjust(1);
              addCandidates(w);
              this.journal.write(
                `Envoys returned from ${camp.name} with an agreement — and with ${nameList}. The camp's banner came down peaceably.`,
                "event",
                camp.id,
              );
            } else {
              this.journal.write(
                `The treasury had no funds for a diplomatic mission to ${camp.name}.`,
                "event",
              );
            }
          },
        },
        {
          id: "raid",
          label: "Raid at dawn",
          onChoose: (w) => {
            if (w.economy.state.gold >= RAID_GOLD_COST) {
              w.economy.state.gold -= RAID_GOLD_COST;
            }
            w.reputation.adjust(-2);
            addCandidates(w);
            this.journal.write(
              `The raid was swift. ${nameList} ${plural ? "were brought" : "was brought"} to the kingdom by force. The fires at ${camp.name} have been put out.`,
              "event",
              camp.id,
            );
            // Fire a brief conflict visual on the world bus.
            w.bus.publish(
              makeEvent("monster", {
                source: "internal",
                intensity: 0.6,
                duration_ms: 12_000,
                payload: { label: `Raid: ${camp.name}` },
              }),
            );
          },
        },
        {
          id: "ignore",
          label: "Leave them be",
          onChoose: () => {
            this.journal.write(
              `The camp at ${camp.name} was left undisturbed. Their fires still burn on the horizon.`,
              "event",
              camp.id,
            );
          },
        },
      ],
      expiresAt: Date.now() + 180_000, // 3-minute window
      defaultOnExpire: false,
    });
  }

  /**
   * Construct a fully-initialised NPC at the most appropriate home and
   * workplace for their role. Called when a decision is resolved.
   */
  private _buildNpc(role: NPCRole, name: string, seed: number): NPC {
    const w = this.world;
    const homes = w.map.structures.filter(
      (s) => s.kind === "town" || s.kind === "castle",
    );
    const home = homes.length
      ? homes[Math.floor(this.rand() * homes.length)]
      : w.map.structures[0];

    const workKindFor: Partial<Record<NPCRole, string>> = {
      blacksmith: "forge",
      miner: "mine",
      scholar: "library",
      guard: "castle",
      courier: "castle",
    };
    const workKind = workKindFor[role];
    const work =
      (workKind ? w.map.structures.find((s) => s.kind === workKind) : undefined)
      ?? home;

    const center = {
      x: home.pos.x + Math.floor(home.size.x / 2),
      y: home.pos.y + Math.floor(home.size.y / 2),
    };

    return {
      id: `npc_imm_${seed}_${w.state.day}`,
      role,
      name,
      age: 18 + Math.floor(this.rand() * 40),
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
