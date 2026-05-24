import { useEffect } from "react";
import type { AudioEngine } from "../engine/Audio";
import { useGameStore } from "../store/useGameStore";

/**
 * Global UI-sound delegator. Mount once near the root with a reference
 * to the AudioEngine; we attach pointerover + click listeners to the
 * document and play the FF6-style menu blip / confirm chord whenever
 * the user interacts with a `<button>` inside a panel.
 *
 * Why delegation instead of wrapping every button:
 *   - 100+ button call-sites; touching them all would be churn
 *   - Future buttons inherit the behaviour automatically
 *   - Single point of throttling + opt-out
 *
 * Opt-out: any element with `data-no-sound` (or inside one) is skipped.
 * The game-canvas drag handles, photo-mode controls, etc. set that
 * attribute so we don't blip 60×/sec during interactions.
 *
 * Audio-volume aware: respects the master volume slider in Settings
 * via the existing `setVolume` plumbing; we never make our own gain.
 */
export function UiSound({ getAudio }: { getAudio: () => AudioEngine | null }) {
  const audioVolume = useGameStore((s) => s.settings.audioVolume);
  const padEnabled = useGameStore((s) => s.settings.padEnabled);

  useEffect(() => {
    // Single muted gate: audio volume at 0 → no blips. Lets the player
    // disable UI sound without touching pad/melody by zeroing the
    // master slider. The padEnabled flag is a *secondary* mute that
    // also disables blips — if you've turned off ambient sound, you
    // probably don't want chirpy UI sounds either.
    if (audioVolume <= 0 || !padEnabled) return;

    /** Last-fired timestamp per source kind, so a hover storm doesn't
     *  fire 30 blips in a frame. 80ms is short enough to feel
     *  responsive but long enough to dedup. */
    let lastBlipAt = 0;
    const HOVER_THROTTLE_MS = 80;

    function shouldSkip(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return true;
      // Walk up looking for an opt-out marker.
      const optOut = target.closest("[data-no-sound]");
      if (optOut) return true;
      // Only react to buttons + anchor-buttons. Inputs/textareas/etc.
      // would be noisy.
      const btn = target.closest("button, [role='button']");
      return !btn;
    }

    function onPointerOver(e: PointerEvent) {
      if (shouldSkip(e.target)) return;
      const now = performance.now();
      if (now - lastBlipAt < HOVER_THROTTLE_MS) return;
      lastBlipAt = now;
      getAudio()?.playMenuBlip();
    }

    function onClick(e: MouseEvent) {
      if (shouldSkip(e.target)) return;
      // Confirm is the louder commit chord — distinct from the hover
      // blip so the ear can tell "navigated" vs "selected".
      getAudio()?.playMenuConfirm();
    }

    // pointerover gives us both mouse + touch + pen with a single
    // listener; capture phase so children that stopPropagation still
    // surface to us.
    document.addEventListener("pointerover", onPointerOver, { capture: true });
    document.addEventListener("click", onClick, { capture: true });
    return () => {
      document.removeEventListener("pointerover", onPointerOver, { capture: true });
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, [audioVolume, padEnabled, getAudio]);

  return null;
}
