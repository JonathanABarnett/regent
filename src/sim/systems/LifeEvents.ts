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
    this.journal.write(this.marriageLine(a, b), "life");
  }

  private marriageLine(a: NPC, b: NPC): string {
    const aName = describe(a);
    const bName = describe(b);
    const place = nice(a.homeId);
    const r = this.rand();
    if (r < 0.34) return `${aName} and ${bName} were wed at ${place}.`;
    if (r < 0.67) return `A wedding at ${place}: ${aName} and ${bName} stood beneath the canopy.`;
    return `${aName} took ${bName}'s hand at ${place} today. The whole town turned out.`;
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
      this.journal.write(this.birthLine(name, a, b), "life");
    }
  }

  private birthLine(name: string, a: NPC, b: NPC): string {
    const place = nice(a.homeId);
    const r = this.rand();
    if (r < 0.34) return `A child, ${name}, was born to ${a.name} and ${b.name} in ${place}.`;
    if (r < 0.67) return `${place} woke to a new cry — ${name}, child of ${a.name} and ${b.name}.`;
    return `${a.name} and ${b.name} welcomed ${name} into the world today.`;
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
    this.journal.write(this.deathLine(npc), "life");
  }

  private deathLine(npc: NPC): string {
    const age = Math.floor(npc.age ?? 70);
    const desc = describe(npc);
    const r = this.rand();
    if (r < 0.25) return `${desc} passed peacefully at the age of ${age}. They will be remembered.`;
    if (r < 0.5) return `${npc.name} — ${age} years old — was laid to rest today.`;
    if (r < 0.75) return `${desc} closed their eyes for the last time. They were ${age}.`;
    return `Bells tolled at dusk; ${desc} had passed in their ${age}th year.`;
  }
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
