/**
 * VaultPanel — a full artifact browser for the royal vault.
 *
 * Shows every artifact with its full provenance string, grouped by kind,
 * with kind-filter tabs. Opens from the castle structure inspector or HUD.
 * This is the payoff for all the provenance enrichment work — players can
 * finally read the story of every item they've accumulated.
 */

import { useState, useMemo } from "react";
import type { World } from "../sim/World";
import type { ArtifactKind } from "../sim/systems/Treasury";
import { kindGlyph } from "../sim/systems/Treasury";

const KIND_LABEL: Record<ArtifactKind, string> = {
  scroll:   "Scrolls",
  relic:    "Relics",
  gem:      "Gems",
  tome:     "Tomes",
  weapon:   "Weapons",
  treasure: "Treasures",
};

const KIND_ORDER: ArtifactKind[] = ["weapon", "relic", "scroll", "tome", "gem", "treasure"];

export function VaultPanel({
  open,
  onClose,
  getWorld,
}: {
  open: boolean;
  onClose: () => void;
  getWorld: () => World | null;
}) {
  const [activeKind, setActiveKind] = useState<ArtifactKind | "all">("all");

  const artifacts = useMemo(() => {
    if (!open) return [];
    return getWorld()?.treasury.artifacts ?? [];
  }, [open, getWorld]);

  const counts = useMemo(() => {
    const c: Partial<Record<ArtifactKind, number>> = {};
    for (const a of artifacts) c[a.kind] = (c[a.kind] ?? 0) + 1;
    return c;
  }, [artifacts]);

  const filtered = useMemo(
    () => activeKind === "all" ? [...artifacts].reverse() : [...artifacts].filter((a) => a.kind === activeKind).reverse(),
    [artifacts, activeKind],
  );

  if (!open) return null;

  return (
    <>
      <div className="vault-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="vault-panel" role="complementary" aria-label="Royal Vault">
        <div className="vault-header">
          <div>
            <h2 className="vault-title">Royal Vault</h2>
            <p className="vault-subtitle">{artifacts.length} artifact{artifacts.length !== 1 ? "s" : ""} accumulated across all reigns</p>
          </div>
          <button className="vault-close" onClick={onClose} aria-label="Close vault">×</button>
        </div>

        {/* Kind filter tabs */}
        <div className="vault-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeKind === "all"}
            className={`vault-tab ${activeKind === "all" ? "active" : ""}`}
            onClick={() => setActiveKind("all")}
          >
            All <span className="vault-tab-count">{artifacts.length}</span>
          </button>
          {KIND_ORDER.filter((k) => counts[k]).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={activeKind === k}
              className={`vault-tab vault-tab-${k} ${activeKind === k ? "active" : ""}`}
              onClick={() => setActiveKind(k)}
            >
              {kindGlyph(k)} {KIND_LABEL[k]}
              <span className="vault-tab-count">{counts[k]}</span>
            </button>
          ))}
        </div>

        {/* Artifact list */}
        <div className="vault-body">
          {filtered.length === 0 ? (
            <p className="vault-empty">
              {artifacts.length === 0
                ? "The vault is empty. It will fill in time."
                : "No artifacts of this kind yet."}
            </p>
          ) : (
            <ul className="vault-list">
              {filtered.map((a) => (
                <li key={a.id} className={`vault-item vault-item-${a.kind}`}>
                  <span className="vault-item-glyph" aria-hidden="true">
                    {kindGlyph(a.kind)}
                  </span>
                  <div className="vault-item-body">
                    <span className="vault-item-name">{a.name}</span>
                    {a.origin && (
                      <span className="vault-item-origin">{a.origin}</span>
                    )}
                  </div>
                  <span className="vault-item-date">
                    Y{a.obtainedOnYear}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="vault-footer">
          <small>Items listed newest first</small>
        </div>
      </aside>
    </>
  );
}
