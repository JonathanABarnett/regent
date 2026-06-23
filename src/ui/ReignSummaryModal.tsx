import { useGameStore } from "../store/useGameStore";
import type { LegacyContext } from "../sim/systems/MonarchLegacy";

/**
 * The Reign Summary capstone — fires the moment a monarch leaves the throne
 * (natural passing, usurper, or uprising). The rich legacy prose still lands
 * in the journal + vault; this is the *moment* that prose was being denied:
 * a centered card that names the reign, gives it an earned epithet, and tallies
 * what it leaves behind. The payoff of the permadeath-memory loop.
 *
 * The sim pauses while it's up (App's speedMultiplier checks reignSummary), so
 * the player reads the legacy over a still kingdom — same as the Steward's Report.
 */

const EYEBROW: Record<LegacyContext, string> = {
  natural: "A reign has ended",
  usurper: "The throne is taken",
  uprising: "The people have spoken",
};

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export function ReignSummaryModal() {
  const summary = useGameStore((s) => s.reignSummary);
  const setReignSummary = useGameStore((s) => s.setReignSummary);
  const identity = useGameStore((s) => s.identity);
  if (!summary) return null;

  const newMonarch = identity?.monarchName;
  const footer =
    summary.context === "usurper"
      ? `${newMonarch ?? "A claimant"} holds the crown now — by will, not by blood.`
      : summary.context === "uprising"
        ? `${newMonarch ?? "One of the people"} rises from common stock to the throne.`
        : `The crown passes to ${newMonarch ?? "the heir"}. Long may they reign.`;

  return (
    <div className="reign-overlay">
      <div className="reign-card" role="dialog" aria-labelledby="reign-title" aria-modal="true">
        <div className="reign-eyebrow">{EYEBROW[summary.context]}</div>
        <div className="reign-crest" aria-hidden="true">👑</div>
        <h3 id="reign-title" className="reign-title">
          {summary.name},<br />
          <span className="reign-epithet">{summary.epithet}</span>
        </h3>
        <p className="reign-sub">
          the {ordinal(summary.generation - 1)} to wear the crown · reigned {summary.seasons}
        </p>

        <p className="reign-headline">{summary.headline}</p>

        <div className="reign-stats">
          <div className="reign-stat">
            <span className="reign-stat-value">{summary.population}</span>
            <span className="reign-stat-label">souls at the end</span>
          </div>
          <div className="reign-stat">
            <span className="reign-stat-value reign-stat-rep">{summary.reputation}</span>
            <span className="reign-stat-label">how they were held</span>
          </div>
          <div className="reign-stat">
            <span className="reign-stat-value">{summary.vaultSize}</span>
            <span className="reign-stat-label">relics in the vault</span>
          </div>
          {summary.dynastyStreak >= 2 && (
            <div className="reign-stat">
              <span className="reign-stat-value">{summary.dynastyStreak}</span>
              <span className="reign-stat-label">unbroken in the line</span>
            </div>
          )}
        </div>

        <p className="reign-footer">{footer}</p>

        <button
          type="button"
          className="primary reign-begin"
          onClick={() => setReignSummary(null)}
          autoFocus
        >
          Long may the next reign begin
        </button>
      </div>
    </div>
  );
}
