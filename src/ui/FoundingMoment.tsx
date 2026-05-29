import { useEffect, useState } from "react";
import { useGameStore } from "../store/useGameStore";

/**
 * A one-time orientation toast shown ~5 seconds after a kingdom is
 * founded. Directs the new player's attention at the journal so they
 * understand the founding sequence wrote real content and the game
 * has *already started telling a story*.
 *
 * Why this exists: a 99¢ buyer who founds a kingdom and then watches
 * pixel villagers walk silently doesn't realize the chronicle is
 * filling itself. This toast points at it explicitly. Idempotent —
 * stored in localStorage keyed by kingdom name, so the player who
 * comes back tomorrow doesn't see it again.
 *
 * Auto-dismisses after 12 seconds. Click anywhere to dismiss
 * immediately. The "Read the chronicle" button toggles the journal.
 */

const STORAGE_KEY = "kingdomos.foundingMoment.seenKingdoms";

function loadSeen(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : []);
  } catch {
    return new Set();
  }
}

function saveSeen(set: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    // Cap at 50 names so the list doesn't grow unboundedly across
    // playtests / replays. Newest wins on tie.
    const arr = [...set].slice(-50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export function FoundingMoment({ onOpenJournal }: { onOpenJournal: () => void }) {
  const identity = useGameStore((s) => s.identity);
  const kingdomName = identity?.kingdomName;
  // When the first-launch guided tour is still pending (showTutorial),
  // it covers the same "here's your chronicle" beat — so this toast
  // stays out of the way to avoid a first-play pile-on. Returning
  // players (tour already done/skipped) get this lighter nudge instead.
  const tourPending = useGameStore((s) => s.settings.showTutorial);
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (!kingdomName || tourPending) return;
    const seen = loadSeen();
    if (seen.has(kingdomName)) return;
    // Wait ~8 seconds so the founding burst (fireworks, courier, the
    // Welcome Petition prompt) has settled before this orientation card
    // slides in — otherwise it competes for attention in the exact
    // moment the player is trying to read everything at once.
    //
    // Crucially: NO auto-dismiss. Playtest feedback was that early
    // toasts vanish while the player is mid-read. This card has explicit
    // "Read the chronicle" / "Later" buttons — it stays until the player
    // chooses one. (It's one-time per kingdom, so it won't nag.)
    const showAt = window.setTimeout(() => setVisible(true), 8000);
    return () => clearTimeout(showAt);
  }, [kingdomName, tourPending]);

  function dismiss(): void {
    setDismissing(true);
    window.setTimeout(() => {
      setVisible(false);
      if (kingdomName) {
        const next = loadSeen();
        next.add(kingdomName);
        saveSeen(next);
      }
    }, 400);
  }

  if (!visible || !kingdomName) return null;

  return (
    <div
      className={`founding-moment${dismissing ? " dismissing" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="founding-moment-crest">✦</div>
      <div className="founding-moment-text">
        <strong>Your story has begun.</strong>
        <span>
          {kingdomName}'s chronicle is already being written. Take a look.
        </span>
      </div>
      <div className="founding-moment-actions">
        <button
          type="button"
          className="primary"
          onClick={() => {
            dismiss();
            onOpenJournal();
          }}
        >
          Read the chronicle
        </button>
        <button type="button" className="ghost" onClick={dismiss}>
          Later
        </button>
      </div>
    </div>
  );
}
