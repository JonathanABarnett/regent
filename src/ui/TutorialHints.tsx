import { useEffect, useState } from "react";
import { useGameStore } from "../store/useGameStore";

/**
 * First-launch tutorial. Four sequential hints, each pointing at a HUD region.
 * Auto-advances on click. The whole thing can be dismissed via the X — or
 * disabled forever via Settings → showTutorial.
 *
 * Show timing: 3-second delay after first launch so the player sees the world
 * before getting hints. Sticky across the session until dismissed; if disabled
 * via setting they never appear again.
 */

interface Hint {
  id: string;
  title: string;
  body: string;
  /** CSS anchor on the visible HUD. */
  anchor: "hud-stats" | "hud-journal" | "minimap" | "speed" | "free";
}

const HINTS: Hint[] = [
  {
    id: "welcome",
    title: "Your kingdom lives on its own",
    body:
      "Don't worry about doing anything. The world ticks, NPCs work, the journal fills. Click anywhere to advance.",
    anchor: "free",
  },
  {
    id: "stats",
    title: "Check your kingdom",
    body:
      "The Stats panel (top right) shows population, vault, court, achievements, and the goals you're working toward. Open it anytime.",
    anchor: "hud-stats",
  },
  {
    id: "aspirations",
    title: "Three goals at a time",
    body:
      "Inside Stats you'll see Aspirations — three soft goals like \"reach 25 villagers\" or \"see 5 different monarchs.\" Ignore them if you want; check them off if that's your style.",
    anchor: "hud-stats",
  },
  {
    id: "court",
    title: "The court does real things",
    body:
      "Appoint a Royal Advisor, Captain of the Guard, or Court Scholar from the Stats panel. Each seat affects the world — advisors give you more time on decisions, captains keep storms at bay, scholars speed up the library.",
    anchor: "hud-stats",
  },
  {
    id: "journal",
    title: "The journal is your story",
    body:
      "Every major event — births, marriages, festivals, raids — gets written here. Filter by kind, search by name, and the ⇩ button exports the whole chronicle as a markdown file you can keep.",
    anchor: "hud-journal",
  },
  {
    id: "controls",
    title: "Click anything",
    body:
      "Click an NPC to follow them. Click a building to inspect it. Drag to pan, scroll to zoom. Press P for a framed screenshot. Press ? anytime for the full keybindings.",
    anchor: "free",
  },
];

export function TutorialHints() {
  const enabled = useGameStore((s) => s.settings.showTutorial);
  const setShowTutorial = useGameStore((s) => s.setShowTutorial);
  const identity = useGameStore((s) => s.identity);
  const [idx, setIdx] = useState(0);
  const [delayedOpen, setDelayedOpen] = useState(false);

  // Only start showing hints after onboarding completes + a brief pause.
  useEffect(() => {
    if (!enabled || !identity) return;
    const t = window.setTimeout(() => setDelayedOpen(true), 3000);
    return () => clearTimeout(t);
  }, [enabled, identity]);

  if (!enabled || !identity || !delayedOpen) return null;
  if (idx >= HINTS.length) return null;

  const hint = HINTS[idx];
  const next = () => {
    if (idx + 1 >= HINTS.length) {
      // Finished — mark as seen
      setShowTutorial(false);
      return;
    }
    setIdx(idx + 1);
  };

  return (
    <div className={"tutorial-overlay anchor-" + hint.anchor} onClick={next}>
      <div className="tutorial-card" onClick={(e) => e.stopPropagation()}>
        <div className="tutorial-step">
          {idx + 1} / {HINTS.length}
        </div>
        <h4>{hint.title}</h4>
        <p>{hint.body}</p>
        <div className="tutorial-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => setShowTutorial(false)}
          >
            Skip tour
          </button>
          <button type="button" className="primary" onClick={next}>
            {idx + 1 === HINTS.length ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
