import { useEffect, useState } from "react";
import type { World } from "../sim/World";
import type { PendingDecision } from "../sim/systems/Decisions";

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

  if (!current) return null;
  const w = getWorld();
  if (!w) return null;

  const secondsLeft = Math.max(0, Math.floor((current.expiresAt - Date.now()) / 1000));
  const mm = Math.floor(secondsLeft / 60);
  const ss = secondsLeft % 60;
  const timeStr = `${mm}:${String(ss).padStart(2, "0")}`;
  const defaultLabel = current.defaultOnExpire
    ? `auto-decides in ${timeStr} (${current.options[0]?.label ?? "first option"})`
    : `expires in ${timeStr}`;

  return (
    <div
      className="decision-prompt"
      role="alertdialog"
      aria-labelledby="decision-title"
      aria-describedby="decision-body"
    >
      <div className="decision-header">
        <span className="decision-title" id="decision-title">{current.title}</span>
        <span className="decision-timer" title={defaultLabel} aria-label={defaultLabel}>
          {timeStr}
        </span>
      </div>
      <p className="decision-body" id="decision-body">{current.body}</p>
      <div className="decision-options">
        {current.options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => w.decisions.resolve(current.id, opt.id)}
            className={opt.id === current.options[0]?.id ? "ghost" : "primary"}
          >
            <span className="decision-opt-label">{opt.label}</span>
            {opt.hint && <span className="decision-opt-hint">{opt.hint}</span>}
          </button>
        ))}
      </div>
      <div className="decision-footer">{defaultLabel}</div>
    </div>
  );
}
