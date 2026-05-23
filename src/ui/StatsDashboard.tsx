import { useEffect, useState } from "react";
import { useGameStore, type CourtRole } from "../store/useGameStore";
import { Achievements } from "../sim/systems/Achievements";
import type { World } from "../sim/World";
import { CourtPicker } from "./CourtPicker";
import { Sparkline } from "./Sparkline";

/**
 * Kingdom Stats — a single-glance overview of how the kingdom is doing.
 *
 * Read-only. Pulls live numbers via interval polling rather than React
 * subscribing to every NPC change (cheaper, plenty responsive at 1 Hz).
 */
export function StatsDashboard({
  world,
  open,
  onClose,
}: {
  world: World | null;
  open: boolean;
  onClose: () => void;
}) {
  const [, setTick] = useState(0);
  const [picking, setPicking] = useState<CourtRole | null>(null);
  const identity = useGameStore((s) => s.identity);
  const achievements = useGameStore((s) => s.achievements);
  const journal = useGameStore((s) => s.journal);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [open]);

  if (!open || !world) return null;

  const allDefs = Achievements.definitions();
  const totalDefs = allDefs.length;
  const unlocked = Object.keys(achievements).length;
  const mysteriesRemaining = allDefs.filter(
    (d) => d.hidden && !achievements[d.id],
  ).length;

  const byRole: Record<string, number> = {};
  for (const n of world.npcs) {
    byRole[n.role] = (byRole[n.role] ?? 0) + 1;
  }
  const married = world.npcs.filter((n) => n.partnerId).length / 2;
  const totalAge = world.npcs.reduce((sum, n) => sum + (n.age ?? 0), 0);
  const avgAge = world.npcs.length ? totalAge / world.npcs.length : 0;
  const econ = world.economy.state;

  return (
    <aside className="stats-panel">
      <div className="stats-header">
        <span>Kingdom of {identity?.kingdomName ?? "—"}</span>
        <button onClick={onClose} title="Close">×</button>
      </div>
      <div className="stats-body">
        <section>
          <h3>Reign</h3>
          <div className="stats-grid">
            <Stat label="Day" value={world.state.day} />
            <Stat label="Year" value={world.state.year} />
            <Stat label="Season" value={world.state.season} />
            <Stat label="Weather" value={world.state.weather} />
          </div>
          <div className="stats-grid stats-grid-2" style={{ marginTop: 6 }}>
            <Stat label="Generation" value={world.succession.state.generation} />
            <Stat label="Reign (days)" value={world.state.day - world.succession.state.reignStartDay} />
          </div>
        </section>

        <section>
          <h3>People · {world.npcs.length}</h3>
          <div className="stats-grid">
            {Object.entries(byRole).map(([role, n]) => (
              <Stat key={role} label={role} value={n} />
            ))}
          </div>
          <div className="stats-grid stats-grid-2">
            <Stat label="Couples" value={Math.floor(married)} />
            <Stat label="Avg age" value={`${avgAge.toFixed(1)}y`} />
          </div>
        </section>

        <section>
          <h3>Economy</h3>
          <div className="stats-grid">
            <Stat label="Gold" value={Math.floor(econ.gold)} />
            <Stat label="Ironwork" value={Math.floor(econ.ironwork)} />
            <Stat label="Ore" value={Math.floor(econ.ore)} />
            <Stat label="Tomes" value={Math.floor(econ.tomes)} />
          </div>
          <div className="stats-grid stats-grid-2" style={{ marginTop: 6 }}>
            <Stat label="Vault artifacts" value={world.treasury.count()} />
            {world.construction.active && (
              <Stat
                label="Building"
                value={`${world.construction.active.kind} (${Math.max(0, world.construction.active.finishesOnDay - world.state.day)}d)`}
              />
            )}
          </div>
        </section>

        <section>
          <h3>Court</h3>
          <CourtSlot
            label="Royal Advisor"
            role="advisor"
            world={world}
            effect="+90s on royal decisions"
            active={world.courtEffects.advisorSeated}
            onPick={() => setPicking("advisor")}
          />
          <CourtSlot
            label="Captain of the Guard"
            role="captain"
            world={world}
            effect="storms passed less often"
            active={world.courtEffects.captainSeated}
            onPick={() => setPicking("captain")}
          />
          <CourtSlot
            label="Court Scholar"
            role="scholar"
            world={world}
            effect="+50% tome production"
            active={world.courtEffects.scholarSeated}
            onPick={() => setPicking("scholar")}
          />
        </section>

        <section>
          <h3>History</h3>
          <div className="history-grid">
            <Sparkline
              data={world.history.series("population")}
              label="population"
              stroke="#60a5fa"
              fill="rgba(96, 165, 250, 0.18)"
            />
            <Sparkline
              data={world.history.series("gold")}
              label="gold"
              stroke="#fbbf24"
              fill="rgba(251, 191, 36, 0.18)"
            />
            <Sparkline
              data={world.history.series("vault")}
              label="vault"
              stroke="#a78bfa"
              fill="rgba(167, 139, 250, 0.18)"
            />
            <Sparkline
              data={world.history.series("tomes")}
              label="tomes"
              stroke="#2dd4bf"
              fill="rgba(45, 212, 191, 0.18)"
            />
            <Sparkline
              data={world.history.series("reputation")}
              label="reputation"
              stroke="#f472b6"
              fill="rgba(244, 114, 182, 0.18)"
            />
          </div>
          {world.history.snapshots.length < 2 && (
            <div className="muted" style={{ fontStyle: "italic", fontSize: 11, marginTop: 4 }}>
              The chronicle is too young for graphs. Come back in a few days.
            </div>
          )}
        </section>

        <section>
          <h3>Aspirations</h3>
          {world.aspirations.getActive(world).map((asp) => (
            <div key={asp.id} className="aspiration">
              <div className="aspiration-head">
                <span className="aspiration-title">{asp.title}</span>
                <span className="aspiration-pct">
                  {Math.floor(asp.progress * 100)}%
                </span>
              </div>
              <div className="aspiration-desc">{asp.description}</div>
              <div className="aspiration-bar">
                <div
                  className="aspiration-bar-fill"
                  style={{ width: `${Math.floor(asp.progress * 100)}%` }}
                />
              </div>
            </div>
          ))}
          {world.aspirations.active.length === 0 && (
            <div className="muted" style={{ fontStyle: "italic", fontSize: 11 }}>
              All aspirations fulfilled. The kingdom rests easy.
            </div>
          )}
        </section>

        <section>
          <h3>Chronicle</h3>
          <div className="stats-grid stats-grid-2">
            <Stat label="Journal" value={`${journal.length} entries`} />
            <Stat
              label="Achievements"
              value={`${unlocked} / ${totalDefs}`}
            />
          </div>
          {mysteriesRemaining > 0 && (
            <div className="mysteries-hint" title="There are hidden achievements you haven't unlocked yet.">
              ✦ {mysteriesRemaining} myster{mysteriesRemaining === 1 ? "y" : "ies"} remain
            </div>
          )}
          <div className="achievement-grid">
            {Achievements.definitions().map((def) => {
              const got = !!achievements[def.id];
              const secret = def.hidden && !got;
              const cls = secret
                ? "ach-badge hidden"
                : "ach-badge " + (got ? "earned" : "locked");
              const tip = got
                ? def.description
                : secret
                  ? "Hidden — unlock to reveal"
                  : "Locked";
              return (
                <div key={def.id} className={cls} title={tip}>
                  <div className="ach-badge-icon">
                    {got ? "✦" : secret ? "?" : "·"}
                  </div>
                  <div className="ach-badge-name">
                    {secret ? "???" : def.title}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      {picking && (
        <CourtPicker role={picking} world={world} onClose={() => setPicking(null)} />
      )}
    </aside>
  );
}

function CourtSlot({
  label,
  role,
  world,
  effect,
  active,
  onPick,
}: {
  label: string;
  role: CourtRole;
  world: World;
  effect: string;
  active: boolean;
  onPick: () => void;
}) {
  const identity = useGameStore((s) => s.identity);
  const id = identity?.court?.[role];
  const npc = id ? world.npcs.find((n) => n.id === id) : null;
  return (
    <div className="court-slot">
      <div className="court-slot-label">
        {label}
        <span className={"court-effect " + (active ? "on" : "off")} title={
          active ? `Active: ${effect}` : `Vacant: appoint someone to grant ${effect}`
        }>
          {effect}
        </span>
      </div>
      <button onClick={onPick}>
        {npc ? npc.name : <span className="muted">— vacant —</span>}
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
