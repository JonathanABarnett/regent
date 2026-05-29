import { useEffect, useLayoutEffect, useState } from "react";
import { useGameStore } from "../store/useGameStore";

/**
 * First-launch guided tour.
 *
 * Playtest feedback: brand-new players were overwhelmed because the
 * founding burst (fireworks, courier, achievement, petition, toasts)
 * all fired at once, and the old tutorial was nine generic centered
 * cards that didn't point at anything. Players didn't know WHAT to
 * click or WHERE.
 *
 * This is a focused spotlight tour: six short steps, each one
 * physically highlighting the real HUD element it describes (a glowing
 * ring punched out of a dimmed backdrop, with a tooltip beside it).
 * Steps whose target element isn't on screen are skipped gracefully.
 *
 * Timing: waits ~9 seconds after founding so the opening fireworks/
 * courier settle and the Welcome Petition is on-screen (the tour points
 * at it as "your first decision"). One-time per install via the
 * showTutorial setting; skippable at any step.
 */

interface Step {
  id: string;
  title: string;
  body: string;
  /**
   * CSS selector for the element to spotlight. Omit for a centered
   * card (welcome / closing). If the selector matches nothing, the
   * step is skipped.
   */
  target?: string;
}

const STEPS: Step[] = [
  {
    id: "welcome",
    title: "A quick tour",
    body:
      "Six short steps to show you what's where. You can skip anytime — the kingdom runs on its own regardless.",
  },
  {
    id: "rule",
    title: "This is how you rule",
    body:
      "Tap Rule whenever you want to act — hold a festival, pass a law, raise a building. Nothing here is required, but it's all yours to command.",
    target: ".hud-rule-btn",
  },
  {
    id: "decision",
    title: "Your court brings you choices",
    body:
      "When a decision is needed, it appears here. The hints under each option preview what happens. There's a countdown — if you don't choose in time, your court goes with the safe default shown at the bottom.",
    target: ".decision-prompt",
  },
  {
    id: "goal",
    title: "Something to aim for",
    body:
      "Your current goal sits up here, with a little progress bar. Chase it or ignore it — it's a suggestion, not a quest.",
    target: ".hud-goal",
  },
  {
    id: "journal",
    title: "Your story is written here",
    body:
      "Everything that happens — births, festivals, the choices you make — gets recorded in the Journal. Your own decisions are marked with a ✦.",
    target: '[data-tour="journal"]',
  },
  {
    id: "closing",
    title: "That's the whole loop",
    body:
      "Watch the world live, or steer it when the mood takes you. Press ? anytime for the full controls. Enjoy your reign.",
  },
];

/** Padding around the spotlit element, in px. */
const RING_PAD = 6;

export function TutorialHints() {
  const enabled = useGameStore((s) => s.settings.showTutorial);
  const setShowTutorial = useGameStore((s) => s.setShowTutorial);
  const setTourActive = useGameStore((s) => s.setTourActive);
  const identity = useGameStore((s) => s.identity);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  // Bounding rect of the current step's target (null = centered card).
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Start the tour ~3s after founding — long enough for the founding
  // fanfare to register, then the tour opens and PAUSES the world
  // (tourActive freezes the sim), so the player reads + clicks through
  // a still scene. The Welcome Petition is already on screen for step 3.
  useEffect(() => {
    if (!enabled || !identity) return;
    const t = window.setTimeout(() => {
      setIdx(0); // always start from step 1 (matters for Settings → replay)
      setOpen(true);
    }, 3000);
    return () => clearTimeout(t);
  }, [enabled, identity]);

  // Freeze the world while the tour is on screen; unfreeze when it's done.
  useEffect(() => {
    setTourActive(open);
    return () => setTourActive(false);
  }, [open, setTourActive]);

  // Auto-skip steps whose target element isn't present, and measure the
  // rect of the current target. Re-measures on resize so the spotlight
  // tracks if the layout shifts.
  useLayoutEffect(() => {
    if (!open) return;
    const step = STEPS[idx];
    if (!step) return;

    const measure = () => {
      if (!step.target) {
        setRect(null);
        return true;
      }
      const el = document.querySelector(step.target);
      if (!el) return false;
      setRect(el.getBoundingClientRect());
      return true;
    };

    if (!measure()) {
      // Target missing — skip to the next renderable step.
      advance();
      return;
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idx]);

  function advance() {
    setIdx((i) => {
      // Find the next step that either is centered or has a present target.
      let n = i + 1;
      while (n < STEPS.length) {
        const s = STEPS[n];
        if (!s.target || document.querySelector(s.target)) break;
        n++;
      }
      if (n >= STEPS.length) {
        finish();
        return i;
      }
      return n;
    });
  }

  function finish() {
    setOpen(false);
    setShowTutorial(false); // one-time; persisted by the store
  }

  if (!enabled || !identity || !open) return null;
  if (idx >= STEPS.length) return null;
  const step = STEPS[idx];

  // Spotlight ring geometry (only when a target rect exists).
  const ringStyle: React.CSSProperties | undefined = rect
    ? {
        left: rect.left - RING_PAD,
        top: rect.top - RING_PAD,
        width: rect.width + RING_PAD * 2,
        height: rect.height + RING_PAD * 2,
      }
    : undefined;

  // Tooltip placement: below the target if it's in the top half of the
  // screen, above if it's in the bottom half. Centered when no target.
  let tipStyle: React.CSSProperties = {};
  let placement = "center";
  if (rect) {
    const belowSpace = window.innerHeight - rect.bottom;
    if (belowSpace > 220) {
      placement = "below";
      tipStyle = { top: rect.bottom + RING_PAD + 12, left: clampLeft(rect.left) };
    } else {
      placement = "above";
      tipStyle = { bottom: window.innerHeight - rect.top + RING_PAD + 12, left: clampLeft(rect.left) };
    }
  }

  const stepNum = idx + 1;
  const total = STEPS.length;

  return (
    <div className="tour-overlay">
      {/* Backdrop: a click-catcher that advances. When a ring is present
          the ring's big box-shadow does the dimming, so the backdrop
          itself is transparent. When centered, dim via the backdrop. */}
      <div
        className={`tour-backdrop${rect ? " has-ring" : ""}`}
        onClick={advance}
      />
      {ringStyle && <div className="tour-ring" style={ringStyle} />}
      <div
        className={`tour-tip tour-tip-${placement}`}
        style={tipStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tour-step-count">{stepNum} / {total}</div>
        <h4>{step.title}</h4>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button type="button" className="ghost" onClick={finish}>Skip</button>
          <button type="button" className="primary" onClick={advance}>
            {stepNum === total ? "Begin" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Keep the tooltip from overflowing the right edge. */
function clampLeft(x: number): number {
  const TIP_WIDTH = 320;
  const margin = 12;
  const max = window.innerWidth - TIP_WIDTH - margin;
  return Math.max(margin, Math.min(x, max));
}
