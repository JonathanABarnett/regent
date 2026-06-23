/**
 * Chronicle — the Book of the Dynasty. Every completed reign is recorded as a
 * numbered chapter, so a kingdom's whole story reads as Chapter I, II, III…
 * Distinct from KingdomArchive (which remembers previous *kingdoms*); this is
 * the chapters *within* the current kingdom's life.
 *
 * Each chapter is named for the ERA it covered (not just the monarch): a reign
 * with raids becomes "The War Years", one full of feasts "The Glad Years". The
 * era is read from a light tally of notable bus events during the reign, so the
 * title reflects what actually happened — the book reads as authored, not
 * tabular. Recorded from writeMonarchLegacy on every monarch change, and
 * persisted with the world save.
 */

import type { ReignSummary, LegacyContext } from "./MonarchLegacy";

/** One reign, frozen as a chapter of the kingdom's book. */
export interface ReignChapter {
  /** 1 = the founding reign. */
  chapter: number;
  /** Era title, e.g. "The War Years" — names the chapter by what happened. */
  title: string;
  name: string;
  epithet: string;
  context: LegacyContext;
  startYear: number;
  endYear: number;
  reignDays: number;
  population: number;
  reputation: string;
  vaultSize: number;
  dynastyStreak: number;
  headline: string;
  /** 0–3 of the reign's most notable journal beats (milestones, then life). */
  highlights: string[];
}

/** Running tally of notable events for the reign in progress. */
export interface ReignTheme {
  festivals: number;
  wars: number;
}

/** A notable journal beat for the reign in progress. */
interface ReignBeat {
  text: string;
  rank: number; // 0 = milestone, 1 = life
}

export interface ChronicleSnapshot {
  chapters: ReignChapter[];
  /** The in-progress reign's event tally (so a mid-reign reload keeps it). */
  theme?: ReignTheme;
  /** The in-progress reign's notable beats (so a mid-reign reload keeps them). */
  beats?: ReignBeat[];
}

/** Bound on save size. A 100-reign dynasty is astronomically long already. */
const MAX_CHAPTERS = 100;

const CONTEXTS: readonly LegacyContext[] = ["natural", "usurper", "uprising"];

/**
 * Name a reign's era. Events that DEFINED the reign win first (how it ended,
 * then war/feasts), then its shape (length), then the standing/mood it left.
 * Deterministic. Kept distinct from the monarch's epithet: the epithet is the
 * person, the title is the age.
 */
export function reignTitle(input: {
  context: LegacyContext;
  reignDays: number;
  reputation: string;
  moodTier: string;
  festivals: number;
  wars: number;
}): string {
  const { context, reignDays, reputation, moodTier, festivals, wars } = input;
  if (context === "usurper") return "The Broken Crown";
  if (context === "uprising") return "The People's Turn";
  if (wars >= 2) return "The War Years";
  if (festivals >= 3) return "The Glad Years";
  if (reignDays >= 280) return "The Long Peace";
  if (reignDays < 14) return "A Brief Candle";
  if (reputation === "feared") return "The Hard Years";
  if (reputation === "beloved") return "The Golden Years";
  if (moodTier === "anxious") return "The Anxious Years";
  return "The Quiet Years";
}

/** How many beats to keep buffered before trimming (we only need ~3). */
const MAX_BEATS = 24;

export class Chronicle {
  private list: ReignChapter[] = [];
  private theme: ReignTheme = { festivals: 0, wars: 0 };
  private beats: ReignBeat[] = [];

  /** Tally a notable world-bus event toward the reign in progress. */
  noteEvent(kind: string): void {
    if (kind === "festival" || kind === "celebration") this.theme.festivals++;
    else if (kind === "monster") this.theme.wars++; // war casualty / raid
  }

  /**
   * Remember a notable journal beat for the reign in progress. Only milestone
   * and life entries are highlight-worthy; everything else is noise. Fed from
   * Journal.write so it captures the actual prose the player saw.
   */
  noteBeat(text: string, kind: string): void {
    const rank = kind === "milestone" ? 0 : kind === "life" ? 1 : -1;
    if (rank < 0) return;
    this.beats.push({ text, rank });
    if (this.beats.length > MAX_BEATS) {
      this.beats.splice(0, this.beats.length - MAX_BEATS);
    }
  }

  currentTheme(): ReignTheme {
    return { ...this.theme };
  }

  /** Pick the reign's 0–3 standout beats: milestones first, in reading order. */
  private pickHighlights(): string[] {
    return this.beats
      .map((b, i) => ({ ...b, i }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .slice(0, 3)
      .sort((a, b) => a.i - b.i)
      .map((b) => (b.text.length > 120 ? b.text.slice(0, 119) + "…" : b.text));
  }

  /**
   * Record a completed reign as the next chapter. Chapter number is the
   * departed monarch's ordinal — `summary.generation` is already the *new*
   * monarch's number when this fires, so the chapter is one behind. Resets the
   * event tally so the next reign's era is tracked fresh.
   */
  record(summary: ReignSummary, startYear: number, endYear: number): ReignChapter {
    const chapter: ReignChapter = {
      chapter: Math.max(1, summary.generation - 1),
      title: reignTitle({
        context: summary.context,
        reignDays: summary.reignDays,
        reputation: summary.reputation,
        moodTier: summary.moodTier,
        festivals: this.theme.festivals,
        wars: this.theme.wars,
      }),
      name: summary.name,
      epithet: summary.epithet,
      context: summary.context,
      startYear,
      endYear,
      reignDays: summary.reignDays,
      population: summary.population,
      reputation: summary.reputation,
      vaultSize: summary.vaultSize,
      dynastyStreak: summary.dynastyStreak,
      headline: summary.headline,
      highlights: this.pickHighlights(),
    };
    this.list.push(chapter);
    if (this.list.length > MAX_CHAPTERS) {
      this.list = this.list.slice(this.list.length - MAX_CHAPTERS);
    }
    // Next reign starts with a fresh tally + empty beat buffer.
    this.theme = { festivals: 0, wars: 0 };
    this.beats = [];
    return chapter;
  }

  /** All recorded chapters, oldest→newest (a copy). */
  chapters(): ReignChapter[] {
    return this.list.map((c) => ({ ...c }));
  }

  count(): number {
    return this.list.length;
  }

  snapshot(): ChronicleSnapshot {
    return {
      chapters: this.list.map((c) => ({ ...c })),
      theme: { ...this.theme },
      beats: this.beats.map((b) => ({ ...b })),
    };
  }

  hydrate(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const arr = (raw as { chapters?: unknown }).chapters;
    if (Array.isArray(arr)) {
      this.list = arr
        .map(coerceChapter)
        .filter((c): c is ReignChapter => c !== null)
        .slice(-MAX_CHAPTERS);
    }
    const t = (raw as { theme?: unknown }).theme;
    if (t && typeof t === "object") {
      this.theme = {
        festivals: Math.max(0, Math.floor(num((t as Record<string, unknown>).festivals, 0))),
        wars: Math.max(0, Math.floor(num((t as Record<string, unknown>).wars, 0))),
      };
    }
    const b = (raw as { beats?: unknown }).beats;
    if (Array.isArray(b)) {
      this.beats = b
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as Record<string, unknown>).text === "string")
        .map((x) => ({ text: str(x.text, ""), rank: x.rank === 1 ? 1 : 0 }))
        .slice(-MAX_BEATS);
    }
  }
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v.slice(0, 240) : fallback;
}

/** Defensive per-chapter validation for restored saves. */
function coerceChapter(raw: unknown): ReignChapter | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string") return null;
  const context = CONTEXTS.includes(r.context as LegacyContext)
    ? (r.context as LegacyContext)
    : "natural";
  return {
    chapter: Math.max(1, Math.floor(num(r.chapter, 1))),
    title: str(r.title, "The Quiet Years"),
    name: str(r.name, "a monarch"),
    epithet: str(r.epithet, "the Steady"),
    context,
    startYear: Math.max(1, Math.floor(num(r.startYear, 1))),
    endYear: Math.max(1, Math.floor(num(r.endYear, 1))),
    reignDays: Math.max(0, Math.floor(num(r.reignDays, 0))),
    population: Math.max(0, Math.floor(num(r.population, 0))),
    reputation: str(r.reputation, "steady"),
    vaultSize: Math.max(0, Math.floor(num(r.vaultSize, 0))),
    dynastyStreak: Math.max(0, Math.floor(num(r.dynastyStreak, 0))),
    headline: str(r.headline, ""),
    highlights: Array.isArray(r.highlights)
      ? (r.highlights as unknown[]).filter((h): h is string => typeof h === "string").slice(0, 3).map((h) => str(h, ""))
      : [],
  };
}
