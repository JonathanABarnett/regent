import { useEffect } from "react";
import { useGameStore } from "../store/useGameStore";

/**
 * Compact sim-speed control, lives bottom-right of the HUD.
 * Keyboard shortcut: `,` slows, `.` speeds, `/` toggles pause.
 */

const PRESETS = [0, 0.5, 1, 2, 3] as const;

export function SpeedControl() {
  const speed = useGameStore((s) => s.settings.simSpeed);
  const setSpeed = useGameStore((s) => s.setSimSpeed);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (e.key === ",") {
        // slower
        const idx = PRESETS.findIndex((p) => p >= speed);
        const next = PRESETS[Math.max(0, idx - 1)];
        setSpeed(next);
      } else if (e.key === ".") {
        const idx = PRESETS.findIndex((p) => p >= speed);
        const next = PRESETS[Math.min(PRESETS.length - 1, idx + 1)];
        setSpeed(next);
      } else if (e.key === "/") {
        e.preventDefault();
        setSpeed(speed === 0 ? 1 : 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [speed, setSpeed]);

  return (
    <div className="speed-control" title="Simulation speed">
      {PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          className={"speed-btn" + (p === speed ? " active" : "")}
          onClick={() => setSpeed(p)}
          title={p === 0 ? "Pause (/)" : `${p}× speed`}
        >
          {p === 0 ? "▮▮" : p === 0.5 ? "½" : `${p}×`}
        </button>
      ))}
    </div>
  );
}
