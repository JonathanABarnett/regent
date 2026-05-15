import { useEffect, useState } from "react";
import { useGameStore } from "../store/useGameStore";

/**
 * Tiny perf overlay — FPS + entity counts. Toggled via settings.showPerfHud.
 * Keep this cheap: 1 Hz refresh, no scrollback, no expensive math.
 */
export function PerformanceHUD({ getWorld }: { getWorld: () => unknown }) {
  const enabled = useGameStore((s) => s.settings.showPerfHud);
  const [fps, setFps] = useState(0);
  const [counts, setCounts] = useState({ npcs: 0, pets: 0, couriers: 0, effects: 0 });

  // FPS sampling — count rAF callbacks per second
  useEffect(() => {
    if (!enabled) return;
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      const w = getWorld() as
        | { npcs: unknown[]; pets: unknown[]; couriers: unknown[]; effects: unknown[] }
        | null;
      if (!w) return;
      setCounts({
        npcs: w.npcs.length,
        pets: w.pets.length,
        couriers: w.couriers.length,
        effects: w.effects.length,
      });
    }, 500);
    return () => clearInterval(id);
  }, [enabled, getWorld]);

  if (!enabled) return null;

  const fpsClass = fps >= 55 ? "good" : fps >= 30 ? "ok" : "bad";
  return (
    <div className="perf-hud">
      <div className={"perf-fps " + fpsClass}>{fps} FPS</div>
      <div className="perf-line">npcs {counts.npcs}</div>
      <div className="perf-line">pets {counts.pets}</div>
      <div className="perf-line">cour {counts.couriers}</div>
      <div className="perf-line">fx {counts.effects}</div>
    </div>
  );
}
