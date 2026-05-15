import type { EventBus } from "../events/EventBus";
import { makeEvent } from "../events/EventSchema";
import type { OverworldMap } from "../Map";

/**
 * Soft narrative director. Periodically injects flavor events when the world
 * has been quiet, so an idle user still sees activity. Cadence is gentle
 * (every ~45-90s), and skips firing if external events have happened recently.
 *
 * This is the "world feels alive on its own" guarantee.
 *
 * Variety strategy:
 *   - Each branch has a small pool of label variants so the same forge event
 *     reads as "routine smithing" one hour and "a shipment of horseshoes"
 *     the next.
 *   - 8 branches total (was 5), so an evening of idle play surfaces more
 *     than just the same five flavor lines.
 */
export class NarrativeDirector {
  private nextFireIn = 30;

  /** seconds since the last externally-sourced event */
  private quietSeconds = 0;

  constructor(
    private bus: EventBus,
    private map: OverworldMap,
    private rand: () => number = Math.random,
  ) {
    bus.subscribe((ev) => {
      if (ev.source !== "narrative" && ev.source !== "internal") {
        this.quietSeconds = 0;
      }
    });
  }

  tick(dt: number) {
    this.quietSeconds += dt;
    this.nextFireIn -= dt;
    if (this.nextFireIn > 0) return;
    this.nextFireIn = 45 + this.rand() * 45;

    // when world has been quiet, fire something flavorful
    if (this.quietSeconds > 20) {
      this.fireFlavor();
    }
  }

  private pickStructure(kinds: string[]) {
    const candidates = this.map.structures.filter((s) => kinds.includes(s.kind));
    if (!candidates.length) return null;
    return candidates[Math.floor(this.rand() * candidates.length)];
  }

  private pickFrom<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.rand() * arr.length)];
  }

  private fireFlavor() {
    const roll = this.rand();
    if (roll < 0.18) this.fireCourier();
    else if (roll < 0.36) this.fireResearch();
    else if (roll < 0.52) this.fireForge();
    else if (roll < 0.66) this.fireMonster();
    else if (roll < 0.78) this.fireFestival();
    else if (roll < 0.86) this.fireMining();
    else if (roll < 0.91) this.fireAirship();
    else if (roll < 0.96) this.firePilgrimage();
    else this.fireLoneFisher();
  }

  private fireLoneFisher() {
    // A "lone fisher" arrives at the river/coast — flavored as a courier
    // event whose label nods at solitude rather than commerce. Useful when
    // the kingdom is feeling crowded with festivals and forges.
    const towns = this.map.structures.filter((s) => s.kind === "town");
    if (towns.length < 2) return;
    const from = towns[Math.floor(this.rand() * towns.length)];
    const others = towns.filter((t) => t.id !== from.id);
    if (!others.length) return;
    const to = others[Math.floor(this.rand() * others.length)];
    this.bus.publish(
      makeEvent("courier", {
        source: "narrative",
        intensity: 0.2,
        payload: {
          from: from.id,
          to: to.id,
          label: this.pickFrom(FISHER_LABELS),
        },
      }),
    );
  }

  private fireCourier() {
    // traveling merchant: courier between two random towns (or to/from castle
    // if there's only one town).
    const towns = this.map.structures.filter((s) => s.kind === "town");
    const castle = this.map.structures.find((s) => s.kind === "castle");
    if (towns.length === 0 && !castle) return;
    const a = towns.length
      ? towns[Math.floor(this.rand() * towns.length)]
      : castle!;
    // Pick a different destination than `a`. If only one town exists, route
    // via the castle (or skip entirely if there's no castle either).
    let b = a;
    const pool = [...towns];
    if (castle) pool.push(castle);
    const others = pool.filter((s) => s.id !== a.id);
    if (others.length) {
      b = others[Math.floor(this.rand() * others.length)];
    } else {
      return; // can't route — bail rather than emit a self-courier
    }
    this.bus.publish(
      makeEvent("courier", {
        source: "narrative",
        intensity: 0.4,
        payload: { from: a.id, to: b.id, label: this.pickFrom(COURIER_LABELS) },
      }),
    );
  }

  private fireResearch() {
    const lib = this.pickStructure(["library"]);
    if (!lib) return;
    this.bus.publish(
      makeEvent("research", {
        source: "narrative",
        intensity: 0.3,
        payload: { structure: lib.id, label: this.pickFrom(RESEARCH_LABELS) },
      }),
    );
  }

  private fireForge() {
    const forge = this.pickStructure(["forge"]);
    if (!forge) return;
    this.bus.publish(
      makeEvent("forge", {
        source: "narrative",
        intensity: 0.4,
        payload: { structure: forge.id, label: this.pickFrom(FORGE_LABELS) },
      }),
    );
  }

  private fireMonster() {
    this.bus.publish(
      makeEvent("monster", {
        source: "narrative",
        intensity: 0.3,
        payload: { label: this.pickFrom(MONSTER_LABELS) },
      }),
    );
  }

  private fireFestival() {
    const town = this.pickStructure(["town", "castle"]);
    if (!town) return;
    this.bus.publish(
      makeEvent("festival", {
        source: "narrative",
        intensity: 0.6,
        duration_ms: 30_000,
        payload: { structure: town.id, label: this.pickFrom(FESTIVAL_LABELS) },
      }),
    );
  }

  private fireMining() {
    const mine = this.pickStructure(["mine"]);
    if (!mine) return;
    this.bus.publish(
      makeEvent("mining", {
        source: "narrative",
        intensity: 0.3,
        payload: { structure: mine.id, label: this.pickFrom(MINING_LABELS) },
      }),
    );
  }

  private fireAirship() {
    this.bus.publish(
      makeEvent("airship", {
        source: "narrative",
        intensity: 0.3,
        payload: { label: this.pickFrom(AIRSHIP_LABELS) },
      }),
    );
  }

  private firePilgrimage() {
    // A pilgrim or wandering soul appears — flavored as a courier event whose
    // label hints at something other than commerce. Routes from a town to the
    // shrine if one exists; otherwise to the castle.
    const towns = this.map.structures.filter((s) => s.kind === "town");
    const shrine = this.map.structures.find((s) => s.kind === "shrine");
    const castle = this.map.structures.find((s) => s.kind === "castle");
    const dest = shrine ?? castle;
    if (!dest || towns.length === 0) return;
    const origin = towns[Math.floor(this.rand() * towns.length)];
    if (origin.id === dest.id) return;
    this.bus.publish(
      makeEvent("courier", {
        source: "narrative",
        intensity: 0.25,
        payload: {
          from: origin.id,
          to: dest.id,
          label: this.pickFrom(PILGRIM_LABELS),
        },
      }),
    );
  }
}

// ── Label pools ──────────────────────────────────────────────────────────
// Each pool is small (4-6 entries). Adding to these is the easiest way to
// dial up flavor variety without changing any logic.

const COURIER_LABELS: readonly string[] = [
  "merchant caravan",
  "salt traders",
  "a pack of trinket-sellers",
  "an emissary from a far court",
  "a wagon of fresh bread",
  "the tax collector's clerk",
];

const RESEARCH_LABELS: readonly string[] = [
  "study session",
  "a translation of an old map",
  "the cataloguing of strange seeds",
  "a midnight comparison of star charts",
  "a quiet day of marginalia",
];

const FORGE_LABELS: readonly string[] = [
  "routine smithing",
  "a shipment of horseshoes",
  "kitchen knives by the dozen",
  "repairs from the watch",
  "a commissioned hinge",
  "nails — always nails",
];

const MONSTER_LABELS: readonly string[] = [
  "distant howl",
  "tracks at the wood's edge",
  "a strange light in the deep forest",
  "a smell on the wind no one could name",
  "a deer found half-buried",
];

const FESTIVAL_LABELS: readonly string[] = [
  "evening gathering",
  "a children's bonfire",
  "a remembrance of an old harvest",
  "an impromptu fiddler",
  "a wedding spilling into the street",
];

const MINING_LABELS: readonly string[] = [
  "an unexpected vein",
  "deep shift work",
  "iron for the next quarter",
  "tin and worry",
];

const AIRSHIP_LABELS: readonly string[] = [
  "a slow passage south",
  "an unmarked silhouette",
  "the noon airship",
  "an airship listing in the wind",
];

const FISHER_LABELS: readonly string[] = [
  "a lone fisher walking the long way home",
  "an old man with two strings of trout",
  "a young angler whose only catch is a cracked clay pipe",
  "someone who insists they almost caught a riverpike",
  "a fisher with a wet dog and no fish at all",
];

const PILGRIM_LABELS: readonly string[] = [
  "a pilgrim with a brass lantern",
  "an old man with no name",
  "a child sent to make an offering",
  "a traveler reading from a small book",
  "a singer who promises to play once and leave",
];
