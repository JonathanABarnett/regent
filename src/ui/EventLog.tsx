import { useGameStore } from "../store/useGameStore";

const sourceIcon: Record<string, string> = {
  github: "⌗",
  fs: "📂",
  system: "⚙",
  http: "↯",
  ws: "↯",
  inbox: "✉",
  internal: "·",
  narrative: "✦",
};

const kindLabel: Record<string, string> = {
  courier: "courier",
  forge: "forge",
  research: "research",
  mining: "mining",
  storm: "storm",
  celebration: "celebration",
  airship: "airship",
  monster: "monster",
  festival: "festival",
  custom: "custom",
};

export function EventLog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const events = useGameStore((s) => s.events);
  const clearEvents = useGameStore((s) => s.clearEvents);

  if (!open) return null;
  return (
    <aside className="event-log">
      <div className="event-log-header">
        <span>Event Log</span>
        <div>
          <button onClick={clearEvents} title="Clear">⌫</button>
          <button onClick={onClose} title="Close">×</button>
        </div>
      </div>
      <ol className="event-log-list">
        {events.length === 0 && <li className="event-log-empty">no events yet — the world is just waking up</li>}
        {[...events].reverse().map((e) => (
          <li key={e.id} className={`event-log-item event-${e.kind} src-${e.source}`}>
            <span className="event-source">{sourceIcon[e.source] ?? "·"}</span>
            <span className="event-kind">{kindLabel[e.kind] ?? e.kind}</span>
            <span className="event-label">{e.payload.label ?? e.payload.from ?? ""}</span>
            <span className="event-ts">{formatTs(e.ts)}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function formatTs(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
