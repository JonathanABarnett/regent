import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import type { World } from "../sim/World";
import {
  submitFeedback,
  hasRemoteEndpoint,
  type FeedbackCategory,
  type FeedbackSnapshot,
} from "../lib/feedback";
import { getCrashLog } from "../lib/crashLog";

/**
 * In-app feedback panel — the player's "talk to the dev" surface.
 *
 * Opened from Settings → "Send feedback" and from the Help overlay's
 * "report a bug or suggest an idea" link. Modal-style so the world
 * keeps running behind it (no pause; the kingdom doesn't stop because
 * a player wants to write a paragraph).
 *
 * Four categories chosen for prose-only feedback flow:
 *   bug      — something broke
 *   idea     — a feature wish or design suggestion
 *   love     — a "this moment was great" note (these become marketing
 *              quotes; explicitly category'd so the dev can find them)
 *   question — anything that isn't the above three
 *
 * Optional "attach kingdom snapshot" includes day/year/season/mood/
 * NPC count + recent crash count. NO names, NO journal entries, NO
 * identifying detail beyond the contact info the player chose to
 * include. Player can audit by toggling the "show what gets sent"
 * disclosure.
 */

const CATEGORIES: Array<{ id: FeedbackCategory; label: string; hint: string }> = [
  { id: "bug",      label: "Bug report",       hint: "Something broke" },
  { id: "idea",     label: "Idea / suggestion", hint: "A feature wish" },
  { id: "love",     label: "Love letter",       hint: "A moment that hit" },
  { id: "question", label: "Question",          hint: "Anything else" },
];

function buildSnapshot(world: World | null): FeedbackSnapshot | null {
  if (!world) return null;
  const day = world.state.day;
  // calendar.year is the in-world year; fall back if calendar missing.
  let year = 1;
  let season = "spring";
  try {
    const cal = world.calendar?.snapshot?.();
    if (cal) {
      year = cal.year;
      season = cal.season;
    }
  } catch { /* ignore */ }
  const npcs = world.npcs.length;
  let mood: string | undefined;
  try { mood = world.mood?.label?.(); } catch { /* ignore */ }
  const recentCrashes = getCrashLog().length;
  return {
    day,
    year,
    season,
    npcs,
    mood,
    recentCrashes,
    buildId: (import.meta as unknown as { env?: { VITE_APP_VERSION?: string } }).env?.VITE_APP_VERSION,
  };
}

export function FeedbackPanel({
  open,
  onClose,
  getWorld,
}: {
  open: boolean;
  onClose: () => void;
  getWorld: () => World | null;
}) {
  const identity = useGameStore((s) => s.identity);
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [includeSnapshot, setIncludeSnapshot] = useState(true);
  const [showAudit, setShowAudit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; delivered: boolean; message: string }>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus the message box when the panel opens. Without this, the
  // player has to click into the field — small friction that kills
  // submission rates noticeably.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => textareaRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [open]);

  // Esc closes — standard modal expectation. Skipped when actively
  // submitting so an accidental Esc doesn't discard an in-flight POST.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  const snapshot = includeSnapshot ? buildSnapshot(getWorld()) : null;
  const canSubmit = message.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setResult(null);
    try {
      const { delivered } = await submitFeedback({
        category,
        message,
        contact: contact.trim() || undefined,
        snapshot: snapshot ?? undefined,
      });
      if (delivered) {
        setResult({
          ok: true,
          delivered: true,
          message: "Sent — thank you. The dev reads every one of these.",
        });
      } else if (hasRemoteEndpoint()) {
        setResult({
          ok: true,
          delivered: false,
          message: "Couldn't reach the server. Saved as a local draft (Settings → Diagnostics) so you can resend later.",
        });
      } else {
        setResult({
          ok: true,
          delivered: false,
          message: "No remote endpoint configured for this build — saved as a local draft. The dev can collect drafts from Settings → Diagnostics.",
        });
      }
      // Clear the text on success so the panel is ready for another
      // submission. Keep contact info — most players have one address.
      setMessage("");
    } catch (err) {
      setResult({
        ok: false,
        delivered: false,
        message: err instanceof Error ? err.message : "Submission failed.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="feedback-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
      onClick={onClose}
    >
      <div className="feedback-card" onClick={(e) => e.stopPropagation()}>
        <header className="feedback-header">
          <h3 id="feedback-title">Send feedback</h3>
          <button type="button" className="feedback-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <p className="feedback-intro">
          {identity?.kingdomName
            ? `${identity.kingdomName} is your kingdom — tell the dev what's working, what's broken, or what you wish existed.`
            : "Tell the dev what's working, what's broken, or what you wish existed."}
        </p>

        <div className="feedback-categories" role="radiogroup" aria-label="Feedback type">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={category === c.id}
              className={`feedback-category${category === c.id ? " active" : ""}`}
              onClick={() => setCategory(c.id)}
              title={c.hint}
            >
              <span className="feedback-category-label">{c.label}</span>
              <span className="feedback-category-hint">{c.hint}</span>
            </button>
          ))}
        </div>

        <label className="feedback-field">
          <span>Your message</span>
          <textarea
            ref={textareaRef}
            rows={6}
            maxLength={4000}
            placeholder={
              category === "bug"
                ? "What did you expect to happen? What happened instead?"
                : category === "idea"
                ? "What would you add, change, or remove?"
                : category === "love"
                ? "Which moment hit?"
                : "What's on your mind?"
            }
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={submitting}
          />
          <span className="feedback-counter">{message.length} / 4000</span>
        </label>

        <label className="feedback-field">
          <span>Email or handle (optional)</span>
          <input
            type="text"
            placeholder="If you'd like a reply"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={200}
            disabled={submitting}
          />
        </label>

        <label className="feedback-toggle">
          <input
            type="checkbox"
            checked={includeSnapshot}
            onChange={(e) => setIncludeSnapshot(e.target.checked)}
            disabled={submitting}
          />
          <span>
            Include kingdom snapshot
            <button
              type="button"
              className="feedback-audit-toggle"
              onClick={() => setShowAudit((b) => !b)}
            >
              ({showAudit ? "hide" : "show"} what gets sent)
            </button>
          </span>
        </label>
        {showAudit && (
          <pre className="feedback-audit">{JSON.stringify(snapshot ?? {}, null, 2)}</pre>
        )}

        {result && (
          <div className={`feedback-result${result.ok ? "" : " error"}`}>
            {result.message}
          </div>
        )}

        <div className="feedback-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
