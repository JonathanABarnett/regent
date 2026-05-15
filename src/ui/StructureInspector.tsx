import { useEffect, useState } from "react";
import type { Structure } from "../sim/types";
import type { World } from "../sim/World";

/**
 * Floating card that shows what's happening at a clicked structure: who lives
 * there, who works there, which ones are home right now. Lightweight read-only
 * surface — the world ticks on regardless.
 */
export function StructureInspector({
  structure,
  world,
  onClose,
}: {
  structure: Structure;
  world: World;
  onClose: () => void;
}) {
  // Light re-render on world stats tick so live numbers update.
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const residents = world.npcs.filter((n) => n.homeId === structure.id);
  const workers = world.npcs.filter((n) => n.workId === structure.id && n.homeId !== structure.id);
  const here = world.npcs.filter((n) => {
    const dx = n.pos.x - (structure.pos.x + structure.size.x / 2);
    const dy = n.pos.y - (structure.pos.y + structure.size.y / 2);
    return Math.hypot(dx, dy) < Math.max(structure.size.x, structure.size.y);
  });

  const econ = world.economy.state;

  return (
    <div className="structure-inspector" onClick={onClose}>
      <div className="structure-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>{structure.name}</h2>
            <div className="structure-kind">{structure.kind}</div>
          </div>
          <button onClick={onClose} title="Close">×</button>
        </header>

        <section>
          <h3>Right now</h3>
          {here.length === 0 ? (
            <p className="muted">Empty.</p>
          ) : (
            <ul>
              {here.slice(0, 8).map((n) => (
                <li key={n.id}>
                  {iconForRole(n.role)} {n.name ?? n.role}
                  <span className="age">· {Math.floor(n.age ?? 0)}y · {n.activity}</span>
                </li>
              ))}
              {here.length > 8 && <li className="muted">…and {here.length - 8} more</li>}
            </ul>
          )}
        </section>

        <section>
          <h3>Residents · {residents.length}</h3>
          {residents.length === 0 ? (
            <p className="muted">None.</p>
          ) : (
            <ul>
              {residents.slice(0, 6).map((n) => (
                <li key={n.id}>
                  {iconForRole(n.role)} {n.name ?? n.role}
                  {n.partnerId && (
                    <span className="age">· wed to {world.npcs.find((m) => m.id === n.partnerId)?.name ?? "—"}</span>
                  )}
                </li>
              ))}
              {residents.length > 6 && <li className="muted">…and {residents.length - 6} more</li>}
            </ul>
          )}
        </section>

        {workers.length > 0 && (
          <section>
            <h3>Workers · {workers.length}</h3>
            <ul>
              {workers.slice(0, 6).map((n) => (
                <li key={n.id}>
                  {iconForRole(n.role)} {n.name ?? n.role}
                </li>
              ))}
              {workers.length > 6 && <li className="muted">…and {workers.length - 6} more</li>}
            </ul>
          </section>
        )}

        {structure.kind === "mine" && (
          <section>
            <h3>Production</h3>
            <div className="kv-row"><dt>ore stockpile</dt><dd>{econ.ore.toFixed(0)}</dd></div>
          </section>
        )}
        {structure.kind === "forge" && (
          <section>
            <h3>Production</h3>
            <div className="kv-row"><dt>ironwork</dt><dd>{econ.ironwork.toFixed(0)}</dd></div>
          </section>
        )}
        {structure.kind === "library" && (
          <section>
            <h3>Production</h3>
            <div className="kv-row"><dt>tomes</dt><dd>{econ.tomes.toFixed(0)}</dd></div>
          </section>
        )}
        {structure.kind === "castle" && (
          <section>
            <h3>Treasury</h3>
            <div className="kv-row"><dt>gold</dt><dd>{econ.gold.toFixed(0)}</dd></div>
            <div className="kv-row"><dt>artifacts in vault</dt><dd>{world.treasury.count()}</dd></div>
            {world.treasury.artifacts.length > 0 && (
              <ul className="artifact-list">
                {world.treasury.artifacts.slice(-6).reverse().map((a) => (
                  <li key={a.id} className="artifact">
                    <span className="artifact-kind">{glyphFor(a.kind)}</span>
                    <span className="artifact-name">{a.name}</span>
                    <span className="artifact-when">Y{a.obtainedOnYear} D{a.obtainedOnDay}</span>
                  </li>
                ))}
                {world.treasury.artifacts.length > 6 && (
                  <li className="muted">…and {world.treasury.artifacts.length - 6} more in the vault</li>
                )}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function glyphFor(kind: string): string {
  switch (kind) {
    case "scroll": return "📜";
    case "relic": return "✦";
    case "gem": return "◆";
    case "tome": return "📖";
    case "weapon": return "⚔";
    case "treasure": return "👑";
    default: return "·";
  }
}

function iconForRole(role: string): string {
  switch (role) {
    case "monarch": return "👑";
    case "guard": return "🛡";
    case "blacksmith": return "🔨";
    case "miner": return "⛏";
    case "scholar": return "📖";
    case "courier": return "🐎";
    case "villager": default: return "·";
  }
}
