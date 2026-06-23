import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";

const LINES = [
  "All caught up. The kingdom's in good hands — check back in a while.",
  "Court adjourned. Nothing else needs you right now. Go run your tests.",
  "Every matter settled. The realm will keep turning while you're away.",
  "Inbox zero, your majesty. The steward has the rest. See you next break.",
];

/**
 * The satisfying exit of the check-in loop. When the player clears the last
 * waiting decision (the pending count falls from >0 to 0), a brief toast
 * gives "inbox zero" closure and an explicit permission to leave — which is
 * the behavior we WANT from a background check-in game: do your batch, feel
 * done, get back to work, come back later.
 *
 * Only fires on the >0 -> 0 transition (so it never shows on a fresh load
 * with an empty court), and stays out of the way during the tour / steward
 * report / pre-kingdom flow.
 */
export function CaughtUp() {
  const pending = useGameStore((s) => s.pendingDecisions);
  const identity = useGameStore((s) => s.identity);
  const tourActive = useGameStore((s) => s.tourActive);
  const stewardReport = useGameStore((s) => s.stewardReport);
  const prev = useRef(pending);
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    const fell = prev.current > 0 && pending === 0;
    prev.current = pending;
    if (!fell || !identity || tourActive || stewardReport) return;
    // Deterministic-enough variety without Date.now/Math.random gating: key
    // off the current minute so repeat clears within a session differ.
    setLine(LINES[Math.floor(performance.now() / 1000) % LINES.length]);
    const t = window.setTimeout(() => setLine(null), 6000);
    return () => clearTimeout(t);
  }, [pending, identity, tourActive, stewardReport]);

  if (!line) return null;
  return (
    <div className="caught-up" role="status" aria-live="polite" onClick={() => setLine(null)}>
      <span className="caught-up-check" aria-hidden="true">✓</span>
      <span className="caught-up-text">{line}</span>
    </div>
  );
}
