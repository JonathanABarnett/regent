/**
 * Achievement Toast — improved version.
 *
 * Upgrades from the original single-icon version:
 *   - Kind-specific icon based on achievement id category
 *   - Richer slide-in animation (from bottom-right)
 *   - "View in journal" button that opens the journal panel
 *   - Auto-dismiss after 11 seconds; click anywhere to dismiss early
 *   - Hidden achievements show "???" title until revealed
 */

import { useEffect, useRef } from "react";
import { useGameStore } from "../store/useGameStore";

/** Map achievement id prefixes/keywords to a visual icon. */
function achievementIcon(id: string): string {
  if (id.startsWith("hidden_")) return "✧";
  if (id.includes("dynasty") || id.includes("generation") || id.includes("succession")) return "♛";
  if (id.includes("marriage") || id.includes("birth") || id.includes("life") || id.includes("couple")) return "❤";
  if (id.includes("vault") || id.includes("artifact") || id.includes("relic")) return "◆";
  if (id.includes("year") || id.includes("day")) return "⏳";
  if (id.includes("pop") || id.includes("capital")) return "⚑";
  if (id.includes("usurper") || id.includes("uprising") || id.includes("repel")) return "⚔";
  if (id.includes("building") || id.includes("construct") || id.includes("tower")) return "⌂";
  if (id.includes("forge") || id.includes("smith") || id.includes("iron")) return "🔥";
  if (id.includes("scholar") || id.includes("library") || id.includes("tome")) return "📖";
  if (id.includes("threat") || id.includes("guard") || id.includes("beast")) return "🛡";
  if (id.includes("beloved") || id.includes("reputation")) return "☆";
  if (id.includes("courier") || id.includes("message")) return "✉";
  return "✦";
}

/** Category-keyed CSS class for the toast border/glow color. */
function toastCategory(id: string): string {
  if (id.startsWith("hidden_")) return "hidden";
  if (id.includes("dynasty") || id.includes("succession")) return "dynasty";
  if (id.includes("usurper") || id.includes("uprising") || id.includes("repel")) return "combat";
  if (id.includes("marriage") || id.includes("birth") || id.includes("life")) return "life";
  if (id.includes("vault") || id.includes("artifact")) return "vault";
  if (id.includes("year") || id.includes("day")) return "time";
  return "default";
}

export function AchievementToast({
  onOpenJournal,
}: {
  onOpenJournal?: () => void;
}) {
  const toast = useGameStore((s) => s.achievementToast);
  const dismiss = useGameStore((s) => s.dismissAchievementToast);
  const tourActive = useGameStore((s) => s.tourActive);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss after 11 seconds. Was 6s — playtest feedback was that
  // the first achievement ("First Dispatch", which fires the instant a
  // courier rides out at founding) vanished while the player was still
  // reading the Welcome Petition and figuring out the world. 11s gives
  // a comfortable read; it still auto-clears so later-game achievements
  // don't pile up. Click anywhere / the × to dismiss early.
  useEffect(() => {
    if (!toast) return;
    // While the guided tour is paused over the scene, don't run the
    // dismiss timer — the toast would otherwise vanish behind the
    // frozen tutorial. It resumes counting once the tour closes.
    if (tourActive) return;
    timerRef.current = setTimeout(dismiss, 11000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast, dismiss, tourActive]);

  // While the guided tour is on screen, don't render at all — the founding
  // achievement ("First Dispatch") fires seconds before the tour opens and
  // would otherwise sit frozen in the corner through all eight steps,
  // competing with the spotlight. State is kept; the toast appears (with a
  // fresh dismiss timer) the moment the tour closes.
  if (!toast || tourActive) return null;

  const isHidden = toast.id.startsWith("hidden_");
  const icon = achievementIcon(toast.id);
  const category = toastCategory(toast.id);

  const handleViewInJournal = (e: React.MouseEvent) => {
    e.stopPropagation();
    dismiss();
    onOpenJournal?.();
  };

  return (
    <div
      className={`achievement-toast ach-cat-${category}`}
      onClick={dismiss}
      role="status"
      aria-live="polite"
      aria-label={`Achievement unlocked: ${toast.title}`}
    >
      <div className="ach-icon" aria-hidden="true">{icon}</div>
      <div className="ach-body">
        <div className="ach-label">
          {isHidden ? "Secret achievement unlocked" : "Achievement unlocked"}
        </div>
        <div className="ach-title">{toast.title}</div>
        <div className="ach-desc">{toast.description}</div>
        {onOpenJournal && (
          <button
            className="ach-journal-btn"
            onClick={handleViewInJournal}
            title="View this moment in the kingdom journal"
          >
            View in journal →
          </button>
        )}
      </div>
      <button
        className="ach-dismiss"
        onClick={dismiss}
        aria-label="Dismiss achievement"
        tabIndex={-1}
      >
        ×
      </button>
    </div>
  );
}
