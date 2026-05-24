import { useEffect, useState } from "react";

/**
 * In-app "update available" toast.
 *
 * On launch (and once every 6 hours afterwards) we ask the Tauri
 * updater plugin whether a newer release is available. If it is, the
 * player sees a small bottom-right card with the version + a download
 * button. Click to download + apply + relaunch.
 *
 * No-op outside Tauri (i.e. on the web demo build), so the same
 * component renders safely on GitHub Pages.
 *
 * Requires `tauri-plugin-updater` to be wired in `lib.rs` and an
 * `endpoints` + `pubkey` configured in `tauri.conf.json` under
 * `plugins.updater`. Without those, `check()` rejects and the toast
 * stays hidden.
 */

type UpdateState =
  | { kind: "idle" }
  | { kind: "available"; version: string; notes: string }
  | { kind: "downloading"; pct: number }
  | { kind: "ready" }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export function UpdateToast() {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });
  /** Version the user explicitly dismissed via "Later". A NEWER
   *  available version supersedes the dismissal — they need to see
   *  the next update even if they skipped a previous one. */
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  useEffect(() => {
    // Skip entirely on the web demo build — no Tauri APIs available.
    if (!("__TAURI_INTERNALS__" in window)) return;

    let cancelled = false;

    async function checkOnce() {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (cancelled || !update) return;
        setState({
          kind: "available",
          version: update.version,
          notes: update.body ?? "",
        });
      } catch (err) {
        // Network blip, endpoint misconfig, signature mismatch — none
        // of these should bother the player. Quiet failure.
        console.warn("[Updater] check failed:", err);
      }
    }

    checkOnce();
    const id = window.setInterval(checkOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function install() {
    if (state.kind !== "available") return;
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        setState({ kind: "error", message: "Update no longer available." });
        return;
      }
      setState({ kind: "downloading", pct: 0 });
      let downloaded = 0;
      let contentLength = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const pct = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0;
          setState({ kind: "downloading", pct });
        } else if (event.event === "Finished") {
          setState({ kind: "ready" });
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (state.kind === "idle") return null;
  // Stay hidden only if the user dismissed THIS specific version. A
  // newer version (or the same one re-surfacing after a restart) reopens.
  if (state.kind === "available" && dismissedVersion === state.version) return null;

  return (
    <div className="update-toast" role="status" aria-live="polite">
      {state.kind === "available" && (
        <>
          <div className="update-toast-head">
            <strong>Update available</strong>
            <span className="update-toast-ver">v{state.version}</span>
          </div>
          {state.notes && (
            <p className="update-toast-notes" title={state.notes}>
              {state.notes.length > 120 ? `${state.notes.slice(0, 120)}…` : state.notes}
            </p>
          )}
          <div className="update-toast-actions">
            <button type="button" className="ghost" onClick={() => setDismissedVersion(state.version)}>
              Later
            </button>
            <button type="button" className="primary" onClick={install}>
              Download & restart
            </button>
          </div>
        </>
      )}
      {state.kind === "downloading" && (
        <>
          <div className="update-toast-head">
            <strong>Downloading update…</strong>
            <span className="update-toast-ver">{state.pct}%</span>
          </div>
          <div className="update-progress">
            <div className="update-progress-fill" style={{ width: `${state.pct}%` }} />
          </div>
        </>
      )}
      {state.kind === "ready" && (
        <div className="update-toast-head">
          <strong>Restarting…</strong>
        </div>
      )}
      {state.kind === "error" && (
        <>
          <div className="update-toast-head">
            <strong>Update failed</strong>
          </div>
          <p className="update-toast-notes">{state.message}</p>
          <div className="update-toast-actions">
            <button type="button" className="ghost" onClick={() => setState({ kind: "idle" })}>
              Dismiss
            </button>
          </div>
        </>
      )}
    </div>
  );
}
