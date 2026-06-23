import { useEffect, useState } from "react";
import type { World } from "../sim/World";
import type { PendingDecision } from "../sim/systems/Decisions";
import { NpcPortrait } from "./NpcPortrait";

/**
 * Bottom-center floating card asking the player to make a decision. Subscribes
 * directly to the world's Decisions system rather than going through the
 * Zustand store, since decisions are inherently sim-state.
 */
export function DecisionPrompt({ getWorld }: { getWorld: () => World | null }) {
  const [current, setCurrent] = useState<PendingDecision | null>(null);
  // Independent 1-second tick so the timer counts down visibly even when
  // the decision itself doesn't change.
  const [, setNow] = useState(Date.now());
  // Floating impact text — choices should feel like they DID something.
  // Each chosen option's hint (its consequence preview) rises from the
  // button and fades. Lives outside `current` so it survives the card
  // unmounting the instant the decision resolves.
  const [floats, setFloats] = useState<
    Array<{ id: number; text: string; x: number; y: number }>
  >([]);

  function choose(decisionId: string, opt: PendingDecision["options"][number], e: React.MouseEvent) {
    const w = getWorld();
    if (!w) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const text = opt.hint ?? opt.label;
    const id = performance.now();
    setFloats((f) => [...f, { id, text, x: rect.left + rect.width / 2, y: rect.top }]);
    window.setTimeout(() => setFloats((f) => f.filter((fl) => fl.id !== id)), 1400);
    w.decisions.resolve(decisionId, opt.id);
  }

  useEffect(() => {
    let off: (() => void) | undefined;
    const probe = () => {
      const w = getWorld();
      if (!w) return false;
      off = w.decisions.subscribe(setCurrent);
      return true;
    };
    if (!probe()) {
      const id = window.setInterval(() => {
        if (probe()) clearInterval(id);
      }, 200);
      return () => {
        clearInterval(id);
        off?.();
      };
    }
    return () => off?.();
  }, [getWorld]);

  useEffect(() => {
    if (!current) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [current]);

  const floatEls = floats.map((f) => (
    <div
      key={f.id}
      className="decision-float"
      style={{ left: f.x, top: f.y }}
      aria-hidden="true"
    >
      {f.text}
    </div>
  ));

  if (!current) return <>{floatEls}</>;
  const w = getWorld();
  if (!w) return <>{floatEls}</>;

  // Measure against the decisions clock, which is pinned while the sim is
  // paused (guided tutorial / manual pause). That keeps the countdown
  // visibly frozen during a pause instead of ticking toward auto-decide.
  const secondsLeft = Math.max(0, Math.floor((current.expiresAt - w.decisions.effectiveNow()) / 1000));
  const mm = Math.floor(secondsLeft / 60);
  const ss = secondsLeft % 60;
  const timeStr = `${mm}:${String(ss).padStart(2, "0")}`;
  // Under 30s left → urgent state (pulsing border). At 0s the timer has
  // run out, but the prompt only actually clears when the sim ticks
  // (Decisions.tick runs inside world.tick). If the sim is paused, the
  // prompt sits at 0:00 indefinitely — without the `expired` flag we
  // would pulse the border forever, which reads as a bug. Drop urgency
  // once we hit zero and explain why nothing's happening.
  const expired = secondsLeft <= 0;
  const urgent = !expired && secondsLeft <= 30;
  const defaultName = current.options[0]?.label ?? "first option";
  const footerText = expired
    ? (current.defaultOnExpire
        ? `Time's up — unpause to apply "${defaultName}"`
        : "Time's up — unpause to dismiss")
    : current.defaultOnExpire
      ? `Auto-decides in ${timeStr} → "${defaultName}"`
      : `Expires in ${timeStr}`;

  return (
    <>
    {floatEls}
    <div
      className={`decision-prompt${urgent ? " urgent" : ""}`}
      role="alertdialog"
      aria-labelledby="decision-title"
      aria-describedby="decision-body"
    >
      <div className="decision-header">
        <span className="decision-title" id="decision-title">{current.title}</span>
        {w.decisions.count() > 1 && (
          <span
            className="decision-queue-badge"
            title={`${w.decisions.count()} matters in the court — resolve this to see the next`}
          >
            +{w.decisions.count() - 1} more
          </span>
        )}
        <span className="decision-timer" title={footerText} aria-label={footerText}>
          {urgent && <span className="decision-timer-warn" aria-hidden="true">⏳</span>}
          {timeStr}
        </span>
      </div>
      {current.portraitSeed !== undefined ? (
        <div className="decision-body-row">
          <div className="decision-portrait">
            <NpcPortrait seed={current.portraitSeed} size={56} />
          </div>
          <p className="decision-body" id="decision-body">{current.body}</p>
        </div>
      ) : (
        <p className="decision-body" id="decision-body">{current.body}</p>
      )}
      <div className="decision-options">
        {current.options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={(e) => choose(current.id, opt, e)}
            className={opt.id === current.options[0]?.id ? "ghost" : "primary"}
          >
            <span className="decision-opt-label">{opt.label}</span>
            {opt.hint && <span className="decision-opt-hint">{opt.hint}</span>}
          </button>
        ))}
      </div>
      <div className="decision-footer">{footerText}</div>
    </div>
    </>
  );
}
