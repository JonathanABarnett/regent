/**
 * Crash log — a tiny, dependency-free error sink that captures unhandled
 * exceptions, unhandled promise rejections, and React ErrorBoundary
 * failures. Entries are stored in localStorage (capped to the last N) so
 * the player can attach a crash report to a bug ticket without us
 * needing a hosted service yet.
 *
 * Design:
 *   - Local-first. Nothing is sent anywhere without explicit opt-in.
 *   - `recordCrash()` is the single entry point so call-sites don't have
 *     to know about storage, capping, or the optional remote sink.
 *   - `getCrashLog()` returns the current buffer for display in Settings
 *     and for the "download log" button.
 *   - Optional remote endpoint configured via `VITE_CRASH_ENDPOINT` env
 *     var. When unset (the default), errors stay local. We POST a small
 *     JSON envelope on a best-effort basis; failure to send is silent.
 *
 * NOT a replacement for Sentry — this is the "smallest useful thing that
 * gives us signal in the first ten installs". Swap in Sentry later by
 * routing `recordCrash` to `Sentry.captureException` in addition to local.
 */

const STORAGE_KEY = "kingdomos.crashLog.v1";
const MAX_ENTRIES = 50;

export interface CrashEntry {
  /** ISO-8601 timestamp the crash was captured at. */
  at: string;
  /** Where the error came from — useful when triaging. */
  source: "window.error" | "unhandledrejection" | "react.boundary" | "sim.tick" | "manual";
  /** Error name (e.g. "TypeError"). */
  name: string;
  /** Error message. */
  message: string;
  /** Stack trace if available. May be a synthetic string for non-Error throws. */
  stack?: string;
  /** App version at the time — included so we can correlate to a release. */
  version?: string;
}

/** Read the persisted crash log. Returns [] on parse failure. */
export function getCrashLog(): CrashEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CrashEntry[]) : [];
  } catch {
    return [];
  }
}

/** Wipe the crash log. Used by the "Clear log" button in Settings. */
export function clearCrashLog(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

function writeCrashLog(entries: CrashEntry[]): void {
  // Cap to the most recent N — old crashes drop off the tail.
  const capped = entries.slice(-MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
    return;
  } catch {
    // Quota fallback: try just the newest entry. Better to keep the
    // most recent crash than to silently lose it because the existing
    // log had grown large enough to push the combined string over the
    // browser quota.
    try {
      const lastOnly = capped.slice(-1);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lastOnly));
    } catch {
      // Storage truly unavailable (private mode / quota=0). Give up
      // gracefully — recording crashes is best-effort.
    }
  }
}

/** Best-effort POST to the configured crash endpoint. No-op if unset. */
function sendRemote(entry: CrashEntry): void {
  try {
    // Vite injects env vars prefixed with VITE_ at build time.
    const endpoint = (import.meta as unknown as { env?: { VITE_CRASH_ENDPOINT?: string } })
      .env?.VITE_CRASH_ENDPOINT;
    if (!endpoint) return;
    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // keepalive lets the request finish even if the page is closing.
      keepalive: true,
      body: JSON.stringify(entry),
    }).catch(() => { /* fail silently */ });
  } catch {
    /* don't recurse out of an error handler */
  }
}

/**
 * Record a crash. Called by both the global handlers below and by
 * ErrorBoundary. Safe to call from anywhere — never throws.
 */
export function recordCrash(
  source: CrashEntry["source"],
  err: unknown,
): void {
  try {
    const e =
      err instanceof Error
        ? err
        : ({ name: "NonError", message: String(err), stack: undefined } as Error);
    const entry: CrashEntry = {
      at: new Date().toISOString(),
      source,
      name: e.name,
      message: e.message,
      stack: e.stack,
      version:
        (import.meta as unknown as { env?: { VITE_APP_VERSION?: string } })
          .env?.VITE_APP_VERSION ?? undefined,
    };
    const log = getCrashLog();
    log.push(entry);
    writeCrashLog(log);
    sendRemote(entry);
  } catch {
    /* don't recurse */
  }
}

let installed = false;
/**
 * Install the global handlers. Call once from `main.tsx` before mounting
 * React. Idempotent — multiple calls do nothing after the first.
 */
export function installCrashHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (ev) => {
    recordCrash("window.error", ev.error ?? new Error(ev.message));
  });
  window.addEventListener("unhandledrejection", (ev) => {
    recordCrash("unhandledrejection", ev.reason);
  });
}

/**
 * Format the crash log as plain text for download / clipboard.
 * Returns a single multi-line string ready to drop into a file.
 */
export function formatCrashLog(entries: CrashEntry[]): string {
  if (entries.length === 0) return "(no crashes recorded)";
  return entries
    .map((e) => {
      const header = `[${e.at}] ${e.source} — ${e.name}: ${e.message}`;
      const ver = e.version ? ` (v${e.version})` : "";
      return e.stack ? `${header}${ver}\n${e.stack}` : `${header}${ver}`;
    })
    .join("\n\n");
}
