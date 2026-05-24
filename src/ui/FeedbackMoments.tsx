import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { submitFeedback } from "../lib/feedback";
import { getCrashLog } from "../lib/crashLog";

/**
 * Opportunistic feedback prompts. Catches the player at moments of
 * peak engagement so we capture impressions while they're warm
 * instead of waiting for them to navigate to Settings.
 *
 * Two triggers:
 *
 *   - **10-minute session mark.** Once a session, after 10 minutes of
 *     play, a soft toast slides in bottom-right. Three quick-reaction
 *     buttons auto-submit a one-line feedback ("session:loving" /
 *     "session:mixed" / "session:bored"). A "say more →" button opens
 *     the full FeedbackPanel for elaboration. Once dismissed/answered,
 *     never appears again in this session.
 *
 *   - **Year 1 completes.** When the player rolls over from year 1 → 2,
 *     a different soft toast asks for their "first-year impression."
 *     Idempotent per-kingdom (uses localStorage keyed by kingdom name
 *     so the same player on the same kingdom only sees it once, even
 *     across reloads). A returning player who has already given this
 *     feedback isn't pestered.
 *
 * Only one prompt visible at a time; whichever fires first wins this
 * session. Hidden in streamer mode (OBS sources shouldn't show feedback
 * popups) and during the pre-kingdom flow (no identity yet = nothing
 * to be opinionated about).
 *
 * The auto-submit payload is intentionally tiny — a single category
 * vote per moment. The "say more" path is where the real prose lands.
 * This avoids the failure mode where opportunistic prompts produce
 * exclusively low-quality "click button and forget" data.
 */

const SESSION_PROMPT_MS = 10 * 60 * 1000; // 10 minutes
const STORAGE_KEY = "kingdomos.feedbackMoments.seen.v1";

interface Seen {
  /** Kingdoms that have completed the year-1 prompt. */
  yearOne: string[];
  /** Kingdoms that have completed the monarch-death prompt. */
  monarchDeath: string[];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((s): s is string => typeof s === "string").slice(-50)
    : [];
}

function loadSeen(): Seen {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { yearOne: [], monarchDeath: [] };
    const parsed = JSON.parse(raw);
    return {
      yearOne: arrayOfStrings(parsed?.yearOne),
      monarchDeath: arrayOfStrings(parsed?.monarchDeath),
    };
  } catch {
    return { yearOne: [], monarchDeath: [] };
  }
}

function saveSeen(s: Seen): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      yearOne: s.yearOne.slice(-50),
      monarchDeath: s.monarchDeath.slice(-50),
    }));
  } catch {
    /* ignore quota */
  }
}

type Trigger = "session_10min" | "year_one" | "monarch_death";
type QuickReaction = "loving" | "mixed" | "bored" | "joyful" | "stunned" | "sad" | "moved" | "grim";

/** Per-trigger copy + reaction palette. */
const TRIGGERS: Record<Trigger, {
  title: string;
  body: (kingdomName: string) => string;
  reactions: Array<{ id: QuickReaction; emoji: string; label: string }>;
  category: "idea" | "love" | "other";
}> = {
  session_10min: {
    title: "How's it going?",
    body: (k) => `You've been with ${k} for ten minutes. Quick reaction?`,
    reactions: [
      { id: "loving", emoji: "🤩", label: "Loving it" },
      { id: "mixed",  emoji: "🤔", label: "Mixed" },
      { id: "bored",  emoji: "😴", label: "Bored" },
    ],
    category: "other",
  },
  year_one: {
    title: "A year complete",
    body: (k) => `${k} has lived through its first year. How does it feel so far?`,
    reactions: [
      { id: "joyful",  emoji: "✨", label: "Alive" },
      { id: "mixed",   emoji: "🤔", label: "Curious" },
      { id: "stunned", emoji: "😮", label: "Surprised" },
      { id: "sad",     emoji: "😔", label: "Empty" },
    ],
    category: "love",
  },
  monarch_death: {
    title: "A monarch is dead",
    body: (k) =>
      `${k} outlives the one who founded it. The throne passes. Did this moment land for you?`,
    reactions: [
      { id: "moved",   emoji: "💔", label: "Moved" },
      { id: "joyful",  emoji: "👏", label: "Worked" },
      { id: "mixed",   emoji: "🤔", label: "Mixed" },
      { id: "grim",    emoji: "😐", label: "Flat" },
    ],
    category: "love",
  },
};

export function FeedbackMoments({ getOpenFeedback }: { getOpenFeedback: () => void }) {
  const identity = useGameStore((s) => s.identity);
  const streamerMode = useGameStore((s) => s.settings.streamerMode);
  const worldStats = useGameStore((s) => s.worldStats);
  const kingdomName = identity?.kingdomName;

  const [activeTrigger, setActiveTrigger] = useState<Trigger | null>(null);
  const [dismissing, setDismissing] = useState(false);
  /** Has any prompt fired this session? Once true, no more prompts. */
  const sessionPromptFired = useRef(false);
  /** Last seen generation — used to detect the rising edge of succession. */
  const lastGenerationSeen = useRef<number | null>(null);

  // ── Year 1 trigger ───────────────────────────────────────────────────
  // Watches worldStats.year. Fires once per kingdom (persisted) when
  // year crosses 1→2. Doesn't fire on later year rollovers (only the
  // first impression matters; further years would be nagging).
  useEffect(() => {
    if (!kingdomName || streamerMode || sessionPromptFired.current) return;
    if (!worldStats || worldStats.year < 2) return;
    const seen = loadSeen();
    if (seen.yearOne.includes(kingdomName)) return;
    // Fire it.
    sessionPromptFired.current = true;
    setActiveTrigger("year_one");
  }, [kingdomName, streamerMode, worldStats]);

  // ── Monarch death trigger ────────────────────────────────────────────
  // Fires on the *rising edge* of the generation counter — the moment a
  // succession completes. Idempotent per-kingdom (uses the same seen
  // map as year-one, with a separate key). Skips the initial mount
  // when generation === 1 (founding state, not a death).
  useEffect(() => {
    if (!kingdomName || streamerMode || sessionPromptFired.current) return;
    const gen = worldStats?.generation;
    if (typeof gen !== "number") return;
    // First observation of this mount — just record, don't fire.
    if (lastGenerationSeen.current === null) {
      lastGenerationSeen.current = gen;
      return;
    }
    if (gen > lastGenerationSeen.current) {
      lastGenerationSeen.current = gen;
      const seen = loadSeen();
      if (seen.monarchDeath?.includes(kingdomName)) return;
      sessionPromptFired.current = true;
      // Small delay so the player has a beat to absorb the journal
      // entries the Succession system just wrote before the prompt
      // slides in. 4s = enough to read "[Name] has passed" without
      // letting the moment cool.
      window.setTimeout(() => setActiveTrigger("monarch_death"), 4000);
    }
  }, [kingdomName, streamerMode, worldStats]);

  // ── 10-minute session trigger ───────────────────────────────────────
  // Pure wall-clock — fires once per real-time session, not per
  // kingdom. A returning player who plays for 10 more minutes WILL
  // see this again the next day (intentional — gives them a fresh
  // opening to share evolving impressions).
  useEffect(() => {
    if (!kingdomName || streamerMode) return;
    const id = window.setTimeout(() => {
      if (sessionPromptFired.current) return;
      sessionPromptFired.current = true;
      setActiveTrigger("session_10min");
    }, SESSION_PROMPT_MS);
    return () => clearTimeout(id);
  }, [kingdomName, streamerMode]);

  function dismiss(): void {
    setDismissing(true);
    window.setTimeout(() => {
      setActiveTrigger(null);
      setDismissing(false);
    }, 280);
    // Per-kingdom prompts (year-one, monarch-death) record themselves
    // as "seen" on dismiss so a returning player isn't pestered.
    if (kingdomName) {
      const seen = loadSeen();
      let changed = false;
      if (activeTrigger === "year_one" && !seen.yearOne.includes(kingdomName)) {
        seen.yearOne.push(kingdomName);
        changed = true;
      } else if (activeTrigger === "monarch_death" && !seen.monarchDeath.includes(kingdomName)) {
        seen.monarchDeath.push(kingdomName);
        changed = true;
      }
      if (changed) saveSeen(seen);
    }
  }

  async function react(r: QuickReaction): Promise<void> {
    if (!activeTrigger || !kingdomName) return;
    const trigger = TRIGGERS[activeTrigger];
    try {
      // Compose a tiny structured payload — single-line so the dev can
      // grep their Discord channel for patterns ("session:loving" count
      // vs "session:bored" count over 100 testers, etc.).
      await submitFeedback({
        category: trigger.category,
        message: `[${activeTrigger}:${r}]\n${trigger.body(kingdomName)}`,
        snapshot: {
          day: worldStats?.day ?? 0,
          year: worldStats?.year ?? 0,
          season: worldStats?.season ?? "spring",
          npcs: worldStats?.npcCount ?? 0,
          mood: worldStats?.moodLabel,
          recentCrashes: getCrashLog().length,
        },
      });
    } catch {
      // Quiet fail — opportunistic prompts shouldn't surface errors.
    }
    dismiss();
  }

  function sayMore(): void {
    dismiss();
    getOpenFeedback();
  }

  if (!activeTrigger || !kingdomName) return null;
  const t = TRIGGERS[activeTrigger];

  return (
    <div
      className={`feedback-moment${dismissing ? " dismissing" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="feedback-moment-head">
        <strong>{t.title}</strong>
        <button
          type="button"
          className="feedback-moment-close"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <p className="feedback-moment-body">{t.body(kingdomName)}</p>
      <div className="feedback-moment-reactions">
        {t.reactions.map((r) => (
          <button
            key={r.id}
            type="button"
            className="feedback-moment-reaction"
            onClick={() => react(r.id)}
            title={r.label}
            aria-label={r.label}
          >
            <span className="feedback-moment-emoji" aria-hidden="true">{r.emoji}</span>
            <span className="feedback-moment-label">{r.label}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="feedback-moment-more"
        onClick={sayMore}
      >
        Say more →
      </button>
    </div>
  );
}
