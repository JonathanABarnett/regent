import { useMemo, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import type { SavedJournalEntry } from "../sim/Persistence";
import {
  DEFAULT_FILTER,
  type JournalFilter,
  type JournalKind,
  downloadMarkdown,
  exportMarkdown,
  filterEntries,
} from "./journal-utils";

const kindIcon: Record<SavedJournalEntry["kind"], string> = {
  life: "❤",
  weather: "☁",
  event: "✎",
  milestone: "✦",
  system: "·",
};

const seasonIcon: Record<string, string> = {
  spring: "🌱",
  summer: "🌻",
  autumn: "🍂",
  winter: "❄",
};

const KIND_ORDER: JournalKind[] = ["milestone", "life", "event", "weather", "system"];
const KIND_LABEL: Record<JournalKind, string> = {
  milestone: "milestones",
  life: "life",
  event: "events",
  weather: "weather",
  system: "system",
};

/**
 * The kingdom journal — a chronological narrative panel.
 *
 * This is the artifact a user screenshots and shares. Days are grouped,
 * entries are tagged by kind, the latest day stays anchored at the top, and
 * the player can filter / search / export the whole chronicle as markdown.
 *
 * `onNavigateToStructure`: if provided, entries with a `targetStructureId`
 * render a pin button that calls this callback. App.tsx wires it to the
 * camera's snapTo so the player can jump from "Berta and Olen were wed at
 * Highkeep" to actually looking at Highkeep.
 */
export function JournalPanel({
  open,
  onClose,
  onNavigateToStructure,
}: {
  open: boolean;
  onClose: () => void;
  onNavigateToStructure?: (structureId: string) => void;
}) {
  const journal = useGameStore((s) => s.journal);
  const clearJournal = useGameStore((s) => s.clearJournal);
  const settings = useGameStore((s) => s.settings);
  const identity = useGameStore((s) => s.identity);

  const [filter, setFilter] = useState<JournalFilter>(DEFAULT_FILTER);

  const filtered = useMemo(() => filterEntries(journal, filter), [journal, filter]);
  const grouped = useMemo(() => groupByDay(filtered), [filtered]);
  const totalShown = filtered.length;

  if (!open) return null;
  return (
    <aside
      className="journal-panel"
      role="complementary"
      aria-label="Kingdom journal"
    >
      <div className="journal-header">
        <span id="journal-title">Kingdom Journal</span>
        <div>
          <button
            onClick={() =>
              downloadMarkdown(
                exportMarkdown(journal, identity ?? undefined),
                identity?.kingdomName,
              )
            }
            title="Download chronicle as markdown"
            aria-label="Download chronicle as markdown"
          >
            ⇩
          </button>
          <button
            onClick={() => {
              if (confirm("Erase the entire journal? (the kingdom itself is unaffected)")) {
                clearJournal();
              }
            }}
            title="Clear"
            aria-label="Clear journal"
          >
            ⌫
          </button>
          <button onClick={onClose} title="Close" aria-label="Close journal">
            ×
          </button>
        </div>
      </div>
      <div className="journal-controls">
        <input
          type="search"
          className="journal-search"
          placeholder="search the chronicle…"
          aria-label="Search journal entries"
          value={filter.search}
          onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
        />
        <div className="journal-kind-toggles">
          {KIND_ORDER.map((k) => (
            <button
              key={k}
              className={"kind-toggle kind-" + k + (filter.kinds[k] ? " on" : " off")}
              onClick={() =>
                setFilter((f) => ({
                  ...f,
                  kinds: { ...f.kinds, [k]: !f.kinds[k] },
                }))
              }
              title={`Show/hide ${KIND_LABEL[k]}`}
            >
              {kindIcon[k]} {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <div className="journal-body">
        {grouped.length === 0 ? (
          <p className="journal-empty">
            {journal.length === 0
              ? "The chronicle is empty. As your kingdom lives, scribes will record what they see."
              : "Nothing matches the current filter."}
          </p>
        ) : (
          grouped.map((group) => (
            <section key={`${group.year}-${group.day}`} className="journal-day">
              <h3>
                <span className="day-num">Day {group.day}</span>
                <span className="day-sub">
                  {seasonIcon[group.season] ?? ""} {group.season} · Y{group.year}
                </span>
              </h3>
              <ul>
                {group.entries.map((e) => (
                  <li key={e.id} className={`entry kind-${e.kind}`}>
                    <span className="entry-icon" aria-hidden="true">{kindIcon[e.kind]}</span>
                    <span className="entry-text">{e.text}</span>
                    {e.targetStructureId && onNavigateToStructure && (
                      <button
                        type="button"
                        className="entry-pin"
                        title={`Snap the camera to where this happened (${e.targetStructureId})`}
                        aria-label={`Go to ${e.targetStructureId}`}
                        onClick={() => onNavigateToStructure(e.targetStructureId!)}
                      >
                        go to
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
      <footer className="journal-footer">
        <small>
          {totalShown === journal.length
            ? `${journal.length} entries`
            : `${totalShown} of ${journal.length} entries shown`}
          {" · "}
          {settings.followRealSeasons ? "season follows real calendar" : "in-world calendar"}
        </small>
      </footer>
    </aside>
  );
}

interface JournalGroup {
  day: number;
  year: number;
  season: string;
  entries: SavedJournalEntry[];
}

function groupByDay(entries: SavedJournalEntry[]): JournalGroup[] {
  const map = new Map<string, JournalGroup>();
  for (const e of entries) {
    const k = `${e.year}-${e.day}`;
    let g = map.get(k);
    if (!g) {
      g = { day: e.day, year: e.year, season: e.season, entries: [] };
      map.set(k, g);
    }
    g.entries.push(e);
  }
  // newest day first
  return Array.from(map.values()).sort((a, b) =>
    b.year === a.year ? b.day - a.day : b.year - a.year,
  );
}
