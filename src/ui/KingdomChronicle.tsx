/**
 * Kingdom Chronicle panel — a modal that shows the auto-generated prose
 * history of the kingdom, organised by section. Also offers a "Download
 * as Markdown" button for the full text.
 *
 * Data is derived from live world + journal on every open, so it's always
 * current. No Pixi imports; reads only from Zustand and a World ref.
 */

import { useMemo } from "react";
import { useGameStore } from "../store/useGameStore";
import type { World } from "../sim/World";
import {
  generateChronicle,
  chronicleToMarkdown,
  type ChronicleInput,
} from "./chronicle-generator";
import type { ReignChapter } from "../sim/systems/Chronicle";

const ROMAN: ReadonlyArray<[number, string]> = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];
function roman(n: number): string {
  if (n < 1 || n > 3999) return String(n);
  let out = "";
  let v = n;
  for (const [value, sym] of ROMAN) {
    while (v >= value) { out += sym; v -= value; }
  }
  return out;
}

/** How each reign ended, as a one-word chip. */
const ENDING: Record<ReignChapter["context"], string> = {
  natural: "passed",
  usurper: "deposed",
  uprising: "cast down",
};

interface CurrentReign {
  chapter: number;
  name: string;
  startYear: number;
}

export function KingdomChronicle({
  open,
  onClose,
  getWorld,
  onShareReign,
}: {
  open: boolean;
  onClose: () => void;
  getWorld: () => World | null;
  /** Open the share card for a single past reign (chapter). */
  onShareReign?: (chapter: ReignChapter) => void;
}) {
  const journal = useGameStore((s) => s.journal);
  const identity = useGameStore((s) => s.identity);
  const worldStats = useGameStore((s) => s.worldStats);

  const { sections, input } = useMemo(() => {
    if (!open) return { sections: [], input: null };
    const world = getWorld();
    if (!world || !identity) return { sections: [], input: null };

    const inp: ChronicleInput = {
      kingdomName:         identity.kingdomName,
      monarchName:         identity.monarchName,
      kingdomMotto:        identity.kingdomMotto,
      foundedAtMs:         world.calendar.cfg.foundedAtMs,
      currentYear:         world.state.year,
      currentSeason:       world.state.season,
      currentDay:          world.state.day,
      population:          world.npcs.length,
      gold:                world.economy.state.gold,
      vaultCount:          world.treasury.count(),
      successionGeneration: world.succession.state.generation,
      dynastyStreak:       world.succession.state.dynastyStreak,
      reputationScore:     world.reputation.score,
      reputationDescriptor: world.reputation.descriptor(),
      factions:            world.factions.snapshot(),
      journal,
      totalUprisings:      world.uprising.state.totalUprisings,
      totalUsurperChallenges: world.usurper.state.totalChallenges,
      totalRepelled:       world.usurper.state.totalRepelled,
    };

    return { sections: generateChronicle(inp), input: inp };
  }, [open, identity, journal, worldStats.day, getWorld]);

  // The Book of Reigns — completed chapters + the in-progress one. Read live
  // from the world's Chronicle (persisted), so it survives reloads.
  const reigns = useMemo<{ past: ReignChapter[]; current: CurrentReign | null }>(() => {
    if (!open) return { past: [], current: null };
    const world = getWorld();
    if (!world || !identity) return { past: [], current: null };
    const reignDays = world.state.day - world.succession.state.reignStartDay;
    const startYear = Math.max(1, world.state.year - Math.max(0, Math.floor(reignDays / 56)));
    return {
      past: world.chronicle.chapters(),
      current: {
        chapter: world.succession.state.generation,
        name: identity.monarchName,
        startYear,
      },
    };
  }, [open, identity, worldStats.day, getWorld]);

  if (!open) return null;

  const handleDownload = () => {
    if (!input || sections.length === 0) return;
    const reignsMd = reigns.past.length > 0
      ? "## The Reigns\n\n" +
        reigns.past
          .map((c) =>
            `**Chapter ${roman(c.chapter)}: ${c.title}** — ${c.name}, ${c.epithet} (Years ${c.startYear}–${c.endYear})  \n` +
            `${c.headline} _${ENDING[c.context]}; ${c.reputation}; ${c.population} souls._`,
          )
          .join("\n\n") +
        "\n\n"
      : "";
    const md = reignsMd + chronicleToMarkdown(input, sections);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (input.kingdomName ?? "kingdom").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 24);
    a.href = url;
    a.download = `${safeName}-chronicle.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <div className="chronicle-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="chronicle-panel" role="complementary" aria-label="Kingdom Chronicle">
        <div className="chronicle-header">
          <div className="chronicle-header-left">
            <span className="chronicle-title">Chronicle of {identity?.kingdomName ?? "the Kingdom"}</span>
            {identity?.kingdomMotto && (
              <span className="chronicle-motto">"{identity.kingdomMotto}"</span>
            )}
          </div>
          <div className="chronicle-header-right">
            <button
              className="chronicle-dl-btn"
              onClick={handleDownload}
              title="Download as Markdown"
              aria-label="Download chronicle as Markdown"
            >
              ⇩ .md
            </button>
            <button
              className="chronicle-close"
              onClick={onClose}
              aria-label="Close chronicle"
            >
              ×
            </button>
          </div>
        </div>

        <div className="chronicle-body">
          {(reigns.past.length > 0 || reigns.current) && (
            <section className="chronicle-reigns">
              <h3 className="chronicle-section-title">The Reigns</h3>
              <ol className="reign-chapters">
                {reigns.past.map((c) => (
                  <li key={`ch-${c.chapter}-${c.endYear}`} className="reign-chapter-card">
                    <div className="reign-chapter-head">
                      <span className="reign-chapter-no">
                        Chapter {roman(c.chapter)} · <span className="reign-chapter-title">{c.title}</span>
                      </span>
                      <span className="reign-chapter-years">Years {c.startYear}–{c.endYear}</span>
                    </div>
                    <div className="reign-chapter-name">
                      {c.name}, <em>{c.epithet}</em>
                    </div>
                    {c.headline && <p className="reign-chapter-line">{c.headline}</p>}
                    {c.highlights.length > 0 && (
                      <ul className="reign-chapter-beats">
                        {c.highlights.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    )}
                    <div className="reign-chapter-chips">
                      <span className="reign-chip">{ENDING[c.context]}</span>
                      <span className="reign-chip">{c.reputation}</span>
                      <span className="reign-chip">{c.population} souls</span>
                    </div>
                    {onShareReign && (
                      <button
                        type="button"
                        className="reign-chapter-share"
                        onClick={() => onShareReign(c)}
                      >
                        Share this reign →
                      </button>
                    )}
                  </li>
                ))}
                {reigns.current && (
                  <li className="reign-chapter-card current">
                    <div className="reign-chapter-head">
                      <span className="reign-chapter-no">
                        Chapter {roman(reigns.current.chapter)} · <span className="reign-chapter-title">the present age</span>
                      </span>
                      <span className="reign-chapter-years">Year {reigns.current.startYear} – present</span>
                    </div>
                    <div className="reign-chapter-name">{reigns.current.name}</div>
                    <p className="reign-chapter-line">Still reigning. This page is not yet written.</p>
                  </li>
                )}
              </ol>
            </section>
          )}
          {sections.length === 0 ? (
            <p className="chronicle-empty">
              The kingdom is too young for a chronicle. Return after more time has passed.
            </p>
          ) : (
            sections.map((s, i) => (
              <section key={i} className="chronicle-section">
                <h3 className="chronicle-section-title">{s.title}</h3>
                <p className="chronicle-section-body">{s.body}</p>
              </section>
            ))
          )}
        </div>

        <div className="chronicle-footer">
          <small>
            Day {worldStats.day} · {worldStats.season.charAt(0).toUpperCase() + worldStats.season.slice(1)} · Year {worldStats.year}
          </small>
        </div>
      </aside>
    </>
  );
}
