/**
 * Usurper system — a court figure who accumulates enough power to challenge
 * the throne. Fires at most once every ~12 days, guarded by year >= 2.
 *
 * Flow:
 *   1. Daily roll (year >= 2, cooldown satisfied) → pick a claimant NPC
 *   2. Journal announcement + decision proposed to the player
 *   3. Player chooses within the window:
 *        Exile      → claimant removed, 20 gold cost; small relic chance
 *        Negotiate  → claimant stays (becomes scholar), 35 gold cost
 *        Imprison   → claimant removed; stirs future unrest via Uprising
 *        Yield      → claimant installed as monarch, dynastyStreak resets
 *   4. If the player ignores the decision (window lapses), the usurper wins.
 *
 * Captain seated: challenge chance halved.
 * Open Court edict: challenge chance slightly raised (more discourse).
 * Advisor seated: decision window doubled.
 */

import type { World } from "../World";
import type { Journal } from "./Journal";
import { generateName } from "./Names";
import { writeMonarchLegacy } from "./MonarchLegacy";

export interface UsurperState {
  /** A challenge is in progress and waiting on the player (or lapsing). */
  active: boolean;
  /** Id of the NPC who declared the challenge. */
  claimantId?: string;
  /** Name, kept even if the NPC is later removed so journal lines stay coherent. */
  claimantName?: string;
  /** Title to prepend to the claimant's name in prose. */
  claimantTitle?: string;
  /** In-world day the challenge was declared. */
  startedDay: number;
  /** Real-time ms deadline for the player decision (copied here so we can
   *  detect expiry inside tick() without querying the Decisions queue). */
  decisionExpiresAt: number;
  /** Last day we ran the roll — enforces minimum gap between challenges. */
  lastCheckedDay: number;
  /** How many usurper challenges this kingdom has seen in total. */
  totalChallenges: number;
  /** How many challenges the player successfully repelled. */
  totalRepelled: number;
}

const TITLES = [
  "Lord", "Lady", "Duke", "Duchess", "Earl", "Countess",
  "Baron", "Baroness", "Marshal", "Admiral", "Archon", "Warden",
];

const GRIEVANCES = [
  "The crown has grown distant from those it rules. I speak for the forgotten.",
  "Three harvests of silence from the throne. The people have chosen their own voice.",
  "I do not seek war. I seek only what is already mine by right of the people.",
  "The old ways are crumbling. Either the throne changes, or the throne changes hands.",
  "My family served this kingdom long before the current line held power. Today I reclaim that service.",
  "The taxes are fair but the care is not. I offer a new compact with this land.",
  "I watched this court from the inside for long enough. The time has come.",
  "The people outside the castle walls have waited patiently. Their patience is finished.",
];

export class Usurper {
  state: UsurperState = {
    active: false,
    startedDay: 0,
    decisionExpiresAt: 0,
    lastCheckedDay: 0,
    totalChallenges: 0,
    totalRepelled: 0,
  };

  private readonly minYear = 2;
  private readonly minDaysBetween = 12;
  private readonly baseChance = 0.012;

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  /** Called on day rollover from World.tick. */
  tick(): void {
    // If a challenge is active, check whether the player let the window lapse.
    if (this.state.active) {
      if (Date.now() > this.state.decisionExpiresAt) {
        // Player ignored it — usurper wins.
        this._installClaimant(
          this.state.claimantId,
          this.state.claimantName ?? "the usurper",
          this.state.claimantTitle ?? "Lord",
          this.world.map.structures.find((s) => s.kind === "castle")?.id,
        );
      }
      return; // only one active challenge at a time
    }

    const { day, year } = this.world.state;
    if (year < this.minYear) return;
    if (day - this.state.lastCheckedDay < this.minDaysBetween) return;
    this.state.lastCheckedDay = day;

    // Captain reduces chance by 50 %; Open Court edict slightly increases it.
    let chance = this.baseChance;
    if (this.world.courtEffects.captainSeated) chance *= 0.5;
    if (this.world.edictEffects.openCourt) chance *= 1.3;
    if (this.rand() >= chance) return;

    this._fireChallenge();
  }

  private _fireChallenge(): void {
    const { day } = this.world.state;

    // Prefer scholarly / martial roles — they feel like they've been
    // accumulating influence. Fall back to any adult non-monarch.
    const eligible = this.world.npcs.filter(
      (n) => n.role !== "monarch" && (n.age ?? 30) >= 20,
    );
    if (!eligible.length) return;

    const noble = eligible.filter(
      (n) => n.role === "scholar" || n.role === "guard" || n.role === "courier",
    );
    const pool = noble.length ? noble : eligible;
    const claimant = pool[Math.floor(this.rand() * pool.length)];
    const title = TITLES[Math.floor(this.rand() * TITLES.length)];
    const grievance = GRIEVANCES[Math.floor(this.rand() * GRIEVANCES.length)];
    const claimantName = claimant.name ?? generateName(claimant.role, claimant.seed);

    const windowMs = this.world.courtEffects.advisorSeated ? 240_000 : 120_000;
    const windowWithEdict = windowMs + (this.world.edictEffects.openCourt ? 60_000 : 0);
    const expiresAt = Date.now() + windowWithEdict;

    this.state.active = true;
    this.state.claimantId = claimant.id;
    this.state.claimantName = claimantName;
    this.state.claimantTitle = title;
    this.state.startedDay = day;
    this.state.decisionExpiresAt = expiresAt;
    this.state.totalChallenges++;

    const castle = this.world.map.structures.find((s) => s.kind === "castle");

    this.journal.write(
      `${title} ${claimantName} stepped forward in the great hall with a declaration ` +
        `that silenced the room: "${grievance}"`,
      "milestone",
      castle?.id,
    );

    // Capture values for closure — closures close over refs, not snapshot values.
    const claimantId = claimant.id;
    const claimantNameSnap = claimantName;
    const titleSnap = title;
    const castleId = castle?.id;
    const rand = this.rand;

    this.world.decisions.propose({
      id: `usurper_${day}_${this.state.totalChallenges}`,
      title: `${title} ${claimantName} challenges the throne`,
      body: `${grievance} The court holds its breath. What does the monarch decree?`,
      expiresAt,
      defaultOnExpire: false, // We handle expiry inside tick() above.
      options: [
        {
          id: "exile",
          label: "Exile the usurper",
          onChoose: (w) => {
            const cost = 20;
            w.economy.state.gold = Math.max(0, w.economy.state.gold - cost);
            const idx = w.npcs.findIndex((n) => n.id === claimantId);
            if (idx >= 0) w.npcs.splice(idx, 1);
            this.state.active = false;
            this.state.claimantId = undefined;
            this.state.totalRepelled++;
            w.journal.write(
              `${titleSnap} ${claimantNameSnap} was escorted beyond the borders before dusk. ` +
                `${cost} gold changed hands quietly. The throne is secure.`,
              "milestone",
              castleId,
            );
            if (rand() < 0.35) {
              w.treasury.acquire("relic", `seized during the exile of ${claimantNameSnap}`);
            }
          },
        },
        {
          id: "negotiate",
          label: "Negotiate terms",
          onChoose: (w) => {
            const cost = 35;
            w.economy.state.gold = Math.max(0, w.economy.state.gold - cost);
            // Claimant stays but is folded into the intelligentsia.
            const npc = w.npcs.find((n) => n.id === claimantId);
            if (npc) npc.role = "scholar";
            this.state.active = false;
            this.state.claimantId = undefined;
            this.state.totalRepelled++;
            w.journal.write(
              `${titleSnap} ${claimantNameSnap} and the crown came to terms over a long meal ` +
                `and ${cost} gold in concessions. The great hall was quieter afterward — but not empty.`,
              "milestone",
              castleId,
            );
          },
        },
        {
          id: "imprison",
          label: "Have them imprisoned",
          onChoose: (w) => {
            const idx = w.npcs.findIndex((n) => n.id === claimantId);
            if (idx >= 0) w.npcs.splice(idx, 1);
            this.state.active = false;
            this.state.claimantId = undefined;
            this.state.totalRepelled++;
            w.journal.write(
              `${titleSnap} ${claimantNameSnap} was taken to the castle cells before the night watch. ` +
                `The declaration was burned. The throne did not acknowledge it had ever wavered.`,
              "milestone",
              castleId,
            );
            // Imprisonment stirs the populace — bring the Uprising cooldown forward.
            w.uprising.stirUnrest();
          },
        },
        {
          id: "yield",
          label: "Yield the throne",
          onChoose: (w) => {
            this._installClaimant(claimantId, claimantNameSnap, titleSnap, castleId);
          },
        },
      ],
    });
  }

  /**
   * Install the claimant as the new monarch. Called on "yield" choice OR
   * on decision-window lapse (player ignored it).
   */
  _installClaimant(
    claimantId: string | undefined,
    claimantName: string,
    title: string,
    castleId: string | undefined,
  ): void {
    const w = this.world;
    const oldMonarch = w.npcs.find((n) => n.role === "monarch");
    const oldName = oldMonarch?.name ?? "the monarch";
    const castle = castleId ? w.map.structures.find((s) => s.id === castleId) : undefined;

    const claimant = claimantId ? w.npcs.find((n) => n.id === claimantId) : undefined;

    if (claimant && castle) {
      claimant.role = "monarch";
      claimant.homeId = castle.id;
      claimant.workId = castle.id;
      claimant.pos = {
        x: castle.pos.x + Math.floor(castle.size.x / 2),
        y: castle.pos.y + Math.floor(castle.size.y / 2),
      };
      claimant.prevPos = { ...claimant.pos };
    } else if (castle) {
      // NPC may have been removed; generate a stand-in.
      const center = {
        x: castle.pos.x + Math.floor(castle.size.x / 2),
        y: castle.pos.y + Math.floor(castle.size.y / 2),
      };
      const seed = Math.floor(this.rand() * 2 ** 31);
      w.pushNpc({
        id: `npc_usurper_${w.state.day}`,
        role: "monarch",
        name: claimantName,
        age: 35,
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

    // Remove old monarch NPC.
    if (oldMonarch) {
      const idx = w.npcs.findIndex((n) => n.id === oldMonarch.id);
      if (idx >= 0) w.npcs.splice(idx, 1);
    }

    const reignDuration = w.state.day - w.succession.state.reignStartDay;
    w.succession.state.generation += 1;
    w.succession.state.reignStartDay = w.state.day;
    // Usurper takeover breaks the dynasty streak.
    w.succession.state.dynastyStreak = 0;

    // Write the legacy scroll for the outgoing monarch.
    const summary = writeMonarchLegacy(
      w, oldName, reignDuration,
      w.state.year - Math.max(1, Math.floor(reignDuration / 56)),
      "usurper",
    );
    w.journal.write(
      `${title} ${claimantName} took the throne — not by lineage, but by will. A new line begins.`,
      "milestone",
      castleId,
    );

    w.succession.announceSuccession({
      oldName,
      newName: claimantName,
      generation: w.succession.state.generation,
      reignDurationDays: reignDuration,
      context: "usurper",
      summary,
    });

    this.state.active = false;
    this.state.claimantId = undefined;
    this.state.claimantName = undefined;
    this.state.claimantTitle = undefined;
    this.state.decisionExpiresAt = 0;
  }

  /** Snapshot for persistence. */
  snapshot(): UsurperState {
    return { ...this.state };
  }

  /** Restore from save. Tolerates missing fields gracefully. */
  hydrate(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;
    this.state.active = Boolean(r.active);
    this.state.claimantId = typeof r.claimantId === "string" ? r.claimantId : undefined;
    this.state.claimantName = typeof r.claimantName === "string" ? r.claimantName : undefined;
    this.state.claimantTitle = typeof r.claimantTitle === "string" ? r.claimantTitle : undefined;
    this.state.startedDay = typeof r.startedDay === "number" ? r.startedDay : 0;
    this.state.decisionExpiresAt = typeof r.decisionExpiresAt === "number" ? r.decisionExpiresAt : 0;
    this.state.lastCheckedDay = typeof r.lastCheckedDay === "number" ? r.lastCheckedDay : 0;
    this.state.totalChallenges = typeof r.totalChallenges === "number" ? r.totalChallenges : 0;
    this.state.totalRepelled = typeof r.totalRepelled === "number" ? r.totalRepelled : 0;
  }
}
