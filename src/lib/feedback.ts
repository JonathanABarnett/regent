/**
 * Player feedback — bug reports, ideas, love letters, questions.
 *
 * The architectural twin of `lib/crashLog.ts`. Local-first storage so
 * a player whose submission fails to reach the remote endpoint (offline,
 * endpoint misconfigured, server down) can still recover their text
 * from Settings → Diagnostics → "Recent feedback drafts."
 *
 * Optional remote sink via `VITE_FEEDBACK_ENDPOINT`. The endpoint
 * receives a JSON envelope; the dev's preferred backend (Cloudflare
 * Worker → Discord webhook, Formspree, custom service) shapes the
 * onward delivery. See `docs/FEEDBACK.md` for a sample Worker.
 *
 * Privacy:
 *   - No telemetry is ever sent without an explicit submission action
 *   - "Include kingdom snapshot" is opt-in per submission, not global
 *   - Contact info is optional and never auto-filled
 *   - The endpoint URL is build-time injected so end users can audit
 *     where their text goes by inspecting the JS bundle
 */

const STORAGE_KEY = "kingdomos.feedback.drafts.v1";
const MAX_LOCAL_DRAFTS = 20;

export type FeedbackCategory = "bug" | "idea" | "love" | "question" | "other";

export interface FeedbackEntry {
  /** ISO-8601 timestamp the submission was attempted. */
  at: string;
  /** What the player is sending. */
  category: FeedbackCategory;
  /** The actual message text. Trimmed and length-capped. */
  message: string;
  /** Optional contact info (email / handle / username). Never required. */
  contact?: string;
  /** App version at the time. */
  version?: string;
  /** Optional snapshot the player consented to attach. */
  snapshot?: FeedbackSnapshot;
  /** Whether the remote POST succeeded. False = stored locally as draft. */
  delivered: boolean;
}

/**
 * Lightweight, anonymized world state. NO names, no NPC details, no
 * journal entries — just the structural numbers that help the dev
 * understand WHEN a player submitted feedback. Larger than this and
 * we'd risk leaking identifying info the player didn't intend to share.
 */
export interface FeedbackSnapshot {
  /** In-world day at submission time. */
  day: number;
  /** Calendar year inside the kingdom. */
  year: number;
  /** Active season. */
  season: string;
  /** Total NPC count. */
  npcs: number;
  /** Kingdom mood label (e.g. "the kingdom is content"). */
  mood?: string;
  /** Recent crash count (from crashLog). High count + a bug report = signal. */
  recentCrashes: number;
  /** Build identifier — helps the dev correlate to a specific commit. */
  buildId?: string;
}

const MAX_MESSAGE_CHARS = 4000;
const MAX_CONTACT_CHARS = 200;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/** Get the persisted draft list. Returns [] on parse failure. */
export function getFeedbackDrafts(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FeedbackEntry[]) : [];
  } catch {
    return [];
  }
}

/** Wipe local drafts. Used by the "clear" button in Settings. */
export function clearFeedbackDrafts(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

function writeDrafts(drafts: FeedbackEntry[]): void {
  const capped = drafts.slice(-MAX_LOCAL_DRAFTS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
    return;
  } catch {
    // Quota fallback — keep only the most recent.
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(capped.slice(-1))); }
    catch { /* storage truly unavailable; abandon */ }
  }
}

/**
 * Attempt to send feedback to the remote endpoint. Returns true if the
 * POST succeeded. Whether it succeeded or not, the entry is persisted
 * locally so the player can retrieve their text later.
 */
export async function submitFeedback(input: {
  category: FeedbackCategory;
  message: string;
  contact?: string;
  snapshot?: FeedbackSnapshot;
}): Promise<{ delivered: boolean; entry: FeedbackEntry }> {
  const trimmedMessage = truncate(input.message.trim(), MAX_MESSAGE_CHARS);
  const trimmedContact = input.contact
    ? truncate(input.contact.trim(), MAX_CONTACT_CHARS)
    : undefined;

  if (trimmedMessage.length === 0) {
    throw new Error("Feedback message cannot be empty.");
  }

  const env = (import.meta as unknown as {
    env?: { VITE_FEEDBACK_ENDPOINT?: string; VITE_APP_VERSION?: string };
  }).env ?? {};

  let delivered = false;
  if (env.VITE_FEEDBACK_ENDPOINT) {
    try {
      const resp = await fetch(env.VITE_FEEDBACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // keepalive lets the request survive page unload — useful when
        // the user submits then immediately closes the tab.
        keepalive: true,
        body: JSON.stringify({
          v: 1,
          category: input.category,
          message: trimmedMessage,
          contact: trimmedContact,
          snapshot: input.snapshot,
          version: env.VITE_APP_VERSION,
          ts: Date.now(),
        }),
      });
      delivered = resp.ok;
    } catch {
      delivered = false;
    }
  }

  const entry: FeedbackEntry = {
    at: new Date().toISOString(),
    category: input.category,
    message: trimmedMessage,
    contact: trimmedContact,
    version: env.VITE_APP_VERSION,
    snapshot: input.snapshot,
    delivered,
  };
  const drafts = getFeedbackDrafts();
  drafts.push(entry);
  writeDrafts(drafts);

  return { delivered, entry };
}

/**
 * Format the draft list as plain text for export (download button in
 * Settings). Helpful for a player who hit "send" while offline and
 * wants to paste the text into an email manually.
 */
export function formatFeedbackDrafts(entries: FeedbackEntry[]): string {
  if (entries.length === 0) return "(no feedback drafts)";
  return entries
    .map((e) => {
      const status = e.delivered ? "[SENT]" : "[LOCAL]";
      const head = `${status} ${e.at} — ${e.category}`;
      const body = e.message;
      const contact = e.contact ? `\ncontact: ${e.contact}` : "";
      const snap = e.snapshot
        ? `\nsnapshot: day ${e.snapshot.day}, year ${e.snapshot.year}, season ${e.snapshot.season}, ${e.snapshot.npcs} npcs, ${e.snapshot.recentCrashes} recent crashes`
        : "";
      return `${head}${contact}${snap}\n\n${body}`;
    })
    .join("\n\n---\n\n");
}

/** Whether a remote endpoint is configured — used by the panel copy. */
export function hasRemoteEndpoint(): boolean {
  const env = (import.meta as unknown as { env?: { VITE_FEEDBACK_ENDPOINT?: string } }).env;
  return Boolean(env?.VITE_FEEDBACK_ENDPOINT);
}
