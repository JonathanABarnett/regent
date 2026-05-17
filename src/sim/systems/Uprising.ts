/**
 * Peasant Uprising system — when the kingdom is under pressure (year >= 3,
 * population >= 25, gold < 50), a villager rises as an agitator and organises
 * the populace.
 *
 * Conditions:
 *   - year >= 3
 *   - npcs.length >= 25
 *   - economy.gold < 50
 *   - no usurper challenge already active
 *   - cooldown of 20 days since last uprising
 *
 * Flow:
 *   1. Rolls ~1.5 % chance per day while conditions hold.
 *   2. Picks a villager NPC as the agitator, writes a journal entry.
 *   3. Proposes a 3-option decision:
 *        Address Grievances → 40 gold spent; agitator becomes a trusted
 *          scholar and journal records the reform
 *        Suppress           → agitator removed; a few NPCs leave; tense but stable
 *        Yield to the Uprising → agitator installed as new monarch of peasant
 *          stock; dynastyStreak resets; costly in gold; dramatic milestone
 *   4. If the player ignores the decision, the uprising succeeds (agitator wins).
 *
 * stirUnrest() — called by the Usurper system when the "imprison" path is
 * chosen. Advances the cooldown so an uprising can fire sooner.
 *
 * Captain seated: 40 % reduction in uprising chance.
 * Open Court edict: slight reduction (the people feel heard, reducing tension).
 */

import type { World } from "../World";
import type { Journal } from "./Journal";
import { generateName } from "./Names";

export interface UprisingState {
  /** An uprising is in progress and awaiting player resolution. */
  active: boolean;
  /** Id of the agitator NPC. */
  agitatorId?: string;
  /** Name kept for prose even if the NPC is removed. */
  agitatorName?: string;
  /** Day the uprising began. */
  startedDay: number;
  /** Real-time ms deadline for the player decision. */
  decisionExpiresAt: number;
  /** Last day the roll ran — minimum gap between uprisings. */
  lastCheckedDay: number;
  /** Total uprisings seen this kingdom. */
  totalUprisings: number;
}

const AGITATOR_SPEECHES = [
  "The keep feasts while the south quarter freezes. This ends today.",
  "We built every wall and plowed every field. The throne gives nothing back.",
  "The crown counts its gold. We count our empty shelves. The math is simple.",
  "I have seen three winters pass without a word from the castle. My neighbors have run out of patience, and so have I.",
  "The law protects the wealthy and punishes the hungry. We are done accepting that.",
  "We are not rebels. We are people. We simply refuse to be invisible anymore.",
  "The smiths, the farmers, the miners — every hand that built this place — we speak as one voice now.",
  "The guards watch the road to the north. But the hunger is in the south. They've been looking in the wrong direction.",
];

export class Uprising {
  state: UprisingState = {
    active: false,
    startedDay: 0,
    decisionExpiresAt: 0,
    lastCheckedDay: 0,
    totalUprisings: 0,
  };

  private readonly minYear = 3;
  private readonly minPop = 25;
  private readonly goldThreshold = 50;
  private readonly minDaysBetween = 20;
  private readonly baseChance = 0.015;

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  /** Called on day rollover from World.tick. */
  tick(): void {
    // If an uprising is active, check whether the player let the window lapse.
    if (this.state.active) {
      if (Date.now() > this.state.decisionExpiresAt) {
        // Player ignored it — uprising succeeds.
        this._installAgitator(
          this.state.agitatorId,
          this.state.agitatorName ?? "the agitator",
          this.world.map.structures.find((s) => s.kind === "castle")?.id,
        );
      }
      return;
    }

    const { day, year } = this.world.state;
    if (year < this.minYear) return;
    if (this.world.npcs.length < this.minPop) return;
    if (this.world.economy.state.gold >= this.goldThreshold) return;
    // Don't stack with an active usurper challenge.
    if (this.world.usurper.state.active) return;
    if (day - this.state.lastCheckedDay < this.minDaysBetween) return;
    this.state.lastCheckedDay = day;

    let chance = this.baseChance;
    // Captain reduces chance; open court edict reduces it too (people feel heard).
    if (this.world.courtEffects.captainSeated) chance *= 0.6;
    if (this.world.edictEffects.openCourt) chance *= 0.7;
    if (this.rand() >= chance) return;

    this._fireUprising();
  }

  /**
   * Advance the cooldown so an uprising can fire sooner. Called by Usurper
   * when the "imprison" path is taken — jailing the usurper stirs the people.
   */
  stirUnrest(): void {
    // Halve the remaining cooldown (can't go below 0).
    const halvedGap = Math.floor(this.minDaysBetween / 2);
    this.state.lastCheckedDay = Math.max(0, this.state.lastCheckedDay - halvedGap);
  }

  private _fireUprising(): void {
    const { day } = this.world.state;

    // Prefer villagers as agitators — they ARE the people.
    const villagers = this.world.npcs.filter(
      (n) => n.role === "villager" && (n.age ?? 30) >= 18,
    );
    const pool = villagers.length ? villagers : this.world.npcs.filter((n) => n.role !== "monarch");
    if (!pool.length) return;

    const agitator = pool[Math.floor(this.rand() * pool.length)];
    const speech = AGITATOR_SPEECHES[Math.floor(this.rand() * AGITATOR_SPEECHES.length)];
    const agitatorName = agitator.name ?? generateName("villager", agitator.seed);

    const windowMs = this.world.courtEffects.advisorSeated ? 180_000 : 90_000;
    const expiresAt = Date.now() + windowMs;

    this.state.active = true;
    this.state.agitatorId = agitator.id;
    this.state.agitatorName = agitatorName;
    this.state.startedDay = day;
    this.state.decisionExpiresAt = expiresAt;
    this.state.totalUprisings++;

    const castle = this.world.map.structures.find((s) => s.kind === "castle");
    const town = this.world.npcs.find((n) => n.id === agitator.id)
      ? this.world.map.structures.find((s) => s.id === agitator.homeId) ?? castle
      : castle;

    this.journal.write(
      `${agitatorName} climbed the market steps and addressed a crowd that had been waiting for someone to speak first. ` +
        `"${speech}" The kingdom is listening.`,
      "milestone",
      town?.id,
    );

    const agitatorId = agitator.id;
    const agitatorNameSnap = agitatorName;
    const castleId = castle?.id;
    const rand = this.rand;

    this.world.decisions.propose({
      id: `uprising_${day}_${this.state.totalUprisings}`,
      title: `The people are rising in ${town?.name ?? "the towns"}`,
      body: `${agitatorName}: "${speech}" The crowd is growing. What does the crown do?`,
      expiresAt,
      defaultOnExpire: false, // tick() handles expiry.
      options: [
        {
          id: "address",
          label: "Address their grievances",
          onChoose: (w) => {
            const cost = 40;
            w.economy.state.gold = Math.max(0, w.economy.state.gold - cost);
            // Agitator is converted to a trusted voice in the court.
            const npc = w.npcs.find((n) => n.id === agitatorId);
            if (npc) npc.role = "scholar";
            this.state.active = false;
            this.state.agitatorId = undefined;
            w.journal.write(
              `The crown opened the gates and heard the people out. ${cost} gold was committed to new grain stores and repairs. ` +
                `${agitatorNameSnap} was invited to advise on the settlement — a quiet victory for both sides.`,
              "milestone",
              castleId,
            );
            // Small chance of a reform decree becoming a vault artifact.
            if (rand() < 0.4) {
              w.treasury.acquire("scroll", `the ${w.state.year > 3 ? "people's" : "great"} reform of year ${w.state.year}`);
            }
          },
        },
        {
          id: "suppress",
          label: "Suppress the uprising",
          onChoose: (w) => {
            const agitatorIdx = w.npcs.findIndex((n) => n.id === agitatorId);
            if (agitatorIdx >= 0) w.npcs.splice(agitatorIdx, 1);
            // Remove 2-3 other villagers (they leave in protest).
            const leavers = w.npcs
              .filter((n) => n.role === "villager")
              .slice(0, 2 + Math.floor(rand() * 2));
            for (const l of leavers) {
              const li = w.npcs.indexOf(l);
              if (li >= 0) w.npcs.splice(li, 1);
            }
            this.state.active = false;
            this.state.agitatorId = undefined;
            w.journal.write(
              `The guard moved on the crowd before dawn. ${agitatorNameSnap} was driven out; ` +
                `${leavers.length + 1} souls left the kingdom that week. The streets were quiet. ` +
                `Not peaceful — quiet.`,
              "milestone",
              castleId,
            );
          },
        },
        {
          id: "yield",
          label: "Yield to the people",
          onChoose: (w) => {
            this._installAgitator(agitatorId, agitatorNameSnap, castleId);
          },
        },
      ],
    });
  }

  /**
   * Install the agitator as the new monarch. Called on "yield" or window lapse.
   */
  _installAgitator(
    agitatorId: string | undefined,
    agitatorName: string,
    castleId: string | undefined,
  ): void {
    const w = this.world;
    const oldMonarch = w.npcs.find((n) => n.role === "monarch");
    const oldName = oldMonarch?.name ?? "the monarch";
    const castle = castleId ? w.map.structures.find((s) => s.id === castleId) : undefined;

    const agitator = agitatorId ? w.npcs.find((n) => n.id === agitatorId) : undefined;

    if (agitator && castle) {
      agitator.role = "monarch";
      agitator.homeId = castle.id;
      agitator.workId = castle.id;
      agitator.pos = {
        x: castle.pos.x + Math.floor(castle.size.x / 2),
        y: castle.pos.y + Math.floor(castle.size.y / 2),
      };
      agitator.prevPos = { ...agitator.pos };
    } else if (castle) {
      const center = {
        x: castle.pos.x + Math.floor(castle.size.x / 2),
        y: castle.pos.y + Math.floor(castle.size.y / 2),
      };
      const seed = Math.floor(Math.random() * 2 ** 31);
      w.pushNpc({
        id: `npc_uprising_${w.state.day}`,
        role: "monarch",
        name: agitatorName,
        age: 30,
        pos: { ...center },
        prevPos: { ...center },
        facing: "s",
        homeId: castle.id,
        workId: castle.id,
        activity: "idle",
        path: [],
        activityTimer: 4,
        seed,
      });
    }

    if (oldMonarch) {
      const idx = w.npcs.findIndex((n) => n.id === oldMonarch.id);
      if (idx >= 0) w.npcs.splice(idx, 1);
    }

    const reignDuration = w.state.day - w.succession.state.reignStartDay;
    w.succession.state.generation += 1;
    w.succession.state.reignStartDay = w.state.day;
    // Uprising takeover breaks the dynasty streak.
    w.succession.state.dynastyStreak = 0;

    w.journal.write(
      `${oldName} stepped down as the crowd filled the courtyard. ` +
        `${agitatorName}, of common stock and uncommon conviction, took the throne. ` +
        `The kingdom's ${ordinal(w.succession.state.generation)} monarch — the first of the people's line.`,
      "milestone",
      castleId,
    );

    w.succession.announceSuccession({
      oldName,
      newName: agitatorName,
      generation: w.succession.state.generation,
      reignDurationDays: reignDuration,
    });

    this.state.active = false;
    this.state.agitatorId = undefined;
    this.state.agitatorName = undefined;
    this.state.decisionExpiresAt = 0;
  }

  /** Snapshot for persistence. */
  snapshot(): UprisingState {
    return { ...this.state };
  }

  /** Restore from save. */
  hydrate(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;
    this.state.active = Boolean(r.active);
    this.state.agitatorId = typeof r.agitatorId === "string" ? r.agitatorId : undefined;
    this.state.agitatorName = typeof r.agitatorName === "string" ? r.agitatorName : undefined;
    this.state.startedDay = typeof r.startedDay === "number" ? r.startedDay : 0;
    this.state.decisionExpiresAt = typeof r.decisionExpiresAt === "number" ? r.decisionExpiresAt : 0;
    this.state.lastCheckedDay = typeof r.lastCheckedDay === "number" ? r.lastCheckedDay : 0;
    this.state.totalUprisings = typeof r.totalUprisings === "number" ? r.totalUprisings : 0;
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
