import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import type { World } from "../sim/World";

/**
 * Drip hints — the second wave of teaching.
 *
 * The guided tour covers the core loop, but cramming every feature into
 * it would bury all of them. Instead, the features a new player won't
 * find on their own (blessing villagers, petting the pet, the reign-style
 * dial, ambient mode) arrive as small one-time hint cards, ONE at a time,
 * spaced minutes apart, and only when the screen is calm:
 *
 *   - never during the tour, the Steward's Report, or pre-kingdom flow
 *   - never while a decision card is on screen (don't compete with a
 *     countdown)
 *   - never in a hidden tab
 *
 * Each hint shows once per install (localStorage), auto-dismisses after
 * 45 s, and can be dismissed with "Got it".
 */

interface DripHint {
  id: string;
  /** Real minutes after the session reaches a founded kingdom. */
  afterMin: number;
  icon: string;
  text: (world: World | null) => string | null; // null → skip (condition unmet)
}

const HINTS: DripHint[] = [
  {
    id: "bless",
    afterMin: 2,
    icon: "🙏",
    text: () =>
      "The crown has 3 blessings a day. Click any villager, then Bless — they remember.",
  },
  {
    id: "pet",
    afterMin: 5,
    icon: "🐾",
    text: (w) => {
      const pet = w?.pets[0];
      return pet ? `${pet.name} follows the monarch around. Click them sometime.` : null;
    },
  },
  {
    id: "reign",
    afterMin: 9,
    icon: "⚖",
    text: () =>
      "Too many petitions — or too few? Settings → Reign style tunes how often the court asks for you.",
  },
  {
    id: "ambient",
    afterMin: 13,
    icon: "🪟",
    text: () =>
      "documentPictureInPicture" in window
        ? "Keep the kingdom beside your work: the 🪟 button up top pops it into a small always-on-top window."
        : null,
  },
];

const STORAGE_KEY = "kingdomos.dripHints.v1";
/** Minimum quiet gap between two hints, ms. */
const HINT_SPACING_MS = 60_000;
const AUTO_DISMISS_MS = 45_000;

function loadSeen(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : []);
  } catch {
    return new Set();
  }
}

function markSeen(id: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const seen = loadSeen();
    seen.add(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    /* ignore */
  }
}

export function DripHints({ getWorld }: { getWorld: () => World | null }) {
  const identity = useGameStore((s) => s.identity);
  const tourActive = useGameStore((s) => s.tourActive);
  const stewardReport = useGameStore((s) => s.stewardReport);
  const [active, setActive] = useState<{ id: string; icon: string; text: string } | null>(null);
  /** Wall-clock ms when a founded kingdom first appeared this session. */
  const sessionStartRef = useRef<number | null>(null);
  const lastShownAtRef = useRef(0);

  useEffect(() => {
    if (identity && sessionStartRef.current === null) {
      sessionStartRef.current = Date.now();
    }
  }, [identity]);

  // The scheduler: a slow poll that promotes the first eligible hint.
  useEffect(() => {
    const tick = () => {
      if (active) return;
      if (!identity || tourActive || stewardReport) return;
      if (typeof document !== "undefined" && document.hidden) return;
      // Don't compete with a live countdown.
      if (document.querySelector(".decision-prompt")) return;
      const start = sessionStartRef.current;
      if (start === null) return;
      if (Date.now() - lastShownAtRef.current < HINT_SPACING_MS) return;
      const elapsedMin = (Date.now() - start) / 60_000;
      const seen = loadSeen();
      for (const h of HINTS) {
        if (seen.has(h.id) || elapsedMin < h.afterMin) continue;
        const text = h.text(getWorld());
        if (!text) continue;
        // Mark at show time — a hint that appeared counts as delivered,
        // even if the tab closes before "Got it".
        markSeen(h.id);
        lastShownAtRef.current = Date.now();
        setActive({ id: h.id, icon: h.icon, text });
        return;
      }
    };
    const id = window.setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [active, identity, tourActive, stewardReport, getWorld]);

  // Auto-dismiss.
  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => setActive(null), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [active]);

  if (!active) return null;
  return (
    <div className="drip-hint" role="status" aria-live="polite">
      <span className="drip-hint-icon" aria-hidden="true">{active.icon}</span>
      <span className="drip-hint-text">{active.text}</span>
      <button type="button" className="drip-hint-ok" onClick={() => setActive(null)}>
        Got it
      </button>
    </div>
  );
}
