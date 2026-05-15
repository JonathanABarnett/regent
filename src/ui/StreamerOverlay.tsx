import { useEffect, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import type { ExternalEvent } from "../sim/events/EventSchema";

/**
 * On-stream overlay. Only renders when `settings.streamerMode` is on.
 * Shows the latest 5 Twitch-source events as ticker cards top-right.
 * Designed to be friendly to OBS Browser Source — no chrome, no HUD, the
 * Pixi canvas underneath fills the rest of the screen.
 */
export function StreamerOverlay() {
  const enabled = useGameStore((s) => s.settings.streamerMode);
  const channel = useGameStore((s) => s.settings.twitchChannel);
  const events = useGameStore((s) => s.events);
  const [recent, setRecent] = useState<ExternalEvent[]>([]);

  useEffect(() => {
    if (!enabled) {
      setRecent([]);
      return;
    }
    const twitchOnly = events.filter((e) => e.source === "twitch").slice(-5);
    setRecent(twitchOnly);
  }, [events, enabled]);

  if (!enabled) return null;

  return (
    <div className="streamer-overlay">
      {channel && <div className="streamer-channel">⚑ {channel}</div>}
      <ul className="streamer-ticker">
        {recent.map((e) => (
          <li key={e.id} className={`stream-evt ${e.kind}`}>
            <span className="stream-icon">{iconFor(e.kind)}</span>
            <span className="stream-text">{labelFor(e)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function iconFor(kind: string): string {
  switch (kind) {
    case "twitch_follow": return "♡";
    case "twitch_sub": return "★";
    case "twitch_bits": return "◆";
    case "twitch_raid": return "⚔";
    default: return "·";
  }
}

function labelFor(e: ExternalEvent): string {
  const user = (e.payload.meta?.user as string | undefined) ?? "";
  switch (e.kind) {
    case "twitch_follow": return `${user || "a viewer"} followed`;
    case "twitch_sub": {
      const tier = (e.payload.meta?.tier as number | undefined) ?? 1;
      return `${user || "a viewer"} subscribed${tier > 1 ? ` (T${tier})` : ""}`;
    }
    case "twitch_bits": {
      const bits = (e.payload.meta?.bits as number | undefined) ?? 0;
      return `${user || "a viewer"} cheered ${bits} bits`;
    }
    case "twitch_raid": {
      const viewers = (e.payload.meta?.viewers as number | undefined) ?? 0;
      return `${user || "a viewer"} raided with ${viewers}`;
    }
    default: return e.payload.label ?? e.kind;
  }
}
