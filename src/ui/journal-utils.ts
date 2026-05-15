import type { SavedJournalEntry } from "../sim/Persistence";

export type JournalKind = SavedJournalEntry["kind"];

export interface JournalFilter {
  /** When false, entries of that kind are hidden. Default: all true. */
  kinds: Record<JournalKind, boolean>;
  /** Case-insensitive substring match against entry.text. Empty string = no filter. */
  search: string;
}

export const DEFAULT_FILTER: JournalFilter = {
  kinds: {
    life: true,
    weather: true,
    event: true,
    milestone: true,
    system: true,
  },
  search: "",
};

export function filterEntries(
  entries: SavedJournalEntry[],
  filter: JournalFilter,
): SavedJournalEntry[] {
  const q = filter.search.trim().toLowerCase();
  return entries.filter((e) => {
    if (!filter.kinds[e.kind]) return false;
    if (q && !e.text.toLowerCase().includes(q)) return false;
    return true;
  });
}

/**
 * Render the journal as a portable markdown document. Used for the "export"
 * button — players can save / share the chronicle as a flat file. Days are
 * H3 headers, entries are bullets prefixed by an emoji.
 *
 * The kingdom + monarch names are taken from `identity` so the document reads
 * as "Aurelia — Year 2, Day 47" rather than just "Year 2, Day 47".
 */
export function exportMarkdown(
  entries: SavedJournalEntry[],
  identity?: { kingdomName?: string; monarchName?: string },
): string {
  const kingdom = identity?.kingdomName?.trim() || "the Kingdom";
  const monarch = identity?.monarchName?.trim() || "the Monarch";
  const lines: string[] = [];
  lines.push(`# Chronicle of ${kingdom}`);
  lines.push("");
  lines.push(`*Recorded under the reign of ${monarch}.*`);
  lines.push("");
  if (!entries.length) {
    lines.push("_The chronicle is empty._");
    return lines.join("\n");
  }

  // Group oldest-first for narrative reading, even though the panel shows
  // newest-first. A markdown file you'd actually read should run forward in time.
  const sorted = [...entries].sort((a, b) =>
    a.year === b.year ? a.day - b.day : a.year - b.year,
  );
  let lastKey = "";
  for (const e of sorted) {
    const key = `${e.year}-${e.day}`;
    if (key !== lastKey) {
      lines.push("");
      lines.push(`### Year ${e.year}, Day ${e.day} — ${e.season}`);
      lastKey = key;
    }
    lines.push(`- ${kindEmoji(e.kind)} ${escapeMd(e.text)}`);
  }
  return lines.join("\n");
}

function kindEmoji(kind: JournalKind): string {
  switch (kind) {
    case "milestone": return "✦";
    case "life": return "❤";
    case "weather": return "☁";
    case "event": return "✎";
    case "system": return "·";
    default: return "·";
  }
}

/** Defang markdown special chars in user-controlled text. */
function escapeMd(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/[*_`[\]()<>#]/g, (m) => `\\${m}`);
}

/**
 * Browser-side download trigger. No-op on server / non-DOM environments.
 * Filename: `<kingdom>-chronicle-YYYY-MM-DD.md`.
 */
export function downloadMarkdown(
  markdown: string,
  kingdomName: string | undefined,
): void {
  if (typeof document === "undefined") return;
  const safe = (kingdomName ?? "kingdom").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 24) || "kingdom";
  const dateStr = new Date().toISOString().slice(0, 10);
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}-chronicle-${dateStr}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
