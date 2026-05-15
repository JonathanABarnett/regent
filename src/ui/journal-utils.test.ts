import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTER,
  exportMarkdown,
  filterEntries,
  type JournalFilter,
} from "./journal-utils";
import type { SavedJournalEntry } from "../sim/Persistence";

function entry(
  overrides: Partial<SavedJournalEntry> & Pick<SavedJournalEntry, "id" | "text">,
): SavedJournalEntry {
  return {
    day: 1,
    year: 1,
    season: "spring",
    kind: "event",
    ...overrides,
  };
}

const SAMPLE: SavedJournalEntry[] = [
  entry({ id: "1", text: "Berta and Olen were wed.", kind: "life", day: 5 }),
  entry({ id: "2", text: "A storm rolled in from the east.", kind: "weather", day: 5 }),
  entry({ id: "3", text: "A courier rode from rivermouth to highkeep.", kind: "event", day: 6 }),
  entry({ id: "4", text: "The kingdom of Aurelia was founded.", kind: "milestone", day: 1 }),
  entry({ id: "5", text: "Day 7 dawns; spring continues.", kind: "system", day: 7 }),
];

describe("journal-utils.filterEntries", () => {
  it("returns all entries with the default filter", () => {
    expect(filterEntries(SAMPLE, DEFAULT_FILTER).length).toBe(SAMPLE.length);
  });

  it("hides entries whose kind is toggled off", () => {
    const f: JournalFilter = {
      ...DEFAULT_FILTER,
      kinds: { ...DEFAULT_FILTER.kinds, weather: false, system: false },
    };
    const out = filterEntries(SAMPLE, f);
    expect(out.every((e) => e.kind !== "weather" && e.kind !== "system")).toBe(true);
    expect(out.length).toBe(3);
  });

  it("substring-matches search case-insensitively", () => {
    const out = filterEntries(SAMPLE, { ...DEFAULT_FILTER, search: "STORM" });
    expect(out.length).toBe(1);
    expect(out[0].id).toBe("2");
  });

  it("ignores leading/trailing whitespace in search", () => {
    const out = filterEntries(SAMPLE, { ...DEFAULT_FILTER, search: "   wed  " });
    expect(out.length).toBe(1);
    expect(out[0].id).toBe("1");
  });

  it("combines kind filter AND search filter", () => {
    const f: JournalFilter = {
      kinds: { ...DEFAULT_FILTER.kinds, weather: false },
      search: "the",
    };
    const out = filterEntries(SAMPLE, f);
    // Excludes the weather entry even if it would match the search
    expect(out.every((e) => e.kind !== "weather")).toBe(true);
    expect(out.every((e) => e.text.toLowerCase().includes("the"))).toBe(true);
  });

  it("returns an empty array when nothing matches", () => {
    const out = filterEntries(SAMPLE, { ...DEFAULT_FILTER, search: "zzz nothing zzz" });
    expect(out).toEqual([]);
  });
});

describe("journal-utils.exportMarkdown", () => {
  it("renders an empty chronicle when given no entries", () => {
    const md = exportMarkdown([], { kingdomName: "Aurelia", monarchName: "Elara" });
    expect(md).toContain("# Chronicle of Aurelia");
    expect(md).toContain("Elara");
    expect(md).toContain("_The chronicle is empty._");
  });

  it("groups entries by day in chronological (oldest-first) order", () => {
    const md = exportMarkdown(SAMPLE, { kingdomName: "Aurelia", monarchName: "Elara" });
    // Day 1 should appear before Day 5, 6, 7
    const d1 = md.indexOf("Day 1");
    const d5 = md.indexOf("Day 5");
    const d6 = md.indexOf("Day 6");
    const d7 = md.indexOf("Day 7");
    expect(d1).toBeGreaterThan(0);
    expect(d1).toBeLessThan(d5);
    expect(d5).toBeLessThan(d6);
    expect(d6).toBeLessThan(d7);
  });

  it("uses fallback names when identity is missing", () => {
    const md = exportMarkdown(SAMPLE.slice(0, 1));
    expect(md).toContain("# Chronicle of the Kingdom");
    expect(md).toContain("the Monarch");
  });

  it("escapes markdown special characters in entry text", () => {
    const evil = [
      entry({ id: "x", text: "He said *fork* it and pushed [origin/main]." }),
    ];
    const md = exportMarkdown(evil);
    // The literal asterisks/brackets must not survive as raw markdown
    expect(md).not.toContain("*fork*");
    expect(md).toContain("\\*fork\\*");
    expect(md).toContain("\\[origin/main\\]");
  });

  it("includes one bullet per entry under each day header", () => {
    const md = exportMarkdown(SAMPLE);
    // 5 sample entries → 5 bullets total
    const bullets = md.split("\n").filter((line) => line.startsWith("- "));
    expect(bullets.length).toBe(5);
  });
});
