import { useEffect, useState } from "react";

/**
 * Three-card intro shown before BEGIN, on first visit only.
 *
 * Playtest signal: "what is this?" — the genre (ambient sim) has no
 * shorthand the average gamer knows. This is the 30-second
 * explanation: you are the monarch, your kingdom runs itself, your
 * choices echo. Sets the right expectation before the player ever
 * sees the world.
 *
 * Idempotent: a flag in localStorage marks this as "seen" so returning
 * players (and devs reloading mid-iteration) skip it. A small "skip"
 * link on every card lets impatient players bail; clicking skip ALSO
 * marks seen so it doesn't reappear.
 *
 * Mounted by App.tsx around TitleScreen — if the carousel is open,
 * the title screen is hidden. When the carousel closes (finish or
 * skip), title appears immediately.
 */

const STORAGE_KEY = "kingdomos.intro.v1.seen";

interface Card {
  emoji: string;
  title: string;
  body: string;
}

const CARDS: Card[] = [
  {
    emoji: "👑",
    title: "You are the monarch.",
    body:
      "Name your kingdom, design your monarch, and watch the world live around them. There's no quest to chase, no XP bar to fill. Just a small fantasy world that's now yours.",
  },
  {
    emoji: "🏰",
    title: "Your kingdom lives on its own.",
    body:
      "NPCs walk schedules, the seasons turn, the chronicle writes itself. You can leave the window open while you work and come back to a story. You don't have to do anything for the world to keep going.",
  },
  {
    emoji: "✦",
    title: "Your choices echo forward.",
    body:
      "When the court brings you a decision, what you pick matters — sometimes that same day, sometimes weeks later when the consequence comes back through the journal. Watch for the ✦ ribbon to see which entries exist because of you.",
  },
];

function hasSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    /* ignore */
  }
}

export function IntroCarousel({
  onDone,
  forceShow,
}: {
  onDone: () => void;
  /** Lets settings expose a "show intro again" affordance later. */
  forceShow?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (forceShow || !hasSeen()) {
      setOpen(true);
    } else {
      // Fast path — already seen, hand control back immediately.
      onDone();
    }
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // index intentionally not a dep — handlers read setState directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function next(): void {
    setIndex((i) => {
      if (i + 1 >= CARDS.length) {
        finish();
        return i;
      }
      return i + 1;
    });
  }

  function prev(): void {
    setIndex((i) => Math.max(0, i - 1));
  }

  function finish(): void {
    markSeen();
    setOpen(false);
    onDone();
  }

  if (!open) return null;
  const card = CARDS[index];
  const isLast = index === CARDS.length - 1;

  return (
    <div className="intro-carousel" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="intro-card">
        <button
          type="button"
          className="intro-skip"
          onClick={finish}
          aria-label="Skip intro"
          title="Skip — Esc"
        >
          Skip
        </button>
        <div className="intro-emoji" aria-hidden="true">{card.emoji}</div>
        <h2 id="intro-title" className="intro-title">{card.title}</h2>
        <p className="intro-body">{card.body}</p>
        <div className="intro-dots" role="tablist" aria-label="Intro cards">
          {CARDS.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              className={`intro-dot${i === index ? " active" : ""}`}
              onClick={() => setIndex(i)}
              aria-label={`Card ${i + 1}`}
            />
          ))}
        </div>
        <div className="intro-actions">
          {index > 0 && (
            <button type="button" className="ghost" onClick={prev}>
              ← Back
            </button>
          )}
          <button type="button" className="primary" onClick={next}>
            {isLast ? "Begin →" : "Next →"}
          </button>
        </div>
        <p className="intro-hint">
          Use <kbd>←</kbd> <kbd>→</kbd> to navigate · <kbd>Esc</kbd> to skip
        </p>
      </div>
    </div>
  );
}
