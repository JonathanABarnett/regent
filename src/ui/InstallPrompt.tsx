import { useEffect, useState } from "react";

/**
 * PWA install nudge. When the browser decides KingdomOS is installable
 * (manifest + icons + engagement), it fires `beforeinstallprompt`; we
 * stash the event and offer a one-tap install — the kingdom in its own
 * window, halfway to a desktop app without the download. Declining is
 * remembered so this never nags.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "kingdomos.installPrompt.dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      try {
        if (localStorage.getItem(DISMISS_KEY)) return;
      } catch {
        /* storage unavailable — still show */
      }
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!deferred) return null;
  return (
    <div className="install-prompt" role="status">
      <span className="install-prompt-icon" aria-hidden="true">🏰</span>
      <p>Give the kingdom its own window — install KingdomOS.</p>
      <div className="install-prompt-actions">
        <button
          type="button"
          className="ghost"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* ignore */
            }
            setDeferred(null);
          }}
        >
          No thanks
        </button>
        <button
          type="button"
          className="primary"
          onClick={async () => {
            const d = deferred;
            setDeferred(null);
            try {
              await d.prompt();
            } catch {
              /* user gesture expired — browser will refire the event */
            }
          }}
        >
          Install
        </button>
      </div>
    </div>
  );
}
