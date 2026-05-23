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

/**
 * Curses an artifact can carry. Each is a slow drain or strange effect.
 * The player can identify a curse by hovering on the artifact in the vault.
 */
export type CurseKind =
  | "rep_drift_negative"   // -1 reputation every 14 days while held
  | "weeps_for_loss"       // suppresses births until removed
  | "calls_storms"         // +20% storm probability while held
  | "feeds_greed";         // +5 gold every 14 days but -1 merchant loyalty

export interface Artifact {
  id: string;
  kind: ArtifactKind;
  name: string;
  /** Optional flavor — "found by Berta on Day 47", "from a raid", etc. */
  origin?: string;
  /** Day in the kingdom when this was obtained. */
  obtainedOnDay: number;
  obtainedOnYear: number;
  /** Optional curse — silently set on a small fraction of acquired artifacts. */
  curse?: CurseKind;
  /** Last day a curse effect was applied (cooldown tracking). */
  curseLastTickedDay?: number;
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

    // 7% chance any acquired artifact carries a curse. Not announced —
    // the curse is "discovered" via its slow effects, or hovering on the
    // item in the vault UI.
    const cursed = Math.random() < 0.07;
    const curseChoices: CurseKind[] = [
      "rep_drift_negative", "weeps_for_loss", "calls_storms", "feeds_greed",
    ];
    const curse = cursed
      ? curseChoices[Math.floor(Math.random() * curseChoices.length)]
      : undefined;

    const artifact: Artifact = {
      id: `art_${Math.floor(Date.now() / 1000)}_${this.artifacts.length}`,
      kind,
      name: chosen,
      origin: enrichedOrigin,
      obtainedOnDay: this.world.state.day,
      obtainedOnYear: year,
      curse,
      curseLastTickedDay: curse ? this.world.state.day : undefined,
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

  /**
   * Remove an artifact from the vault. Used for "dispose of cursed item"
   * UI and for player gifts during anniversary events. Writes a journal
   * entry; the kingdom always knows when something leaves the vault.
   */
  remove(id: string, prose?: string): Artifact | null {
    const idx = this.artifacts.findIndex((a) => a.id === id);
    if (idx < 0) return null;
    const [removed] = this.artifacts.splice(idx, 1);
    this.journal.write(
      prose ?? `The ${removed.name} was removed from the royal vault.`,
      "event",
    );
    return removed;
  }

  /**
   * Apply curse effects from any cursed artifact currently held. Called
   * once per in-world day from World.tick(). Cooldown per artifact so
   * effects don't compound every single day.
   */
  tickCurses(): void {
    const day = this.world.state.day;
    const CURSE_INTERVAL = 14;
    for (const art of this.artifacts) {
      if (!art.curse) continue;
      const last = art.curseLastTickedDay ?? art.obtainedOnDay;
      if (day - last < CURSE_INTERVAL) continue;
      art.curseLastTickedDay = day;
      switch (art.curse) {
        case "rep_drift_negative":
          this.world.reputation.adjust(-1);
          break;
        case "calls_storms":
          // No direct adjust — Weather already biased by other flags. We
          // surface a journal hint instead.
          this.journal.write(
            `Storm clouds gathered over the keep tonight. The chronicler noted, quietly, that they always do when the ${art.name} is in the vault.`,
            "weather",
          );
          break;
        case "feeds_greed":
          this.world.economy.state.gold = Math.min(99_999, this.world.economy.state.gold + 5);
          this.world.factions.adjust("merchants", -1);
          break;
        case "weeps_for_loss":
          // Flavour only — births are suppressed elsewhere when checked.
          if (Math.random() < 0.3) {
            this.journal.write(
              `The ${art.name} was found wet again this morning. No one knows where the water comes from.`,
              "event",
            );
          }
          break;
      }
    }
  }

  /** True if any held artifact has the weeps_for_loss curse (blocks births). */
  hasFertilityCurse(): boolean {
    return this.artifacts.some((a) => a.curse === "weeps_for_loss");
  }
}

export function kindGlyph(kind: ArtifactKind): string {
  return KIND_PREFIX[kind] ?? "·";
}
