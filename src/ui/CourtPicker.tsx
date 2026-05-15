import { useEffect, useState } from "react";
import { useGameStore, type CourtRole } from "../store/useGameStore";
import type { World } from "../sim/World";

/**
 * Modal that lets the player appoint an NPC to a court role.
 * The list is filtered by role suitability (e.g. only scholars can be Court Scholar).
 */
export function CourtPicker({
  role,
  world,
  onClose,
}: {
  role: CourtRole;
  world: World;
  onClose: () => void;
}) {
  const identity = useGameStore((s) => s.identity);
  const setIdentity = useGameStore((s) => s.setIdentity);
  const [filter, setFilter] = useState("");

  // Light re-render so NPCs added/removed mid-pick refresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1500);
    return () => clearInterval(id);
  }, []);

  if (!identity) return null;

  const eligible = world.npcs.filter((n) => {
    if (n.role === "monarch") return false;
    if (role === "captain" && n.role !== "guard") return false;
    if (role === "scholar" && n.role !== "scholar") return false;
    if (filter && !(n.name ?? "").toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const titleByRole: Record<CourtRole, string> = {
    advisor: "Royal Advisor",
    captain: "Captain of the Guard",
    scholar: "Court Scholar",
  };

  const appoint = (npcId: string | null) => {
    const court = { ...(identity.court ?? {}) };
    if (npcId) court[role] = npcId;
    else delete court[role];
    setIdentity({ ...identity, court });
    // Write a journal entry for the appointment.
    if (npcId) {
      const npc = world.npcs.find((n) => n.id === npcId);
      if (npc) {
        world.journal.write(
          `${npc.name} was named ${titleByRole[role]} of the court.`,
          "milestone",
        );
      }
    }
    onClose();
  };

  return (
    <div className="court-picker-overlay" onClick={onClose}>
      <div className="court-picker-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Appoint a {titleByRole[role]}</h2>
          <button onClick={onClose}>×</button>
        </header>

        <input
          type="text"
          placeholder="Search by name…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
        />

        {identity.court?.[role] && (
          <button
            type="button"
            className="dismiss-current"
            onClick={() => appoint(null)}
          >
            ✕ Dismiss current {titleByRole[role].toLowerCase()}
          </button>
        )}

        <ul className="court-candidates">
          {eligible.length === 0 ? (
            <li className="muted">
              {role === "captain" ? "No guards in the kingdom yet." :
               role === "scholar" ? "No scholars in the kingdom yet." :
               "No candidates."}
            </li>
          ) : (
            eligible.slice(0, 30).map((n) => {
              const current = identity.court?.[role] === n.id;
              return (
                <li
                  key={n.id}
                  className={current ? "selected" : ""}
                  onClick={() => appoint(n.id)}
                >
                  <span className="name">{n.name ?? n.id}</span>
                  <span className="meta">{n.role} · age {Math.floor(n.age ?? 0)}</span>
                  {current && <span className="current">current</span>}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
