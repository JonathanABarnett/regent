/**
 * NPCProfilePanel — a slide-in drawer showing the full life story of a single NPC.
 *
 * Triggered by:
 *   1. Clicking an NPC sprite in the world (via NpcInspect's click handler)
 *   2. Clicking a highlighted NPC name in the JournalPanel
 *
 * Shows:
 *   - Role + trait badge (color-coded by role)
 *   - Age and time in the kingdom
 *   - Home / workplace names
 *   - Backstory (the one-liner generated at spawn)
 *   - Family: partner (clickable), children (clickable), parents (clickable)
 *   - Recent journal mentions (up to 5 entries, searchable in the full journal)
 *   - "Find on map" button that snaps the camera to their current location
 *
 * The panel reads the live world on render so it's always fresh. It does NOT
 * subscribe to Zustand world-stats — it gets the world via a ref callback
 * so there's no stale-closure risk.
 */

import { useMemo, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import type { World } from "../sim/World";
import type { NPC } from "../sim/types";
import { backstoryFor } from "../sim/systems/Backstories";
import { epithetFor } from "../sim/systems/Traits";

// ── Role cosmetics ──────────────────────────────────────────────────────────

const ROLE_COLOR: Record<NPC["role"], string> = {
  monarch: "#c8a84b",
  scholar: "#5b8dd9",
  blacksmith: "#d97b3a",
  miner: "#a07040",
  guard: "#4b9b6e",
  courier: "#9d68c4",
  villager: "#8a9aaa",
};

const ROLE_LABEL: Record<NPC["role"], string> = {
  monarch: "Monarch",
  scholar: "Scholar",
  blacksmith: "Blacksmith",
  miner: "Miner",
  guard: "Guard",
  courier: "Courier",
  villager: "Villager",
};

// ── Component ───────────────────────────────────────────────────────────────

export function NPCProfilePanel({
  npcId,
  getWorld,
  onClose,
  onSelectNpc,
  onNavigateToNpc,
}: {
  npcId: string | null;
  getWorld: () => World | null;
  onClose: () => void;
  onSelectNpc: (id: string) => void;
  onNavigateToNpc?: (npc: NPC) => void;
}) {
  const journal = useGameStore((s) => s.journal);
  const worldStats = useGameStore((s) => s.worldStats);
  // Bump to re-render after a blessing (the world mutates in place).
  const [, setBlessRev] = useState(0);

  // Derive all NPC data from the live world on every render.
  // This is intentionally NOT memoized — the world mutates in place and
  // the panel should always show fresh state when re-opened.
  const world = getWorld();
  const npc = world?.npcs.find((n) => n.id === npcId) ?? null;

  const partner = useMemo(
    () => (npc?.partnerId && world ? world.npcs.find((n) => n.id === npc.partnerId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [npcId, worldStats.day],
  );

  const children = useMemo(
    () => (npc && world ? world.npcs.filter((n) => n.parentIds?.includes(npc.id)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [npcId, worldStats.day],
  );

  const parents = useMemo(() => {
    if (!npc?.parentIds || !world) return [];
    return npc.parentIds.map((pid) => world.npcs.find((n) => n.id === pid)).filter(Boolean) as NPC[];
  }, // eslint-disable-next-line react-hooks/exhaustive-deps
  [npcId, worldStats.day]);

  // Journal entries that mention this NPC's name — most recent 5.
  const mentions = useMemo(() => {
    if (!npc?.name) return [];
    const name = npc.name;
    return journal
      .filter((e) => e.text.includes(name))
      .slice(-5)
      .reverse();
  }, [npc, journal]);

  // Home and workplace names — prefer the structure's proper name,
  // fall back to a humanized id, fall back to "the kingdom".
  const homeName = useMemo(() => {
    if (!world || !npc) return "the kingdom";
    const s = world.map.structures.find((st) => st.id === npc.homeId);
    return s?.name ?? prettify(npc.homeId);
  }, // eslint-disable-next-line react-hooks/exhaustive-deps
  [npcId]);

  const workName = useMemo(() => {
    if (!world || !npc) return "the kingdom";
    const s = world.map.structures.find((st) => st.id === npc.workId);
    return s?.name ?? prettify(npc.workId);
  }, // eslint-disable-next-line react-hooks/exhaustive-deps
  [npcId]);

  if (!npcId || !npc) return null;

  const age = Math.floor(npc.age ?? 0);
  const ageYears = (age / 90).toFixed(1); // 90 in-world days ≈ 1 year
  const roleColor = ROLE_COLOR[npc.role] ?? "#8a9aaa";
  const roleLabel = ROLE_LABEL[npc.role] ?? npc.role;
  const traitLabel = npc.trait
    ? `${epithetFor(npc.trait, npc.seed)} (${npc.trait})`
    : null;
  const backstory = backstoryFor(npc.name ?? npc.id, npc.seed);

  const isMonarch = npc.role === "monarch";

  return (
    <>
      {/* backdrop */}
      <div className="npc-profile-backdrop" onClick={onClose} aria-hidden="true" />

      <aside className="npc-profile-panel" role="complementary" aria-label={`Profile: ${npc.name}`}>
        {/* ── Header ── */}
        <div className="npc-profile-header" style={{ borderColor: roleColor }}>
          {/* Role avatar */}
          <div
            className="npc-profile-avatar"
            style={{ background: roleColor + "22", borderColor: roleColor }}
            title={roleLabel}
            aria-label={roleLabel}
          >
            <span className="npc-profile-avatar-initial" style={{ color: roleColor }}>
              {(npc.name ?? roleLabel).charAt(0).toUpperCase()}
            </span>
            {isMonarch && <span className="npc-profile-crown" aria-label="Monarch">♛</span>}
          </div>

          <div className="npc-profile-title">
            <h2 className="npc-profile-name">{npc.name ?? "(unnamed)"}</h2>
            <div className="npc-profile-badges">
              <span className="npc-role-badge" style={{ background: roleColor + "33", color: roleColor }}>
                {roleLabel}
              </span>
              {traitLabel && (
                <span className="npc-trait-badge">{traitLabel}</span>
              )}
            </div>
            <div className="npc-profile-age">
              Age {age} in-world days{age > 0 ? ` · ~${ageYears} yrs` : ""}
            </div>
          </div>

          <button className="npc-profile-close" onClick={onClose} aria-label="Close profile">×</button>
        </div>

        {/* ── Body ── */}
        <div className="npc-profile-body">
          {/* Backstory */}
          <p className="npc-profile-backstory">"{backstory}"</p>

          {/* Location */}
          <section className="npc-profile-section">
            <h3>Where they live</h3>
            <div className="npc-profile-locations">
              <span>🏠 {homeName}</span>
              {npc.workId !== npc.homeId && (
                <span>⚒ {workName}</span>
              )}
            </div>
          </section>

          {/* Family */}
          {(partner || children.length > 0 || parents.length > 0) && (
            <section className="npc-profile-section">
              <h3>Family</h3>
              <div className="npc-profile-family">
                {parents.length > 0 && (
                  <div className="npc-family-row">
                    <span className="npc-family-label">Child of</span>
                    <span className="npc-family-names">
                      {parents.map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && " and "}
                          <button
                            className="npc-name-link"
                            onClick={() => onSelectNpc(p.id)}
                            title={`View ${p.name}'s profile`}
                          >
                            {p.name}
                          </button>
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                {partner && (
                  <div className="npc-family-row">
                    <span className="npc-family-label">Wed to</span>
                    <button
                      className="npc-name-link"
                      onClick={() => onSelectNpc(partner.id)}
                      title={`View ${partner.name}'s profile`}
                    >
                      {partner.name}
                    </button>
                  </div>
                )}
                {children.length > 0 && (
                  <div className="npc-family-row">
                    <span className="npc-family-label">
                      {children.length === 1 ? "Child" : `${children.length} children`}
                    </span>
                    <span className="npc-family-names">
                      {children.map((c, i) => (
                        <span key={c.id}>
                          {i > 0 && ", "}
                          <button
                            className="npc-name-link"
                            onClick={() => onSelectNpc(c.id)}
                            title={`View ${c.name}'s profile`}
                          >
                            {c.name}
                          </button>
                        </span>
                      ))}
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Journal mentions */}
          {mentions.length > 0 && (
            <section className="npc-profile-section">
              <h3>In the chronicle</h3>
              <ul className="npc-profile-mentions">
                {mentions.map((e) => (
                  <li key={e.id} className={`npc-mention kind-${e.kind}`}>
                    <span className="npc-mention-day">
                      Day {e.day}, Y{e.year}
                    </span>
                    <span className="npc-mention-text">{e.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {mentions.length === 0 && (
            <section className="npc-profile-section">
              <p className="npc-profile-empty">
                {npc.name} has not yet appeared in the chronicle.
              </p>
            </section>
          )}
        </div>

        {/* ── Footer ── */}
        {onNavigateToNpc && (
          <div className="npc-profile-footer">
            {world && npc.role !== "monarch" && (
              world.isBlessedToday(npc.id) ? (
                <button className="npc-bless-btn blessed" disabled>
                  💛 Blessed today
                </button>
              ) : (
                <button
                  className="npc-bless-btn"
                  disabled={world.favorsRemainingToday() === 0}
                  onClick={() => {
                    const r = world.blessNpc(npc.id);
                    if (r.ok) setBlessRev((v) => v + 1);
                  }}
                  title={
                    world.favorsRemainingToday() > 0
                      ? `Grant the crown's favor — a small kindness they'll remember (${world.favorsRemainingToday()} left today)`
                      : "The crown's favors are spent for today — more at dawn"
                  }
                >
                  🙏 Bless ({world.favorsRemainingToday()} left today)
                </button>
              )
            )}
            <button
              className="npc-find-btn"
              onClick={() => onNavigateToNpc(npc)}
              title="Snap the camera to this NPC's location"
            >
              📍 Find on map
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function prettify(id: string): string {
  if (!id) return "the kingdom";
  return id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " ");
}
