/**
 * Chronicle — the Book of the Dynasty. Every completed reign is recorded as a
 * numbered chapter, so a kingdom's whole story reads as Chapter I, II, III…
 * Distinct from KingdomArchive (which remembers previous *kingdoms*); this is
 * the chapters *within* the current kingdom's life.
 *
 * Recorded from writeMonarchLegacy when a monarch leaves the throne (natural,
 * usurper, or uprising), so it covers every line of the story. Persisted with
 * the world save, so the book survives reloads and accumulates across sessions.
 */

import type { ReignSummary, LegacyContext } from "./MonarchLegacy";

/** One reign, frozen as a chapter of the kingdom's book. */
export interface ReignChapter {
  /** 1 = the founding reign. */
  chapter: number;
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
}

export interface ChronicleSnapshot {
  chapters: ReignChapter[];
}

/** Bound on save size. A 100-reign dynasty is astronomically long already. */
const MAX_CHAPTERS = 100;

const CONTEXTS: readonly LegacyContext[] = ["natural", "usurper", "uprising"];

export class Chronicle {
  private list: ReignChapter[] = [];

  /**
   * Record a completed reign as the next chapter. Chapter number is the
   * departed monarch's ordinal — `summary.generation` is already the *new*
   * monarch's number when this fires, so the chapter is one behind.
   */
  record(summary: ReignSummary, startYear: number, endYear: number): ReignChapter {
    const chapter: ReignChapter = {
      chapter: Math.max(1, summary.generation - 1),
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
    };
    this.list.push(chapter);
    if (this.list.length > MAX_CHAPTERS) {
      this.list = this.list.slice(this.list.length - MAX_CHAPTERS);
    }
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
    return { chapters: this.list.map((c) => ({ ...c })) };
  }

  hydrate(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const arr = (raw as { chapters?: unknown }).chapters;
    if (!Array.isArray(arr)) return;
    this.list = arr
      .map(coerceChapter)
      .filter((c): c is ReignChapter => c !== null)
      .slice(-MAX_CHAPTERS);
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
  };
}
