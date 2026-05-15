import { useEffect, useState } from "react";
import {
  readArchive,
  clearArchive,
  type ArchivedKingdom,
} from "../sim/KingdomArchive";

/**
 * Past Kingdoms panel — a read-only browser of archived kingdoms.
 *
 * Opens from the title screen if any archived kingdoms exist. Each row is
 * collapsible; expanded view shows the last ~12 milestone journal entries
 * for that kingdom plus its final census numbers.
 *
 * No "resume" button — past kingdoms are intentionally artifacts, not
 * resumable saves. The point is to honor what was, not let the player
 * rewind it.
 */
export function PastKingdoms({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [archive, setArchive] = useState<ArchivedKingdom[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) setArchive(readArchive());
  }, [open]);

  if (!open) return null;

  const handleClear = () => {
    if (
      confirm(
        "Erase the archive of past kingdoms? This is permanent — each entry is just a chronicle summary, but they're gone for good once you confirm.",
      )
    ) {
      clearArchive();
      setArchive([]);
    }
  };

  return (
    <div
      className="past-kingdoms-overlay"
      onClick={onClose}
      role="dialog"
      aria-label="Past kingdoms"
      aria-modal="true"
    >
      <div className="past-kingdoms-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Past kingdoms</h2>
          <div className="past-kingdoms-actions">
            {archive.length > 0 && (
              <button
                type="button"
                className="ghost"
                onClick={handleClear}
                title="Clear the archive"
              >
                Clear all
              </button>
            )}
            <button type="button" onClick={onClose} title="Close (Esc)">
              ×
            </button>
          </div>
        </header>

        {archive.length === 0 ? (
          <p className="past-kingdoms-empty">
            No kingdoms have been archived yet. When you found a new kingdom, the
            previous one's chronicle is preserved here.
          </p>
        ) : (
          <ul className="past-kingdoms-list">
            {archive.map((k) => {
              const isExpanded = expandedId === k.archivedAt;
              const archivedDate = safeDate(k.archivedAt);
              const foundedDate = safeDate(new Date(k.foundedAtMs).toISOString());
              return (
                <li
                  key={k.archivedAt}
                  className={"past-kingdom" + (isExpanded ? " expanded" : "")}
                >
                  <button
                    type="button"
                    className="past-kingdom-head"
                    onClick={() => setExpandedId(isExpanded ? null : k.archivedAt)}
                    aria-expanded={isExpanded}
                  >
                    <div className="past-kingdom-title">
                      <strong>{k.kingdomName}</strong>
                      <span className="past-kingdom-monarch">
                        under {k.monarchName}
                      </span>
                    </div>
                    <div className="past-kingdom-summary">
                      <span>{k.totalDays} days · Y{k.yearsReigned}</span>
                      <span>·</span>
                      <span>{k.generations} gen.</span>
                      <span>·</span>
                      <span>{k.population} souls</span>
                      <span>·</span>
                      <span>vault {k.vault}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="past-kingdom-body">
                      <div className="past-kingdom-meta">
                        <div>Founded {foundedDate}</div>
                        <div>Archived {archivedDate}</div>
                      </div>
                      <h4>Milestones</h4>
                      {k.milestones.length === 0 ? (
                        <p className="muted">
                          No milestone entries were recorded for this kingdom.
                        </p>
                      ) : (
                        <ol className="past-kingdom-milestones">
                          {k.milestones.map((m, i) => (
                            <li key={i}>
                              <span className="past-kingdom-when">
                                Y{m.year} D{m.day}
                              </span>
                              <span className="past-kingdom-text">{m.text}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function safeDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}
