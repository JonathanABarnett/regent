/**
 * Kingdom Vault — a compact, read-only archive of past kingdoms.
 *
 * Founding a new kingdom currently wipes the active save. That's fine for the
 * sim (a single tickable world) but it means a player who spent two weeks on
 * a kingdom loses everything except their memories when they start fresh.
 * The archive preserves a *summary* of each finished kingdom in its own
 * localStorage slot — small enough that 20 kingdoms cost ~50 KB total.
 *
 * What we keep:
 *   - identity: kingdom name + last reigning monarch
 *   - dates: founding ms, total days lived, year count, generations
 *   - census at archive time: population, vault size, gold
 *   - the last ~12 milestone-kind journal entries (the chronicle's "best of")
 *
 * What we deliberately drop:
 *   - the NPC roster (too big, not meaningful out of context)
 *   - the procgen map (regenerable from seed if ever needed)
 *   - economy state numbers other than gold (too transient to remember)
 *
 * The vault is append-only from the UI's perspective. Players can browse
 * past kingdoms from the title screen but can't resume them — they're
 * read-only artifacts.
 */

import type { SavedJournalEntry, SaveData } from "./Persistence";

export const ARCHIVE_STORAGE_KEY = "kingdomos.kingdoms.v1";
export const ARCHIVE_MAX_ENTRIES = 20;
const ARCHIVE_MILESTONES_PER_ENTRY = 12;

export interface ArchivedKingdom {
  /** ISO timestamp this kingdom was archived (i.e. the player founded a new one). */
  archivedAt: string;
  /** Kingdom name at the moment of archival. */
  kingdomName: string;
  /** Last reigning monarch's name. */
  monarchName: string;
  /** Real-world ms when the kingdom was first founded. */
  foundedAtMs: number;
  /** In-world days lived. */
  totalDays: number;
  /** In-world years reached. */
  yearsReigned: number;
  /** Generations of monarchs that ruled. */
  generations: number;
  /** Final NPC headcount. */
  population: number;
  /** Final vault artifact count. */
  vault: number;
  /** Final gold reserve. */
  gold: number;
  /** The last ~12 milestone journal entries — the "highlight reel". */
  milestones: Array<{ day: number; year: number; text: string }>;
}

/**
 * Build an `ArchivedKingdom` from the live save data we'd be about to discard.
 * Pure — does no I/O. Callers handle persistence.
 */
export function summarize(save: SaveData): ArchivedKingdom {
  const milestones: Array<{ day: number; year: number; text: string }> = [];
  if (save.journal) {
    // Take the latest milestone entries, keeping them in chronological order.
    const latestFirst = [...save.journal]
      .filter((e) => e.kind === "milestone")
      .reverse()
      .slice(0, ARCHIVE_MILESTONES_PER_ENTRY)
      .reverse();
    for (const e of latestFirst) {
      milestones.push({ day: e.day, year: e.year, text: e.text });
    }
  }
  // Estimate totalDays from the latest journal entry (or 1 if empty).
  const lastEntry = save.journal && save.journal.length > 0
    ? save.journal[save.journal.length - 1]
    : null;
  const totalDays = lastEntry ? lastEntry.day : 1;
  const yearsReigned = lastEntry ? lastEntry.year : 1;
  return {
    archivedAt: new Date().toISOString(),
    kingdomName: (save.kingdomName ?? "the unnamed kingdom").trim(),
    monarchName: (save.monarchName ?? "an unrecorded monarch").trim(),
    foundedAtMs: save.foundedAtMs,
    totalDays,
    yearsReigned,
    generations: save.succession?.generation ?? 1,
    population: save.npcs.length,
    vault: save.artifacts?.length ?? 0,
    gold: 0, // gold isn't on SaveData top-level, but we can derive from economy state if needed
    milestones,
  };
}

/**
 * Read the archive from localStorage. Returns [] if anything is malformed.
 * Defensive: caps total entries, drops malformed individuals, sanitizes text.
 */
export function readArchive(): ArchivedKingdom[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return validateArchive(parsed);
  } catch (err) {
    console.warn("[KingdomArchive] readArchive failed", err);
    return [];
  }
}

/**
 * Append a kingdom summary and write back to localStorage. Newest first.
 * Bounded at ARCHIVE_MAX_ENTRIES; the oldest entry falls off if we exceed it.
 */
export function appendToArchive(entry: ArchivedKingdom): ArchivedKingdom[] {
  const existing = readArchive();
  const next = [entry, ...existing].slice(0, ARCHIVE_MAX_ENTRIES);
  try {
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn("[KingdomArchive] appendToArchive write failed", err);
  }
  return next;
}

/** Clear all archived kingdoms. UI calls this only with explicit confirmation. */
export function clearArchive(): void {
  try {
    localStorage.removeItem(ARCHIVE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// ── Validation ─────────────────────────────────────────────────────────────

function validateArchive(raw: unknown): ArchivedKingdom[] {
  if (!Array.isArray(raw)) return [];
  const out: ArchivedKingdom[] = [];
  for (const item of raw.slice(0, ARCHIVE_MAX_ENTRIES)) {
    const validated = validateEntry(item);
    if (validated) out.push(validated);
  }
  return out;
}

function validateEntry(raw: unknown): ArchivedKingdom | null {
  if (!isPlainObject(raw)) return null;
  const kingdomName = clip(raw.kingdomName, 32);
  const monarchName = clip(raw.monarchName, 32);
  if (!kingdomName || !monarchName) return null;
  const foundedAtMs = num(raw.foundedAtMs, 0);
  if (foundedAtMs <= 0) return null;
  const milestones: Array<{ day: number; year: number; text: string }> = [];
  if (Array.isArray(raw.milestones)) {
    for (const m of raw.milestones.slice(0, ARCHIVE_MILESTONES_PER_ENTRY)) {
      if (!isPlainObject(m)) continue;
      const text = clip(m.text, 240);
      if (!text) continue;
      milestones.push({
        day: int(m.day, 1, 100_000),
        year: int(m.year, 1, 10_000),
        text,
      });
    }
  }
  return {
    archivedAt: clip(raw.archivedAt, 40) || new Date().toISOString(),
    kingdomName,
    monarchName,
    foundedAtMs,
    totalDays: int(raw.totalDays, 0, 100_000),
    yearsReigned: int(raw.yearsReigned, 0, 10_000),
    generations: int(raw.generations, 0, 1_000),
    population: int(raw.population, 0, 10_000),
    vault: int(raw.vault, 0, 1_000),
    gold: int(raw.gold, 0, 999_999),
    milestones,
  };
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function clip(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // Drop control characters and bidi-override exploits the same way Persistence does.
  const CTL_END = 0x1f;
  const out: string[] = [];
  for (const ch of v) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= CTL_END) continue;
    if (code === 0x202a || code === 0x202b || code === 0x202d || code === 0x202e) continue;
    if (code === 0x2066 || code === 0x2067 || code === 0x2068 || code === 0x2069) continue;
    out.push(ch);
  }
  return out.join("").slice(0, max).trim();
}

function num(v: unknown, def: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return def;
  return v;
}

function int(v: unknown, min: number, max: number): number {
  const n = num(v, min);
  return Math.max(min, Math.min(max, Math.floor(n)));
}
