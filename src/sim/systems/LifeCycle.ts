/**
 * LifeCycle — NPC generational progression.
 *
 * Three responsibilities:
 *
 *   1. Coming-of-age: when a born-in-kingdom child (has parentIds) reaches
 *      adult age (18 NPC years), they graduate from villager to a real career.
 *      Career is influenced by parents' roles. A milestone journal entry marks
 *      the moment.
 *
 *   2. Retirement: skilled NPCs over 65 NPC years have a small daily chance
 *      (~4%) of "hanging up their trade" and becoming respected elders
 *      (role reverts to villager). Their journal line references what they did.
 *
 *   3. Relationship bonds: occasionally (1% per day) two co-located NPCs
 *      form a named bond — mentor/apprentice, old friends, rivals — and a
 *      quiet life-kind journal entry notes it.
 *
 * NPC age is in "years" where 1 year = 90 in-world days of aging
 * (age += 1/90 per processDay call in LifeEvents). So age 18.0 = adult.
 *
 * State (cameOfAgeIds + retiredIds) is persisted to avoid double-firing
 * after a save/reload. Two small arrays, hundreds of entries at most.
 */

import type { World } from "../World";
import type { Journal } from "./Journal";
import type { NPC, NPCRole } from "../types";
import { generateName } from "./Names";
import { traitFor } from "./Traits";

// ── NPC age thresholds (in "years" units) ───────────────────────────────────
const ADULT_AGE = 18;
const RETIREMENT_AGE = 65;
const RETIREMENT_CHANCE_PER_DAY = 0.04;

// ── Career pools — the roles a child can grow into ──────────────────────────
const CAREER_ROLES: NPCRole[] = ["blacksmith", "scholar", "miner", "guard", "villager"];

/** Probability weight each parent role adds to the matching career. */
const PARENT_CAREER_BONUS: Partial<Record<NPCRole, NPCRole>> = {
  blacksmith: "blacksmith",
  scholar: "scholar",
  miner: "miner",
  guard: "guard",
};

// ── Prose pools ──────────────────────────────────────────────────────────────

const COMING_OF_AGE_LINES: Record<string, readonly string[]> = {
  blacksmith: [
    "{name} took up the hammer today — not as a child trying to lift it, but as a smith. The forge had a new face by noon.",
    "{name} stepped into the smithy this morning as an apprentice and came out as a smith. The forge has been waiting.",
    "The anvil rang differently today. {name}, grown now, struck their first real blow as a blacksmith.",
  ],
  scholar: [
    "{name} was accepted into the Scriptorium's reading hall today. The scholars say they noticed the aptitude years ago.",
    "{name} took their first set of keys to the library stacks. The books have been patient.",
    "{name} made their first notation in the chronicle today — not as a child copying letters, but as a scholar.",
  ],
  miner: [
    "{name} took the shaft lantern for the first time today and didn't flinch. The miners welcomed them at the bottom.",
    "{name} descended with the morning shift. They've watched their whole life from above; now they go down.",
    "The mine gained a new hand today. {name} has the build for it and the patience for the dark.",
  ],
  guard: [
    "{name} was given a post at the castle gate this morning. They stood perfectly still for four hours. The captain was satisfied.",
    "{name} joined the watch today. The other guards said they could see it coming for years.",
    "There's a new face on the night watch — {name}, who grew up watching the guard from their doorstep.",
  ],
  villager: [
    "{name} has grown into their own and found their way in the town — market stalls, gardens, the kind of work that holds a place together.",
    "{name} is an adult now. The town didn't change much the day it happened, but they woke up feeling it.",
    "{name} stepped into adulthood quietly, the way most people do, and got on with it.",
  ],
};

const RETIREMENT_LINES: Record<string, readonly string[]> = {
  blacksmith: [
    "{name} hung their hammer on the wall today — not to be taken down. {age} years at the forge. The metal remembers them.",
    "{name} set their tools down and walked out of the smithy for the last time. Someone else will use that station now. No one will use it the same way.",
    "The smithy has a new quiet where {name} used to work. They are well. Just done.",
  ],
  scholar: [
    "{name} read their last entry into the chronicle and closed the book for the final time. Retirement, at {age}.",
    "{name} left their key on the reading hall desk with a note that said 'to whoever comes next.' The scholars found it in the morning.",
    "The Scriptorium has one fewer light burning late. {name} has retired. The books will miss them, in the way books do.",
  ],
  miner: [
    "{name} came up from the shaft for the last time today. {age} years underground. They squinted at the sky for a long time before walking home.",
    "The mine has one fewer lantern. {name} retired this morning, having lost no fingers and found a great deal of iron.",
    "{name} set down their pickaxe without ceremony and walked out of the mine. The other miners didn't say much. They understood.",
  ],
  guard: [
    "{name} gave back their post key and their cloak this morning. {age} years on the watch. The gate will be duller for it.",
    "The night watch counts one fewer tonight. {name} retired at {age}, having spent more nights awake than most people ever think about.",
    "{name} stood their last post at the castle gate this morning and handed the lantern to the next in line. That is how it goes.",
  ],
};

const BOND_LINES: readonly string[] = [
  "{a} and {b} have been seen working side by side for long enough that the others now call them a pair. No one decided this. It just happened.",
  "The elders say that {a} and {b} remind them of an old friendship — not stated, just present.",
  "{a} has been teaching {b} something. What exactly is unclear. The result is visible.",
  "There is a table in the tavern that {a} and {b} have sat at enough times that it has quietly become their table.",
  "{a} and {b} have reached that stage of friendship where they say very little and understand a great deal.",
  "The youngest apprentices say {a} is {b}'s mentor, or perhaps the other way around — they've stopped trying to tell the difference.",
  "Three people have now described {a} and {b} as 'inseparable.' {a} and {b} both claim this is an exaggeration. They are wrong.",
];

// ── System ───────────────────────────────────────────────────────────────────

export interface LifeCycleState {
  /** NPC ids who have already had their coming-of-age event fired. */
  cameOfAgeIds: string[];
  /** NPC ids who have already retired. */
  retiredIds: string[];
  /** NPC id pairs who have had a bond journal entry (sorted "a|b" key). */
  bondKeys: string[];
  /** Last in-world day this system ran. */
  lastCheckedDay: number;
}

export class LifeCycle {
  state: LifeCycleState = {
    cameOfAgeIds: [],
    retiredIds: [],
    bondKeys: [],
    lastCheckedDay: -1,
  };

  private cameOfAgeSet = new Set<string>();
  private retiredSet = new Set<string>();
  private bondSet = new Set<string>();

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  /** Called on day rollover from World.tick. */
  tick(): void {
    const day = this.world.state.day;
    if (day === this.state.lastCheckedDay) return;
    this.state.lastCheckedDay = day;

    this.checkComingOfAge();
    this.checkRetirement();
    if (this.rand() < 0.01) this.checkBond();
  }

  // ── Coming-of-age ──────────────────────────────────────────────────────────

  private checkComingOfAge(): void {
    for (const npc of this.world.npcs) {
      const age = npc.age ?? 0;
      if (age < ADULT_AGE) continue;
      if (!npc.parentIds || npc.parentIds.length === 0) continue;
      if (this.cameOfAgeSet.has(npc.id)) continue;
      // Only apply to those still carrying the "not-yet-assigned" state:
      // we detect this as role === "villager" AND has parents (born in sim)
      if (npc.role !== "villager") {
        // Already assigned a role — just mark them to avoid re-checking
        this.cameOfAgeSet.add(npc.id);
        continue;
      }

      this.cameOfAgeSet.add(npc.id);
      this.fireComingOfAge(npc);
    }
  }

  private fireComingOfAge(npc: NPC): void {
    // Pick a career influenced by parents' roles.
    const role = this.pickCareer(npc);

    // Assign role + find appropriate work building.
    npc.role = role;
    const workStructure = this.findWorkFor(role);
    if (workStructure) npc.workId = workStructure.id;

    // Journal entry.
    const lines = COMING_OF_AGE_LINES[role] ?? COMING_OF_AGE_LINES.villager;
    const text = pickFrom(lines, this.rand)
      .replaceAll("{name}", npc.name ?? "the young one")
      .replaceAll("{age}", String(Math.floor(npc.age ?? 18)));
    const homeStruct = this.world.map.structures.find((s) => s.id === npc.homeId);
    this.journal.write(text, "milestone", homeStruct?.id);

    // Tell the reputation system this was a life event (neutral).
    this.world.reputation.adjust(0);
  }

  private pickCareer(npc: NPC): NPCRole {
    // Build a weighted bucket: base weight 1 for all, +3 for parent-matching role.
    const weights: Map<NPCRole, number> = new Map(
      CAREER_ROLES.map((r) => [r, 1]),
    );
    if (npc.parentIds) {
      for (const pid of npc.parentIds) {
        const parent = this.world.npcs.find((n) => n.id === pid);
        if (!parent) continue;
        const bonus = PARENT_CAREER_BONUS[parent.role];
        if (bonus) weights.set(bonus, (weights.get(bonus) ?? 1) + 3);
      }
    }
    const pool: NPCRole[] = [];
    for (const [role, w] of weights) {
      for (let i = 0; i < w; i++) pool.push(role);
    }
    return pool[Math.floor(this.rand() * pool.length)];
  }

  private findWorkFor(role: NPCRole) {
    const kindMap: Partial<Record<NPCRole, string>> = {
      blacksmith: "forge",
      scholar: "library",
      miner: "mine",
      guard: "castle",
    };
    const kind = kindMap[role];
    if (!kind) return null;
    return this.world.map.structures.find((s) => s.kind === kind) ?? null;
  }

  // ── Retirement ─────────────────────────────────────────────────────────────

  private checkRetirement(): void {
    for (const npc of this.world.npcs) {
      const age = npc.age ?? 0;
      if (age < RETIREMENT_AGE) continue;
      if (npc.role === "villager" || npc.role === "monarch" || npc.role === "courier") continue;
      if (this.retiredSet.has(npc.id)) continue;
      if (this.rand() >= RETIREMENT_CHANCE_PER_DAY) continue;

      this.retiredSet.add(npc.id);
      this.fireRetirement(npc);
    }
  }

  private fireRetirement(npc: NPC): void {
    const oldRole = npc.role;
    npc.role = "villager";
    // Return them to their home as their new work place.
    npc.workId = npc.homeId;

    const lines = RETIREMENT_LINES[oldRole] ?? [
      "{name} stepped down from their post at {age} and found a quieter life in the town.",
    ];
    const text = pickFrom(lines, this.rand)
      .replaceAll("{name}", npc.name ?? "they")
      .replaceAll("{age}", String(Math.floor(npc.age ?? 65)));
    this.journal.write(text, "life", npc.homeId);
  }

  // ── Relationship bonds ─────────────────────────────────────────────────────

  private checkBond(): void {
    // Pick two adults in the same home or work location.
    const adults = this.world.npcs.filter(
      (n) => (n.age ?? 0) >= ADULT_AGE && n.role !== "monarch",
    );
    if (adults.length < 2) return;

    const a = adults[Math.floor(this.rand() * adults.length)];
    // Find someone who shares a structure with a.
    const colocated = adults.filter(
      (b) =>
        b.id !== a.id &&
        !b.partnerId &&
        (b.homeId === a.homeId || b.workId === a.workId),
    );
    if (!colocated.length) return;
    const b = colocated[Math.floor(this.rand() * colocated.length)];

    // Deduplicate bond key (sorted so a|b === b|a).
    const key = [a.id, b.id].sort().join("|");
    if (this.bondSet.has(key)) return;
    this.bondSet.add(key);

    const text = pickFrom(BOND_LINES, this.rand)
      .replaceAll("{a}", a.name ?? "one")
      .replaceAll("{b}", b.name ?? "another");
    this.journal.write(text, "life", a.homeId);
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  snapshot(): LifeCycleState {
    return {
      cameOfAgeIds: [...this.cameOfAgeSet],
      retiredIds: [...this.retiredSet],
      bondKeys: [...this.bondSet],
      lastCheckedDay: this.state.lastCheckedDay,
    };
  }

  hydrate(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.cameOfAgeIds)) {
      for (const id of r.cameOfAgeIds as unknown[]) {
        if (typeof id === "string") this.cameOfAgeSet.add(id);
      }
    }
    if (Array.isArray(r.retiredIds)) {
      for (const id of r.retiredIds as unknown[]) {
        if (typeof id === "string") this.retiredSet.add(id);
      }
    }
    if (Array.isArray(r.bondKeys)) {
      for (const k of r.bondKeys as unknown[]) {
        if (typeof k === "string") this.bondSet.add(k);
      }
    }
    if (typeof r.lastCheckedDay === "number") {
      this.state.lastCheckedDay = r.lastCheckedDay;
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pickFrom<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}
