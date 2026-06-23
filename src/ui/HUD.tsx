import { useGameStore } from "../store/useGameStore";
import { upcomingHoliday } from "../sim/systems/InWorldHolidays";

const weatherIcon: Record<string, string> = {
  clear: "☀",
  cloudy: "☁",
  rain: "☂",
  storm: "⚡",
  snow: "❄",
};

const seasonIcon: Record<string, string> = {
  spring: "🌱",
  summer: "🌻",
  autumn: "🍂",
  winter: "❄",
};

export function HUD({
  onToggleLog,
  onToggleSettings,
  onToggleJournal,
  onToggleStats,
  onToggleFamilyTree,
  onToggleDiplomacy,
  onToggleCutaway,
  onTakePhoto,
  onToggleAmbient,
  ambientActive,
  onToggleChronicle,
  onSelectAdvisor,
  onOpenRule,
  cutawayActive,
}: {
  onToggleLog: () => void;
  onToggleSettings: () => void;
  onToggleJournal: () => void;
  onToggleStats: () => void;
  onToggleFamilyTree?: () => void;
  onToggleDiplomacy?: () => void;
  onToggleCutaway?: () => void;
  onTakePhoto?: () => void;
  /** Float the kingdom in an always-on-top PiP window. Absent = unsupported browser. */
  onToggleAmbient?: () => void;
  ambientActive?: boolean;
  onToggleChronicle?: () => void;
  /** Click handler for the advisor chip — typically opens the NPC profile
   *  modal (App.tsx wires this to setProfileNpcId). */
  onSelectAdvisor?: (npcId: string) => void;
  /** Opens the Royal Actions ("Rule") panel — the proactive-verb surface. */
  onOpenRule?: () => void;
  cutawayActive?: boolean;
}) {
  const stats = useGameStore((s) => s.worldStats);
  const identity = useGameStore((s) => s.identity);
  const pendingDecisions = useGameStore((s) => s.pendingDecisions);
  const eventCount = useGameStore((s) => s.events.length);
  const journalCount = useGameStore((s) => s.journal.length);
  const seen = useGameStore((s) => s.seen);
  const hourLabel = formatHour(stats.hour);
  const tod = partOfDay(stats.hour);
  const unseenJournal = Math.max(0, journalCount - seen.journal);
  const unseenEvents = Math.max(0, eventCount - seen.events);
  const greeting = greetingFor(stats.hour, identity?.monarchName ?? "monarch");
  // Daily check-in hook: surface a holiday when it's today or tomorrow.
  const holiday = upcomingHoliday(stats.day);
  return (
    <header className="hud">
      <div className="hud-left">
        <span className="badge" title={greeting}>{identity?.kingdomName ?? "KingdomOS"}</span>
        {pendingDecisions > 0 && (
          <button
            type="button"
            className="hud-court"
            title={`${pendingDecisions} matter${pendingDecisions === 1 ? "" : "s"} await your judgment — click to attend the court`}
            aria-label={`${pendingDecisions} decisions awaiting`}
            onClick={flashCourt}
          >
            ⚖ {pendingDecisions} awaiting
          </button>
        )}
        {stats.advisor && (
          <button
            type="button"
            className="hud-advisor"
            onClick={() => onSelectAdvisor?.(stats.advisor!.id)}
            title={`${stats.advisor.name} — your closest advisor (${stats.advisor.role}${stats.advisor.trait ? ", " + stats.advisor.trait : ""}). Click to learn about them.`}
            aria-label={`Open advisor profile: ${stats.advisor.name}`}
          >
            <span className="hud-advisor-icon" aria-hidden="true">◍</span>
            <span className="hud-advisor-name">{stats.advisor.name}</span>
          </button>
        )}
        {stats.goal && (
          <span
            className="hud-goal"
            title={`${stats.goal.title} — ${stats.goal.description} · ${Math.round(stats.goal.progress * 100)}%`}
          >
            <span className="hud-goal-arrow" aria-hidden="true">→</span>
            <span className="hud-goal-text">{stats.goal.description}</span>
            <span className="hud-goal-progress">
              <span
                className="hud-goal-progress-fill"
                style={{ width: `${Math.round(stats.goal.progress * 100)}%` }}
              />
            </span>
          </span>
        )}
        <span className="day">{stats.dayOfWeek ? `${stats.dayOfWeek} ·` : ""} Day {stats.day} · Y{stats.year}</span>
        {holiday && (
          <span
            className="hud-holiday"
            title={
              holiday.today
                ? `${holiday.label} — the kingdom celebrates today!`
                : `${holiday.label} is tomorrow — the kingdom is preparing.`
            }
          >
            🎉 {holiday.today ? "Today" : "Tomorrow"}: {holiday.label}
          </span>
        )}
        <span className="season">{seasonIcon[stats.season] ?? "·"} {stats.season}</span>
        <span className="clock" title={`${tod.label} · in-world time ${hourLabel}`}>
          <span aria-hidden="true">{tod.glyph}</span> {hourLabel} <span className="clock-tod">{tod.label}</span>
        </span>
        <span className="weather">{weatherIcon[stats.weather] ?? "·"} {stats.weather}</span>
        <span className="npcs">☖ {stats.npcCount}</span>
        <span className="factions" title={`Merchants ${factionLabel(stats.factions.merchants)} · Scholars ${factionLabel(stats.factions.scholars)} · Guard ${factionLabel(stats.factions.guard)}`}>
          <span className={`faction-dot faction-m ${factionClass(stats.factions.merchants)}`} title={`Merchants: ${factionLabel(stats.factions.merchants)}`}>⚖</span>
          <span className={`faction-dot faction-s ${factionClass(stats.factions.scholars)}`} title={`Scholars: ${factionLabel(stats.factions.scholars)}`}>📖</span>
          <span className={`faction-dot faction-g ${factionClass(stats.factions.guard)}`} title={`Guard: ${factionLabel(stats.factions.guard)}`}>🛡</span>
        </span>
      </div>
      {stats.quoteOfDay && (
        <div className="hud-quote" title="A trait-flavored quote from the kingdom today">
          {stats.quoteOfDay}
        </div>
      )}
      {stats.moodLabel && (
        <div className={`hud-mood mood-${stats.moodTier ?? "content"}`} title="Kingdom mood">
          {stats.moodLabel}
        </div>
      )}
      <div className="hud-right">
        {onOpenRule && (
          <button
            onClick={onOpenRule}
            className="hud-rule-btn"
            title="Rule the kingdom — hold festivals, proclaim edicts, commission buildings, issue decrees"
          >
            ⚜ Rule
          </button>
        )}
        {onTakePhoto && (
          <button
            onClick={onTakePhoto}
            className="hud-icon-btn"
            title="Take a framed screenshot of the kingdom (P)"
            aria-label="Take a photo"
          >📷</button>
        )}
        {onToggleCutaway && (
          <button
            onClick={onToggleCutaway}
            className={`hud-icon-btn${cutawayActive ? " active" : ""}`}
            title={cutawayActive ? "Hide roofs — see NPCs inside (X)" : "See inside the buildings (X)"}
            aria-label="Toggle cutaway view"
          >🏠</button>
        )}
        {onToggleAmbient && (
          <button
            onClick={onToggleAmbient}
            className={`hud-icon-btn${ambientActive ? " active" : ""}`}
            title={
              ambientActive
                ? "Bring the kingdom back into this tab"
                : "Ambient mode — float the kingdom in a small always-on-top window while you work"
            }
            aria-label="Toggle ambient mode"
          >🪟</button>
        )}
        {onToggleChronicle && (
          <button onClick={onToggleChronicle} title="Read the kingdom's chronicle">Chronicle</button>
        )}
        {onToggleFamilyTree && (
          <button onClick={onToggleFamilyTree} title="Family tree of the kingdom">Family</button>
        )}
        {onToggleDiplomacy && (
          <button onClick={onToggleDiplomacy} title="Diplomatic relations with off-map kingdoms">Diplomacy</button>
        )}
        <button onClick={onToggleStats} title="Kingdom stats" data-tour="stats">Stats</button>
        <button
          onClick={onToggleJournal}
          className={unseenJournal > 0 ? "has-badge" : ""}
          data-tour="journal"
        >
          Journal ({journalCount})
          {unseenJournal > 0 && (
            <span className="hud-badge">{unseenJournal > 99 ? "99+" : unseenJournal}</span>
          )}
        </button>
        <button onClick={onToggleLog} className={unseenEvents > 0 ? "has-badge" : ""}>
          Events ({eventCount})
          {unseenEvents > 0 && (
            <span className="hud-badge">{unseenEvents > 99 ? "99+" : unseenEvents}</span>
          )}
        </button>
        <button onClick={onToggleSettings}>Settings</button>
      </div>
    </header>
  );
}

/** Pulse the decision card to pull the eye when the council chip is clicked.
 *  The card is always bottom-center when a decision is up; this just draws
 *  attention to it rather than navigating anywhere. */
function flashCourt() {
  const el = document.querySelector(".decision-prompt");
  if (!el) return;
  el.classList.remove("court-flash");
  // Force reflow so the animation restarts on repeat clicks.
  void (el as HTMLElement).offsetWidth;
  el.classList.add("court-flash");
  window.setTimeout(() => el.classList.remove("court-flash"), 1200);
}

function formatHour(h: number) {
  const hour = Math.floor(h);
  const min = Math.floor((h - hour) * 60);
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * "Hour 17" means nothing to a brand-new player. Prepend a glyph + a
 * short label so the clock chip reads as natural human time-of-day.
 * Aligned to the day/night palette tint thresholds so what the player
 * sees on the world matches the label.
 */
function partOfDay(h: number): { glyph: string; label: string } {
  const hour = Math.floor(h);
  if (hour >= 5 && hour < 8)   return { glyph: "🌅", label: "dawn" };
  if (hour >= 8 && hour < 12)  return { glyph: "☀", label: "morning" };
  if (hour >= 12 && hour < 17) return { glyph: "☀", label: "afternoon" };
  if (hour >= 17 && hour < 20) return { glyph: "🌇", label: "evening" };
  if (hour >= 20 && hour < 23) return { glyph: "🌙", label: "night" };
  return { glyph: "🌙", label: "late" };
}

function factionLabel(score: number): string {
  if (score >= 5) return "pleased";
  if (score >= 2) return "content";
  if (score >= -2) return "neutral";
  if (score >= -5) return "uneasy";
  return "angry";
}

function factionClass(score: number): string {
  if (score >= 4) return "faction-pleased";
  if (score <= -4) return "faction-angry";
  return "faction-neutral";
}

function greetingFor(inWorldHour: number, monarch: string): string {
  const h = Math.floor(inWorldHour);
  let phrase: string;
  if (h >= 5 && h < 12) phrase = "Good morning";
  else if (h >= 12 && h < 17) phrase = "Good afternoon";
  else if (h >= 17 && h < 21) phrase = "Good evening";
  else phrase = "Sleep well";
  return `${phrase}, ${monarch}.`;
}
