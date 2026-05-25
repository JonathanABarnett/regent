import { useGameStore } from "../store/useGameStore";

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
  onToggleChronicle,
  onSelectAdvisor,
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
  onToggleChronicle?: () => void;
  /** Click handler for the advisor chip — typically opens the NPC profile
   *  modal (App.tsx wires this to setProfileNpcId). */
  onSelectAdvisor?: (npcId: string) => void;
  cutawayActive?: boolean;
}) {
  const stats = useGameStore((s) => s.worldStats);
  const identity = useGameStore((s) => s.identity);
  const eventCount = useGameStore((s) => s.events.length);
  const journalCount = useGameStore((s) => s.journal.length);
  const seen = useGameStore((s) => s.seen);
  const hourLabel = formatHour(stats.hour);
  const unseenJournal = Math.max(0, journalCount - seen.journal);
  const unseenEvents = Math.max(0, eventCount - seen.events);
  const greeting = greetingFor(stats.hour, identity?.monarchName ?? "monarch");
  return (
    <header className="hud">
      <div className="hud-left">
        <span className="badge" title={greeting}>{identity?.kingdomName ?? "KingdomOS"}</span>
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
        <span className="day">{stats.dayOfWeek ? `${stats.dayOfWeek} ·` : ""} Day {stats.day} · Y{stats.year}</span>
        <span className="season">{seasonIcon[stats.season] ?? "·"} {stats.season}</span>
        <span className="clock">{hourLabel}</span>
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
        {onToggleChronicle && (
          <button onClick={onToggleChronicle} title="Read the kingdom's chronicle">Chronicle</button>
        )}
        {onToggleFamilyTree && (
          <button onClick={onToggleFamilyTree} title="Family tree of the kingdom">Family</button>
        )}
        {onToggleDiplomacy && (
          <button onClick={onToggleDiplomacy} title="Diplomatic relations with off-map kingdoms">Diplomacy</button>
        )}
        <button onClick={onToggleStats} title="Kingdom stats">Stats</button>
        <button onClick={onToggleJournal} className={unseenJournal > 0 ? "has-badge" : ""}>
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

function formatHour(h: number) {
  const hour = Math.floor(h);
  const min = Math.floor((h - hour) * 60);
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
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
