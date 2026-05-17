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

export function KingdomChronicle({
  open,
  onClose,
  getWorld,
}: {
  open: boolean;
  onClose: () => void;
  getWorld: () => World | null;
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

  if (!open) return null;

  const handleDownload = () => {
    if (!input || sections.length === 0) return;
    const md = chronicleToMarkdown(input, sections);
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
