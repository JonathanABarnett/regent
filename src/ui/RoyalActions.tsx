import { useEffect, useState } from "react";
import type { World } from "../sim/World";
import { EDICT_DEFS, type EdictId } from "../sim/systems/Edicts";
import type { DecreeEffect } from "../sim/systems/CustomDecrees";

/**
 * The "Rule" panel — the player's proactive-action surface.
 *
 * Playtest signal was "nothing I do matters" — and the root cause was
 * that the player was purely REACTIVE: they waited for decision prompts
 * and answered A/B/C. Every verb the player could initiate on their own
 * (festivals, edicts, buildings, decrees) was buried in Settings or
 * only reachable through a randomly-timed decision.
 *
 * This panel is the single front door for "things I can do right now."
 * It turns the player from spectator into ruler. All the backing
 * systems already existed — this surfaces them as active verbs in one
 * place, accessible from a prominent gold HUD button.
 *
 * Four verb groups:
 *   - Hold a Festival     (world.orderFestival)
 *   - Proclaim an Edict   (world.edicts)
 *   - Commission a Building (world.construction)
 *   - Issue a Decree      (world.customDecrees)
 *
 * Refreshes once per second so cost gates, active-edict timers, and
 * build progress stay live while open. World keeps running behind it.
 */

const DECREE_OPTIONS: Array<{ id: DecreeEffect; label: string }> = [
  { id: "favor_merchants", label: "Favour the merchants" },
  { id: "favor_scholars", label: "Favour the scholars" },
  { id: "favor_guard", label: "Favour the guard" },
  { id: "lighten_taxes", label: "Lighten the taxes" },
  { id: "fill_coffers", label: "Fill the coffers" },
];

const FESTIVAL_COST = 30;

export function RoyalActions({
  open,
  onClose,
  getWorld,
}: {
  open: boolean;
  onClose: () => void;
  getWorld: () => World | null;
}) {
  // Tick once a second so the panel reflects live gold / timers.
  const [, setTick] = useState(0);
  // Transient "done" flash per action so the player gets feedback.
  const [flash, setFlash] = useState<string | null>(null);
  // Custom-decree draft state.
  const [decreeText, setDecreeText] = useState("");
  const [decreeEffect, setDecreeEffect] = useState<DecreeEffect>("favor_merchants");

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(id);
  }, [flash]);

  if (!open) return null;
  const world = getWorld();
  if (!world) return null;

  const gold = world.economy.state.gold;
  const ironwork = world.economy.state.ironwork;
  const tomes = world.economy.state.tomes;
  const edictStatus = world.edicts.status();
  const activeBuild = world.construction.activeBuildInfo();
  const builds = world.construction.listConstructibleOptions();
  const activeDecree = world.customDecrees.active();

  function flashMsg(msg: string) {
    setFlash(msg);
  }

  return (
    <div className="royal-modal" role="dialog" aria-modal="true" aria-labelledby="royal-title" onClick={onClose}>
      <div className="royal-card" onClick={(e) => e.stopPropagation()}>
        <header className="royal-header">
          <h3 id="royal-title">⚜ Rule the kingdom</h3>
          <span className="royal-treasury" title="Royal treasury">
            ⛀ {gold}g{ironwork > 0 ? ` · ⚒ ${ironwork}` : ""}{tomes > 0 ? ` · 📖 ${tomes}` : ""}
          </span>
          <button type="button" className="royal-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <p className="royal-intro">
          You are the monarch. These are the things only you can command —
          they take effect at once, and the kingdom remembers them.
        </p>

        {flash && <div className="royal-flash">{flash}</div>}

        {/* ── Festival ─────────────────────────────────────────── */}
        <section className="royal-section">
          <div className="royal-section-head">
            <h4>Hold a festival</h4>
            <span className="royal-cost">{FESTIVAL_COST}g</span>
          </div>
          <p className="royal-desc">
            Throw the gates open. Reputation rises, and every faction warms
            to the crown for a day.
          </p>
          <button
            type="button"
            className="royal-do primary"
            disabled={gold < FESTIVAL_COST}
            onClick={() => {
              if (world.orderFestival()) flashMsg("The festival is proclaimed — the streets fill.");
            }}
          >
            {gold < FESTIVAL_COST ? "Not enough gold" : "Hold a festival"}
          </button>
        </section>

        {/* ── Edicts ───────────────────────────────────────────── */}
        <section className="royal-section">
          <div className="royal-section-head">
            <h4>Proclaim an edict</h4>
            {edictStatus.active && (
              <span className="royal-active">
                active · {edictStatus.daysLeft}d left
              </span>
            )}
          </div>
          <p className="royal-desc">
            A standing order for seven days. Only one at a time.
          </p>
          <div className="royal-grid">
            {EDICT_DEFS.map((def) => {
              const isActive = edictStatus.active === def.id;
              return (
                <button
                  key={def.id}
                  type="button"
                  className={`royal-tile${isActive ? " active" : ""}`}
                  title={def.blurb}
                  onClick={() => {
                    if (isActive) {
                      world.edicts.revoke();
                      flashMsg(`${def.label} revoked.`);
                    } else if (world.edicts.proclaim(def.id as EdictId)) {
                      flashMsg(`${def.label} proclaimed.`);
                    }
                  }}
                >
                  <span className="royal-tile-label">{def.label.replace(/^Edict of (an )?/, "")}</span>
                  <span className="royal-tile-blurb">{def.blurb}</span>
                  {isActive && <span className="royal-tile-tag">active — tap to revoke</span>}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Buildings ────────────────────────────────────────── */}
        <section className="royal-section">
          <div className="royal-section-head">
            <h4>Commission a building</h4>
            {activeBuild && (
              <span className="royal-active">
                building {activeBuild.label} · {activeBuild.daysLeft}d
              </span>
            )}
          </div>
          {activeBuild ? (
            <p className="royal-desc">
              Masons are already at work on the {activeBuild.label.toLowerCase()}.
              Wait for it to finish before commissioning another.
            </p>
          ) : (
            <div className="royal-grid">
              {builds.map((b) => {
                const cost =
                  `${b.goldCost}g` +
                  (b.ironworkCost ? ` · ${b.ironworkCost}⚒` : "") +
                  (b.tomeCost ? ` · ${b.tomeCost}📖` : "");
                return (
                  <button
                    key={b.kind}
                    type="button"
                    className="royal-tile"
                    disabled={!b.affordable}
                    title={b.pitch}
                    onClick={() => {
                      if (world.construction.startBuildByKind(b.kind)) {
                        flashMsg(`Construction begins on the ${b.label.toLowerCase()}.`);
                      }
                    }}
                  >
                    <span className="royal-tile-label">{b.label}</span>
                    <span className="royal-tile-blurb">{cost} · {b.buildDays}d</span>
                    {!b.affordable && <span className="royal-tile-tag dim">can't afford yet</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Custom Decree ────────────────────────────────────── */}
        <section className="royal-section">
          <div className="royal-section-head">
            <h4>Issue a decree</h4>
            {activeDecree && (
              <span className="royal-active">in force · {activeDecree.daysLeft}d left</span>
            )}
          </div>
          {activeDecree ? (
            <p className="royal-desc">
              “{activeDecree.text}” — your decree stands for {activeDecree.daysLeft} more days.
            </p>
          ) : (
            <>
              <p className="royal-desc">
                Write a law in your own words and choose what it does. It holds
                for fourteen days.
              </p>
              <input
                type="text"
                className="royal-input"
                maxLength={140}
                placeholder="e.g. Let every hearth burn bright through winter…"
                value={decreeText}
                onChange={(e) => setDecreeText(e.target.value)}
              />
              <div className="royal-decree-row">
                <select
                  className="royal-select"
                  value={decreeEffect}
                  onChange={(e) => setDecreeEffect(e.target.value as DecreeEffect)}
                >
                  {DECREE_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="royal-do primary"
                  disabled={decreeText.trim().length === 0}
                  onClick={() => {
                    if (world.customDecrees.proclaim(decreeText, decreeEffect)) {
                      flashMsg("Your decree is proclaimed across the kingdom.");
                      setDecreeText("");
                    }
                  }}
                >
                  Proclaim
                </button>
              </div>
            </>
          )}
        </section>

        <p className="royal-foot">
          Appoint your court (advisor · captain · scholar) from the Stats panel.
        </p>
      </div>
    </div>
  );
}
