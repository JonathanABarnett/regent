import type { World } from "../World";
import type { Journal } from "./Journal";
import type { NPC } from "../types";
import { generateName } from "./Names";
import { traitFor, TRAIT_EPITHET } from "./Traits";

/**
 * NPC life events: aging, marriages, births, deaths.
 *
 * Runs on a day-tick so it doesn't fire constantly. Each new in-world day
 * the system rolls dice on each NPC. The whole thing is deterministic given
 * the same seed + same elapsed days, so kingdoms returning from save have
 * the same lineage they would have had if the app stayed open.
 *
 * Cadence is intentionally gentle — 1-2 events per real day on average.
 */
export class LifeEvents {
  private lastProcessedDay = -1;
  private nextNpcCounter = 1000;

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  tick() {
    const day = this.world.state.day;
    // First tick after construction: lastProcessedDay is the sentinel -1.
    // Sync to the current day WITHOUT processing — otherwise a brand-new
    // kingdom retroactively runs aging/marriages/births/deaths from day -1
    // to day 1 (gap of 2), producing weddings between random villagers
    // before the kingdom is even founded.
    //
    // applySave overrides lastProcessedDay to world.state.day on load, so
    // this sentinel-handling only affects fresh worlds.
    if (this.lastProcessedDay < 0) {
      this.lastProcessedDay = day;
      return;
    }
    if (day === this.lastProcessedDay) return;
    // Catch up if the player came back after time away. Cap at 30 days to keep
    // a long absence from generating a wall of text.
    const gap = Math.min(30, day - this.lastProcessedDay);
    for (let i = 0; i < gap; i++) {
      const simDay = day - gap + i + 1;
      this.processDay(simDay);
    }
    this.lastProcessedDay = day;
  }

  private processDay(day: number) {
    // Age all NPCs by 1 day. Every 90 in-world days = ~1 year of NPC age,
    // so a 70-day-old NPC ages slowly enough to feel right with daily play.
    for (const npc of this.world.npcs) {
      npc.age = (npc.age ?? 30) + 1 / 90;
    }

    // Marriages — roll once per day per eligible villager
    if (this.rand() < 0.2) this.tryMarriage();

    // Births — only married couples, slow rate
    if (this.rand() < 0.08) this.tryBirth();

    // Deaths — very rare and only for old NPCs
    if (this.rand() < 0.04) this.tryDeath();
  }

  private tryMarriage() {
    const eligible = this.world.npcs.filter(
      (n) => !n.partnerId && (n.age ?? 30) >= 18 && (n.age ?? 30) < 60 && n.role !== "courier",
    );
    if (eligible.length < 2) return;
    const a = eligible[Math.floor(this.rand() * eligible.length)];
    // partner must share a town
    const candidates = eligible.filter(
      (b) => b.id !== a.id && b.homeId === a.homeId,
    );
    if (!candidates.length) return;
    const b = candidates[Math.floor(this.rand() * candidates.length)];
    a.partnerId = b.id;
    b.partnerId = a.id;
    // The wedding happens at the shared home — anchor the journal entry there.
    this.journal.write(this.marriageLine(a, b), "life", a.homeId);
  }

  private marriageLine(a: NPC, b: NPC): string {
    const aName = describe(a);
    const bName = describe(b);
    const place = nice(a.homeId);
    return pickFrom(MARRIAGE_LINES, this.rand)
      .replaceAll("{a}", aName)
      .replaceAll("{b}", bName)
      .replaceAll("{place}", place);
  }

  private tryBirth() {
    const couples = new Set<string>();
    const pairs: Array<[NPC, NPC]> = [];
    for (const npc of this.world.npcs) {
      if (!npc.partnerId) continue;
      const key = [npc.id, npc.partnerId].sort().join("|");
      if (couples.has(key)) continue;
      couples.add(key);
      const partner = this.world.npcs.find((n) => n.id === npc.partnerId);
      if (partner) pairs.push([npc, partner]);
    }
    if (!pairs.length) return;
    const [a, b] = pairs[Math.floor(this.rand() * pairs.length)];
    const newId = `npc_${this.nextNpcCounter++}`;
    const seed = Math.floor(this.rand() * 2 ** 31);
    const home = this.world.map.structures.find((s) => s.id === a.homeId);
    if (!home) return;
    const pos = {
      x: home.pos.x + Math.floor(home.size.x / 2),
      y: home.pos.y + Math.floor(home.size.y / 2),
    };
    const name = generateName("villager", seed);
    const added = this.world.pushNpc({
      id: newId,
      role: "villager",
      name,
      age: 0,
      pos: { ...pos },
      prevPos: { ...pos },
      facing: "s",
      homeId: a.homeId,
      workId: a.homeId,
      activity: "idle",
      path: [],
      activityTimer: 3 + this.rand() * 5,
      seed,
      trait: traitFor(seed),
      parentIds: [a.id, b.id],
    });
    if (added) {
      this.journal.write(this.birthLine(name, a, b), "life", a.homeId);
    }
  }

  private birthLine(name: string, a: NPC, b: NPC): string {
    const place = nice(a.homeId);
    return pickFrom(BIRTH_LINES, this.rand)
      .replaceAll("{name}", name)
      .replaceAll("{a}", a.name ?? "the mother")
      .replaceAll("{b}", b.name ?? "the father")
      .replaceAll("{place}", place);
  }

  private tryDeath() {
    const elderly = this.world.npcs.filter((n) => (n.age ?? 30) > 70);
    if (!elderly.length) return;
    const npc = elderly[Math.floor(this.rand() * elderly.length)];
    // remove
    const idx = this.world.npcs.findIndex((n) => n.id === npc.id);
    if (idx >= 0) this.world.npcs.splice(idx, 1);
    // free partner
    if (npc.partnerId) {
      const partner = this.world.npcs.find((n) => n.id === npc.partnerId);
      if (partner) partner.partnerId = undefined;
    }
    this.journal.write(this.deathLine(npc), "life", npc.homeId);
  }

  private deathLine(npc: NPC): string {
    const age = Math.floor(npc.age ?? 70);
    const desc = describe(npc);
    const name = npc.name ?? "someone";
    return pickFrom(DEATH_LINES, this.rand)
      .replaceAll("{desc}", desc)
      .replaceAll("{name}", name)
      .replaceAll("{age}", String(age));
  }
}

// ── Phrasing pools ─────────────────────────────────────────────────────
// Each pool is small but bigger than the player will remember between sessions.
// `{a}` / `{b}` / `{name}` / `{place}` / `{desc}` / `{age}` are substituted at
// write time. Adding entries here is the lowest-friction way to bump variety.

const MARRIAGE_LINES: readonly string[] = [
  "{a} and {b} were wed at {place}.",
  "A wedding at {place}: {a} and {b} stood beneath the canopy.",
  "{a} took {b}'s hand at {place} today. The whole town turned out.",
  "{place} held a small ceremony: {a} and {b}, married at last.",
  "After a year of small kindnesses, {a} and {b} were wed at {place} this morning.",
  "{a} and {b} exchanged vows at {place} as the bells rang for noon.",
  "{place} hosted a quiet wedding — {a} and {b}, by lamplight, with only family present.",
];

const BIRTH_LINES: readonly string[] = [
  "A child, {name}, was born to {a} and {b} in {place}.",
  "{place} woke to a new cry — {name}, child of {a} and {b}.",
  "{a} and {b} welcomed {name} into the world today.",
  "{name} was born at {place} just before dawn; {a} and {b} were both well.",
  "A small celebration in {place}: {a} and {b} introduced their child, {name}.",
  "{name} arrived in the late afternoon. {a} and {b} are home and resting.",
  "The midwife of {place} announced a healthy birth — {name}, child of {a} and {b}.",
];

const DEATH_LINES: readonly string[] = [
  "{desc} passed peacefully at the age of {age}. They will be remembered.",
  "{name} — {age} years old — was laid to rest today.",
  "{desc} closed their eyes for the last time. They were {age}.",
  "Bells tolled at dusk; {desc} had passed in their {age}th year.",
  "{desc} died in their sleep last night. The chronicle records {age} good years.",
  "Word reached the keep at midday: {desc}, {age}, has gone. The family asks for quiet.",
  "A small procession wound through the lanes for {desc}, who was {age}, and beloved.",
];

function pickFrom<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

/** Returns "the ever-cheerful Berta" if the NPC has a trait, else just "Berta". */
function describe(npc: NPC): string {
  if (npc.trait) return `the ${TRAIT_EPITHET[npc.trait]} ${npc.name}`;
  return npc.name ?? "someone";
}

function nice(id: string): string {
  if (!id) return "town";
  return id.charAt(0).toUpperCase() + id.slice(1);
}
