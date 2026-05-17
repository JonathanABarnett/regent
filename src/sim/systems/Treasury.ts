/**
 * Treasury / artifacts — the kingdom's collected wonders.
 *
 * Artifacts accumulate in the castle vault, persist across monarchs (so a
 * 5-generation save shows the heirloom collection), and feel meaningful
 * because each one carries who-found-it and when.
 *
 * Sources:
 *   - Scholar quest payouts (translated maps, ancient tomes)
 *   - Merchant offer outcomes
 *   - Festival climaxes
 *   - Rare narrative-director rolls
 *   - Streamer raid bonuses (configurable)
 *
 * Pure data — no rendering. Surfaced via UI (StructureInspector for the
 * castle, StatsDashboard, journal).
 */

import type { World } from "../World";
import type { Journal } from "./Journal";

export type ArtifactKind =
  | "scroll"
  | "relic"
  | "gem"
  | "tome"
  | "weapon"
  | "treasure";

export interface Artifact {
  id: string;
  kind: ArtifactKind;
  name: string;
  /** Optional flavor — "found by Berta on Day 47", "from a raid", etc. */
  origin?: string;
  /** Day in the kingdom when this was obtained. */
  obtainedOnDay: number;
  obtainedOnYear: number;
}

const ARTIFACT_NAMES: Record<ArtifactKind, string[]> = {
  scroll: [
    "Scroll of Ferns",
    "Map to the Spring",
    "Trade Treaty of Greenholm",
    "Charter of the Old Lords",
  ],
  relic: [
    "Ironhearth Locket",
    "Crown of the First Smiths",
    "Bone Reliquary",
    "Pilgrim's Pendant",
  ],
  gem: [
    "Heart of the Deeprock",
    "Greenholm Star",
    "Tear of the River",
    "Coast Pearl",
  ],
  tome: [
    "Annals of the First Reign",
    "Codex of Wandering Beasts",
    "Book of Hours",
    "Treatise on Salt",
  ],
  weapon: [
    "Sword of the Long Watch",
    "Spear of Quiet Mornings",
    "Bow of the Northern Light",
    "Mace of Iron Pact",
  ],
  treasure: [
    "Chest of Imperial Coin",
    "Sapphire Cluster",
    "Old Royal Seal",
    "Gold Plates of Hallowmere",
  ],
};

const KIND_PREFIX: Record<ArtifactKind, string> = {
  scroll: "📜",
  relic: "✦",
  gem: "◆",
  tome: "📖",
  weapon: "⚔",
  treasure: "👑",
};

export class Treasury {
  artifacts: Artifact[] = [];
  /** Listeners — used by UI panels and achievements. */
  private listeners = new Set<(artifact: Artifact) => void>();

  constructor(private world: World, private journal: Journal) {}

  subscribe(fn: (artifact: Artifact) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Add an artifact of the given kind. Origin is optional but enriched
   * automatically with the current season + year if not already present,
   * so every vault piece carries "when" as well as "what".
   */
  acquire(kind: ArtifactKind, origin?: string): Artifact {
    const names = ARTIFACT_NAMES[kind];
    // Prefer names not already present so the collection stays varied
    const taken = new Set(this.artifacts.map((a) => a.name));
    const pool = names.filter((n) => !taken.has(n));
    const chosen = pool.length
      ? pool[Math.floor(Math.random() * pool.length)]
      : `${names[0]} (II)`;

    // Auto-stamp world context onto every origin that doesn't already
    // mention a year — "the champion's cup" → "the champion's cup, won in
    // summer of year 2." Makes the vault feel like a real historical record.
    const season = this.world.state.season;
    const year = this.world.state.year;
    const contextSuffix = `, ${season} of year ${year}`;
    const enrichedOrigin = origin
      ? (origin.includes("year") ? origin : origin + contextSuffix)
      : `found in the ${season} of year ${year}`;

    const artifact: Artifact = {
      id: `art_${Math.floor(Date.now() / 1000)}_${this.artifacts.length}`,
      kind,
      name: chosen,
      origin: enrichedOrigin,
      obtainedOnDay: this.world.state.day,
      obtainedOnYear: year,
    };
    this.artifacts.push(artifact);
    // Enforce the soft cap on the live vault so a runaway content loop can't
    // bloat the save indefinitely. Oldest artifacts age out first.
    if (this.artifacts.length > Treasury.CAP) {
      this.artifacts.splice(0, this.artifacts.length - Treasury.CAP);
    }
    this.journal.write(
      `${KIND_PREFIX[kind]} ${chosen} was placed in the royal vault — ${enrichedOrigin}.`,
      "milestone",
    );
    for (const fn of this.listeners) {
      try {
        fn(artifact);
      } catch (err) {
        console.warn("[Treasury] listener threw", err);
      }
    }
    return artifact;
  }

  count(): number {
    return this.artifacts.length;
  }

  /** Soft cap so a runaway content loop doesn't bloat the save. */
  static readonly CAP = 200;

  /** Restore from save. */
  hydrate(saved: Artifact[]) {
    this.artifacts = saved.slice(0, Treasury.CAP);
  }
}

export function kindGlyph(kind: ArtifactKind): string {
  return KIND_PREFIX[kind] ?? "·";
}
