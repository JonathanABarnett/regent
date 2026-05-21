import type { World } from "../World";
import type { Journal } from "./Journal";
import type { NPC } from "../types";
import { generateName } from "./Names";
import { traitFor, epithetFor } from "./Traits";
import { makeEvent } from "../events/EventSchema";
import {
  WAR_GUARD_DEATH_LINES,
  WAR_CIVILIAN_DEATH_LINES,
  WAR_GRIEF_ADDENDA,
} from "./War";

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

    // Anniversaries — check once per day; fire at every 90-day milestone
    this.checkAnniversaries(day);
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
    // Record the wedding day for anniversary tracking.
    const today = this.world.state.day;
    a.partneredOnDay = today;
    b.partneredOnDay = today;
    // The wedding happens at the shared home — anchor the journal entry there.
    this.journal.write(this.marriageLine(a, b), "life", a.homeId);
  }

  private marriageLine(a: NPC, b: NPC): string {
    const aName = describe(a);
    const bName = describe(b);
    const place = nice(a.homeId);
    // Pick a pool that knows both traits if both are set; otherwise fall back
    // to the general pool. Trait-aware lines make each wedding feel unique.
    const pool = (a.trait && b.trait)
      ? traitMarriagePool(a.trait, b.trait)
      : MARRIAGE_LINES;
    return pickFrom(pool, this.rand)
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
    // Build a small blessing phrase based on the parents' combined traits.
    const blessing = birthBlessing(a.trait, b.trait, this.rand);
    return pickFrom(BIRTH_LINES, this.rand)
      .replaceAll("{name}", name)
      .replaceAll("{a}", a.name ?? "the mother")
      .replaceAll("{b}", b.name ?? "the father")
      .replaceAll("{place}", place)
      .replaceAll("{blessing}", blessing);
  }

  private checkAnniversaries(today: number) {
    // Only scan once: track pairs already seen this day to avoid double-firing
    // (both partners share the same partneredOnDay, so we'd otherwise fire twice).
    const fired = new Set<string>();
    for (const npc of this.world.npcs) {
      if (!npc.partnerId || npc.partneredOnDay === undefined) continue;
      const pairKey = [npc.id, npc.partnerId].sort().join("|");
      if (fired.has(pairKey)) continue;
      const daysTogether = today - npc.partneredOnDay;
      // Fire at every 90-day milestone (≈ 1 NPC year).
      if (daysTogether <= 0 || daysTogether % 90 !== 0) continue;
      const partner = this.world.npcs.find((n) => n.id === npc.partnerId);
      if (!partner) continue;
      fired.add(pairKey);
      const years = Math.floor(daysTogether / 90);
      const text = anniversaryLine(npc, partner, years, this.rand);
      this.journal.write(text, "life", npc.homeId);
    }
  }

  private tryDeath() {
    const elderly = this.world.npcs.filter((n) => (n.age ?? 30) > 70);
    if (!elderly.length) return;
    const npc = elderly[Math.floor(this.rand() * elderly.length)];
    // Determine significance before removing the NPC.
    const hasPartner = !!npc.partnerId;
    const children = this.world.npcs.filter((n) => n.parentIds?.includes(npc.id));
    const isSignificant = hasPartner || children.length > 0 || (npc.age ?? 0) > 50;
    // remove
    const idx = this.world.npcs.findIndex((n) => n.id === npc.id);
    if (idx >= 0) this.world.npcs.splice(idx, 1);
    // free partner
    if (npc.partnerId) {
      const partner = this.world.npcs.find((n) => n.id === npc.partnerId);
      if (partner) partner.partnerId = undefined;
    }
    this.journal.write(this.deathLine(npc), "life", npc.homeId);
    // Signal the engine to play a death bell and flash a brief vignette
    // for NPCs who had families or lived a long life in the kingdom.
    if (isSignificant) {
      this.world.bus.publish(
        makeEvent("custom", {
          source: "internal",
          payload: { label: `death_bell:${npc.name ?? "npc"}` },
        }),
      );
    }
  }

  /**
   * Remove `npc` from the kingdom as a war casualty. Writes vivid,
   * named prose — guard deaths reference their post; civilian deaths
   * note the cruel mismatch of their role. Surviving partners and
   * children are named in the same entry.
   *
   * Called by War.ts when a battle roll kills an NPC.
   */
  warDeath(npc: NPC, factionName: string): void {
    const idx = this.world.npcs.findIndex((n) => n.id === npc.id);
    if (idx < 0) return;
    this.world.npcs.splice(idx, 1);

    const partner = npc.partnerId
      ? this.world.npcs.find((n) => n.id === npc.partnerId)
      : undefined;
    const children = this.world.npcs.filter((n) => n.parentIds?.includes(npc.id));

    // Choose the right prose pool.
    const pool =
      npc.role === "guard" ? WAR_GUARD_DEATH_LINES : WAR_CIVILIAN_DEATH_LINES;
    let line = pool[Math.floor(this.rand() * pool.length)];

    // Humanise: name, role, nearest structure to the fighting.
    const battleStructure = this.world.map.structures.find(
      (s) => s.kind === "castle" || s.kind === "town",
    );
    line = line
      .replace("{name}", npc.name ?? "an unnamed soul")
      .replace("{role}", npc.role)
      .replace("{structure}", battleStructure?.name ?? "the castle");

    // Grief addendum: surviving partner is named.
    if (partner?.name) {
      const addendum = WAR_GRIEF_ADDENDA[Math.floor(this.rand() * WAR_GRIEF_ADDENDA.length)]
        .replace("{partner}", partner.name);
      line += addendum;
    } else if (children.length > 0) {
      // No partner, but children are orphaned.
      const count = children.length;
      const childNames = children
        .filter((c) => c.name)
        .map((c) => c.name!)
        .slice(0, 2)
        .join(" and ");
      if (childNames) {
        line += ` Their ${count === 1 ? "child" : `${count} children`} — ${childNames} — remain.`;
      } else {
        line += ` Their ${count === 1 ? "child" : `${count} children`} remain.`;
      }
    }

    // Free the partner link.
    if (partner) {
      partner.partnerId = undefined;
      partner.partneredOnDay = undefined;
    }
    // Remove deceased from children's parent lists.
    for (const child of children) {
      if (child.parentIds) {
        child.parentIds = child.parentIds.filter((id) => id !== npc.id);
      }
    }

    // Anchor the entry at the castle (the front line of the kingdom's defence).
    this.journal.write(line, "life", battleStructure?.id);

    // Death bell — always ring for war casualties (they died in service).
    this.world.bus.publish(
      makeEvent("custom", {
        source: "internal",
        payload: { label: `death_bell:${npc.name ?? "npc"}` },
      }),
    );
  }

  private deathLine(npc: NPC): string {
    const age = Math.floor(npc.age ?? 70);
    const desc = describe(npc);
    const name = npc.name ?? "someone";
    // Build a survivor clause — the most emotionally resonant part.
    const partner = npc.partnerId
      ? this.world.npcs.find((n) => n.id === npc.partnerId)
      : undefined;
    const children = this.world.npcs.filter((n) => n.parentIds?.includes(npc.id));
    const survivors = buildSurvivorLine(partner, children);
    return pickFrom(DEATH_LINES, this.rand)
      .replaceAll("{desc}", desc)
      .replaceAll("{name}", name)
      .replaceAll("{age}", String(age))
      .replaceAll("{survivors}", survivors);
  }
}

// ── Phrasing pools ─────────────────────────────────────────────────────────
// Placeholders:
//   {a} / {b}      — NPC display names (may include epithet from describe())
//   {name}         — child's name (births)
//   {place}        — home location display name
//   {desc}         — "the ever-cheerful Berta" (death)
//   {age}          — integer age (death)
//   {survivors}    — built inline from live roster (death); may be ""
//   {blessing}     — single-phrase blessing based on parent traits (birth)

const MARRIAGE_LINES: readonly string[] = [
  "{a} and {b} were wed at {place}.",
  "A wedding at {place}: {a} and {b} stood beneath the canopy.",
  "{a} took {b}'s hand at {place} today. The whole town turned out.",
  "{place} held a small ceremony: {a} and {b}, married at last.",
  "After a year of small kindnesses, {a} and {b} were wed at {place} this morning.",
  "{a} and {b} exchanged vows at {place} as the bells rang for noon.",
  "{place} hosted a quiet wedding — {a} and {b}, by lamplight, with only family present.",
  "No announcement — {a} and {b} simply appeared at the register together, smiling and holding hands.",
  "The ceremony at {place} was over in ten minutes. The celebration lasted until the fire burned out.",
  "{a} and {b} were married in the early morning before anyone else was awake. They said it felt right.",
  "The whole of {place} seemed to have known before {a} and {b} did. The wedding felt like a foregone conclusion.",
  "{a} found a flower from {b} on the doorstep three mornings in a row before anything was said aloud.",
];

const BIRTH_LINES: readonly string[] = [
  "A child, {name}, was born to {a} and {b} in {place}. {blessing}",
  "{place} woke to a new cry — {name}, child of {a} and {b}. {blessing}",
  "{a} and {b} welcomed {name} into the world today. {blessing}",
  "{name} was born at {place} just before dawn; {a} and {b} were both well. {blessing}",
  "A small celebration in {place}: {a} and {b} introduced their child, {name}. {blessing}",
  "{name} arrived in the late afternoon. {a} and {b} are home and resting. {blessing}",
  "The midwife of {place} announced a healthy birth — {name}, child of {a} and {b}. {blessing}",
  "{name} came into the world noisily, which the midwife said was a very good sign. {a} and {b} agreed.",
  "By afternoon everyone in {place} knew: {a} and {b} had a child. {name}. The name was settled within the hour.",
];

const DEATH_LINES: readonly string[] = [
  "{desc} passed peacefully at the age of {age}.{survivors}",
  "{name}, {age} years old, was laid to rest today.{survivors}",
  "{desc} closed their eyes for the last time. They were {age}.{survivors}",
  "Bells tolled at dusk; {desc} had passed in their {age}th year.{survivors}",
  "{desc} died in their sleep last night. The chronicle records {age} good years.{survivors}",
  "Word reached the keep at midday: {desc}, {age}, has gone. The family asks for quiet.{survivors}",
  "A small procession wound through the lanes for {desc}, who was {age}, and beloved.{survivors}",
  "{name} — {age} — was found at first light, still as stone and wearing a half-smile. The old ones called it a good end.{survivors}",
  "The chronicle adds {name}'s name to the list of those who lived long enough to grow into their face. {age} years. A good run.{survivors}",
  "{desc} had been slowing for a season. When it came, it came gently. {age} years is a life worth mourning.{survivors}",
  "The healer sat with {desc} through the last night. In the morning they were gone, {age} years completed.{survivors}",
];

/**
 * Build the trailing survivor sentence: who outlives the deceased and by name.
 * May return "" if the NPC died alone.
 */
function buildSurvivorLine(partner: NPC | undefined, children: NPC[]): string {
  if (!partner && children.length === 0) return "";
  const childNames = children
    .slice(0, 3)
    .map((c) => c.name)
    .filter(Boolean)
    .join(", ");
  const moreChildren = children.length > 3 ? ` and ${children.length - 3} others` : "";

  if (partner && children.length > 0) {
    return ` ${partner.name} and their ${
      children.length === 1 ? `child ${childNames}` : `children ${childNames}${moreChildren}`
    } survive them.`;
  }
  if (partner) return ` ${partner.name} survives them.`;
  return children.length === 1
    ? ` Their child, ${childNames}, carries on.`
    : ` Their children — ${childNames}${moreChildren} — carry on.`;
}

/**
 * A short blessing phrase for a newborn, derived from the parents' combined
 * traits. Returned as a complete sentence, or "" for the default templates
 * that don't need one.
 */
function birthBlessing(
  traitA: NPC["trait"],
  traitB: NPC["trait"],
  rand: () => number,
): string {
  const BLESSINGS: Record<string, readonly string[]> = {
    joyful: [
      "The midwife said they laughed before they cried, which everyone agreed was impossible and also correct.",
      "The room seemed lighter the moment they arrived.",
    ],
    grim: [
      "Even the solemn say a child is a beginning.",
      "The parents sat quietly with them for a long time and felt something lift.",
    ],
    curious: [
      "The child looked around immediately, as if taking inventory.",
      "They already seem to want to know what everything is.",
    ],
    stoic: [
      "The parents received the news quietly, which for them was as good as a celebration.",
      "No words were spoken. None were needed.",
    ],
    kind: [
      "The neighbors brought food without being asked, the way they always do for this family.",
      "Three people offered to help before being asked. The family thanked all of them.",
    ],
    ambitious: [
      "The parents have already begun arguing about the child's name in a way that suggests they each have plans.",
      "Even now the parents have opinions about which trade the child will learn.",
    ],
    anxious: [
      "Both parents are well, the midwife confirmed twice, and then again when asked.",
      "The midwife eventually had to ask the parents to stop worrying long enough to celebrate.",
    ],
    wise: [
      "The elders say children born in this season grow up with patience, which is the rarest gift.",
      "The old women sat outside the door and told stories until dawn, as is tradition.",
    ],
  };
  // Try the shared trait first, then one of the parents' traits.
  const pool =
    traitA && traitA === traitB
      ? BLESSINGS[traitA]
      : traitA && BLESSINGS[traitA]
        ? BLESSINGS[traitA]
        : traitB && BLESSINGS[traitB]
          ? BLESSINGS[traitB]
          : undefined;
  if (!pool) return "";
  return pool[Math.floor(rand() * pool.length)];
}

/**
 * Trait-aware marriage line pool. When both NPCs have known traits, we can
 * pick from a pool that reflects their pairing. Falls back to MARRIAGE_LINES
 * if no trait-specific pool exists.
 */
function traitMarriagePool(
  traitA: NPC["trait"],
  traitB: NPC["trait"],
): readonly string[] {
  // Complementary pairs get special prose; same-trait pairs get their own.
  const PAIR_POOLS: Record<string, readonly string[]> = {
    "joyful+grim": [
      "{a} filled the room with noise while {b} stood quietly at the altar — which is exactly how everyone expected this to go.",
      "The wedding at {place} was half celebration, half ceremony. {a} arranged the celebration. {b} arranged the ceremony.",
    ],
    "curious+wise": [
      "{a} had a hundred questions; {b} answered the three that actually mattered. They were married by noon.",
      "The scholars of {place} said the match made sense before either {a} or {b} admitted it.",
    ],
    "ambitious+kind": [
      "{a} had plans for the next five years. {b} made sure the first year was worth living through.",
      "Someone had to reach for the horizon. Someone had to keep the fire lit. {a} and {b} at {place}.",
    ],
    "stoic+anxious": [
      "{b} worried aloud. {a} stood still and waited. This, the guests agreed, would work.",
      "At {place}, {a} and {b} wed. {b} had prepared for fourteen different outcomes. {a} had prepared for one.",
    ],
    "joyful+joyful": [
      "The wedding at {place} lasted two days. No one complained.",
      "{a} and {b} were so happy they made everyone around them suspicious — and then happy too.",
    ],
    "stoic+stoic": [
      "{a} and {b} signed the register, shook hands, and announced a modest supper. The guests found this deeply moving.",
      "At {place}, the vows were brief and the meaning was not.",
    ],
    "wise+wise": [
      "{a} and {b} had been talking for years before someone finally asked why they weren't married.",
      "Two old souls, recognized. The ceremony at {place} felt like a confirmation of something everyone already knew.",
    ],
    "ambitious+ambitious": [
      "The guests at {place} quietly placed bets on which of them would run the town within a year.",
      "{a} and {b}: a wedding that felt less like a celebration and more like the beginning of a very productive arrangement.",
    ],
  };

  // Build a normalized key (sorted so order doesn't matter).
  const sorted = [String(traitA), String(traitB)].sort().join("+");
  return PAIR_POOLS[sorted] ?? MARRIAGE_LINES;
}

// ── Anniversary prose ─────────────────────────────────────────────────────

const ANNIVERSARY_LINES: readonly string[] = [
  "{a} and {b} marked {years} year{s} together today. The occasion was noted in the chronicle without much ceremony, which is exactly how they would have wanted it.",
  "It has been {years} year{s} since {a} and {b} were wed at {place}. The town remembered the date before either of them did.",
  "{years} year{s} of {a} and {b}. The children gave them a bunch of wildflowers picked from the south meadow. The flowers were slightly wilted. Nobody mentioned it.",
  "The {years}{ord} anniversary of the wedding of {a} and {b}. They sat in the same spot they sat after the ceremony, and said roughly the same things, and were satisfied with that.",
  "{a} woke {b} up at dawn to remind them. Neither of them could believe it had been {years} year{s}. The kingdom's records confirmed it.",
];

function anniversaryLine(
  a: import("../types").NPC,
  b: import("../types").NPC,
  years: number,
  rand: () => number,
): string {
  const ord = (n: number) => {
    const v = n % 100;
    if (v >= 11 && v <= 13) return "th";
    switch (n % 10) { case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th"; }
  };
  const place = b.homeId ? b.homeId.charAt(0).toUpperCase() + b.homeId.slice(1) : "the town";
  return pickFrom(ANNIVERSARY_LINES, rand)
    .replace("{a}", a.name ?? "they")
    .replace("{b}", b.name ?? "their partner")
    .replace("{years}", String(years))
    .replace("{s}", years === 1 ? "" : "s")
    .replace("{ord}", ord(years))
    .replace("{place}", place);
}

function pickFrom<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

/**
 * Returns "the ever-cheerful Berta" if the NPC has a trait, else just
 * "Berta". The epithet is picked deterministically via `epithetFor(trait,
 * seed)` so the same villager always reads with the same descriptor across
 * save/load.
 */
function describe(npc: NPC): string {
  if (npc.trait) return `the ${epithetFor(npc.trait, npc.seed)} ${npc.name}`;
  return npc.name ?? "someone";
}

function nice(id: string): string {
  if (!id) return "town";
  return id.charAt(0).toUpperCase() + id.slice(1);
}
