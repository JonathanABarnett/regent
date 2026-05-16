/**
 * Pure data functions for the Kingdom Card.
 *
 * The Kingdom Card is a single shareable PNG that summarizes the player's
 * kingdom — name, monarch, recent milestones — in a Twitter/Mastodon-friendly
 * 1200×630 composition. It's deliberately *not* a screenshot; it's a
 * generative composition, so every share is a clean, on-brand asset.
 *
 * This file holds the DOM-independent half: picking which milestones make
 * the card, trimming long text to a character budget, composing the input
 * record from a world snapshot. Everything here is testable in node.
 *
 * The actual Canvas2D drawing lives in `kingdom-card-renderer.ts`.
 */

import type { SavedJournalEntry } from "../sim/Persistence";

/** Final dimensions of the rendered PNG. Tuned for X/Twitter/Mastodon previews. */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/**
 * Stats overlay block — rendered as a small badge row under the divider.
 * Every field is optional; the renderer only draws badges for the ones
 * that have meaningful values.
 */
export interface KingdomCardStats {
  population?: number;
  gold?: number;
  vault?: number;
  achievementsUnlocked?: number;
  achievementsTotal?: number;
  /** Population history series, oldest first. Used for the inset sparkline. */
  populationSeries?: readonly number[];
}

export interface KingdomCardInput {
  kingdomName: string;
  monarchName: string;
  /** Optional — falls back to a generic line when absent. */
  petName?: string;
  /** Hex string like "#b45309". */
  bannerColor: string;
  day: number;
  year: number;
  generation: number;
  /** Up to 5 milestone-or-noteworthy lines, oldest first. */
  milestones: string[];
  /** Optional stats; if absent, the stats row + sparkline are skipped. */
  stats?: KingdomCardStats;
  /**
   * Optional player-typed motto. When present, surfaces between the title
   * and the subtitle on the card. Empty / undefined → motto line skipped.
   */
  motto?: string;
}

/**
 * Pick the last N values out of a long history series, suitable for a small
 * sparkline (the card budgets ~120px wide, so 30-60 samples is plenty).
 *
 * Returns a new array; never mutates the input. If `samples` is empty,
 * returns an empty array.
 */
export function pickSparklineSeries(
  samples: readonly number[],
  max: number = 60,
): number[] {
  if (samples.length === 0) return [];
  if (samples.length <= max) return samples.slice();
  return samples.slice(samples.length - max);
}

/**
 * Compact human formatter for the stats badges. Keeps the row short.
 *   12 → "12"
 *   1234 → "1.2k"
 *   1234567 → "1.2M"
 */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (n < 1000) return Math.floor(n).toString();
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  if (n < 1_000_000) return Math.floor(n / 1000) + "k";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}

/**
 * Pick the milestones that go on the card. Priority order:
 *   1. "milestone" kind entries (the moments the journal already calls out)
 *   2. "life" kind entries (births, marriages, deaths) — these read as story
 *   3. "event" kind entries (everything else worth reading aloud)
 *
 * "system" and "weather" entries are filtered out — they're either too noisy
 * ("Day 12 dawns; spring continues") or too short to read as a highlight.
 *
 * Returns at most `max` entries, oldest first. If the journal is empty
 * returns an empty array — callers should fall back to a generic line.
 */
export function pickCardMilestones(
  journal: readonly SavedJournalEntry[],
  max: number = 5,
): string[] {
  const ranked: Array<{ text: string; rank: number; order: number }> = [];
  for (let i = 0; i < journal.length; i++) {
    const e = journal[i];
    let rank: number;
    if (e.kind === "milestone") rank = 0;
    else if (e.kind === "life") rank = 1;
    else if (e.kind === "event") rank = 2;
    else continue; // skip system + weather
    ranked.push({ text: e.text, rank, order: i });
  }
  // Sort by rank asc, then by order desc (newest first within rank).
  ranked.sort((a, b) => a.rank - b.rank || b.order - a.order);
  const top = ranked.slice(0, max);
  // Display in chronological order (oldest first) so the card reads forward.
  top.sort((a, b) => a.order - b.order);
  return top.map((r) => r.text);
}

/**
 * Trim a milestone line to roughly fit a fixed-width slot on the card. We
 * budget by character count rather than measuring text in canvas because the
 * data file stays node-testable; the renderer can still re-trim more
 * precisely if it wants.
 *
 * Cuts at the nearest word boundary and appends an ellipsis only when an
 * actual truncation happened.
 */
export function trimMilestoneLine(text: string, maxChars: number = 90): string {
  if (text.length <= maxChars) return text;
  // Reserve 1 char for the ellipsis.
  const budget = Math.max(1, maxChars - 1);
  let cut = text.slice(0, budget);
  // Walk back to the last space so we don't cleave a word in half.
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > budget * 0.6) {
    cut = cut.slice(0, lastSpace);
  }
  // Strip trailing punctuation we'd otherwise immediately follow with "…".
  cut = cut.replace(/[\s.,;:—–-]+$/, "");
  return cut + "…";
}

/**
 * Compose the card input from raw world bits. Pure; takes everything as
 * arguments so the function is trivially testable.
 *
 * Pass 1 keeps this minimal — kingdom name, monarch, banner, recent
 * milestones, and the date stamp. Later passes pile on stats, achievements,
 * and sprite data.
 */
export function composeCardInput(args: {
  kingdomName: string;
  monarchName: string;
  petName?: string;
  bannerColor: string;
  day: number;
  year: number;
  generation: number;
  journal: readonly SavedJournalEntry[];
  /** Override the milestone count. Default 5. */
  maxMilestones?: number;
  /** Override the per-line char budget. Default 90. */
  maxLineChars?: number;
  /** Optional stats block; passed through to the renderer when present. */
  stats?: KingdomCardStats;
  /** Optional motto; trimmed + passed through to the renderer. */
  motto?: string;
}): KingdomCardInput {
  const milestones = pickCardMilestones(args.journal, args.maxMilestones ?? 5)
    .map((m) => trimMilestoneLine(m, args.maxLineChars ?? 90));
  // Motto cleaning: collapse internal whitespace and clamp character count.
  // The store already sanitized on the way in; this is defense-in-depth.
  const motto = args.motto
    ? args.motto.replace(/\s+/g, " ").trim().slice(0, 80)
    : undefined;
  return {
    kingdomName: args.kingdomName,
    monarchName: args.monarchName,
    petName: args.petName,
    bannerColor: args.bannerColor,
    day: args.day,
    year: args.year,
    generation: args.generation,
    milestones,
    stats: args.stats,
    motto: motto || undefined,
  };
}

/**
 * A filename suggestion for the saved PNG. Keeps kingdom name URL-safe and
 * appends a date-stamp so multiple shares from the same kingdom don't
 * stomp each other.
 */
export function cardFilename(kingdomName: string, day: number, year: number): string {
  const safe = kingdomName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kingdom";
  return `${safe}-y${year}d${day}-card.png`;
}
