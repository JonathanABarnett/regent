import { useGameStore } from "../store/useGameStore";
import { AWAY_SIM_CAP_DAYS } from "../sim/Persistence";

/**
 * The Steward's Report — the "while you were away" reward moment.
 *
 * Shown once on load when at least one full in-world day passed during
 * the player's absence. runAwayProgression has already replayed the
 * missed days (births, deaths, caravans, consequences, gold), so this
 * modal presents the OUTCOME: deltas, headlines, and whatever decision
 * is now waiting. The idle-genre insight is that a returning player
 * should open a reward list, not a to-do list — this is that list.
 *
 * The sim stays paused while the report is up (App's speedMultiplier
 * checks stewardReport) so the player reads it over a still kingdom.
 */
export function StewardReport() {
  const report = useGameStore((s) => s.stewardReport);
  const setStewardReport = useGameStore((s) => s.setStewardReport);
  const identity = useGameStore((s) => s.identity);
  if (!report) return null;

  const hours = Math.floor(report.awayMs / 3_600_000);
  const realDays = Math.floor(hours / 24);
  const awayPhrase =
    hours < 1 ? "less than an hour" :
    hours < 2 ? "an hour" :
    hours < 24 ? `${hours} hours` :
    `${realDays} day${realDays === 1 ? "" : "s"}`;

  const popDelta = report.population.after - report.population.before;
  const goldDelta = report.gold.after - report.gold.before;
  const delta = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  return (
    <div className="steward-overlay">
      <div className="steward-card" role="dialog" aria-labelledby="steward-title">
        <div className="steward-crest" aria-hidden="true">📜</div>
        <h3 id="steward-title">The Steward&apos;s Report</h3>
        <p className="steward-lede">
          You were away {awayPhrase} — {report.daysMissed} day
          {report.daysMissed === 1 ? "" : "s"} passed in{" "}
          {identity?.kingdomName ?? "the kingdom"}.
          {report.daysMissed > report.daysSimulated &&
            ` The steward summarized the last ${AWAY_SIM_CAP_DAYS}.`}
        </p>

        <div className="steward-stats">
          <div className="steward-stat">
            <span className="steward-stat-label">Souls</span>
            <span className="steward-stat-value">
              {report.population.after}
              {popDelta !== 0 && (
                <em className={popDelta > 0 ? "up" : "down"}> {delta(popDelta)}</em>
              )}
            </span>
          </div>
          <div className="steward-stat">
            <span className="steward-stat-label">Treasury</span>
            <span className="steward-stat-value">
              {report.gold.after}g
              {goldDelta !== 0 && (
                <em className={goldDelta > 0 ? "up" : "down"}> {delta(goldDelta)}</em>
              )}
            </span>
          </div>
        </div>

        {report.headlines.length > 0 && (
          <ul className="steward-headlines">
            {report.headlines.map((h) => (
              <li key={h.id} className={`kind-${h.kind}`}>
                <span className="steward-day">Day {h.day}</span>
                <span className="steward-text">{h.text}</span>
              </li>
            ))}
          </ul>
        )}
        {report.headlines.length === 0 && (
          <p className="steward-quiet">
            Quiet days. The fields turned, the forge ran, nothing demanded a crown.
          </p>
        )}

        {report.pendingMatters.length > 0 && (
          <div className="steward-pending">
            <div className="steward-pending-head">
              ⚜ {report.pendingMatters.length === 1
                ? "A matter awaits your judgment"
                : `${report.pendingMatters.length} matters await your judgment`}
            </div>
            <ul className="steward-pending-list">
              {report.pendingMatters.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          className="primary steward-begin"
          onClick={() => setStewardReport(null)}
        >
          {report.pendingMatters.length > 0 ? "Hold court" : "Begin the day"}
        </button>
      </div>
    </div>
  );
}
