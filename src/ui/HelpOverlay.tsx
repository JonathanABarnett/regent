import { useEffect, useState } from "react";

/**
 * Help overlay — keyboard shortcuts + the basic "what is this app" pitch.
 * Toggled with `?` or `H`.
 */
export function HelpOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (e.key === "?" || e.key === "h" || e.key === "H") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open) return null;
  return (
    <div
      className="help-overlay"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
    >
      <div className="help-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 id="help-title">How to be a monarch</h2>
          <button
            onClick={() => setOpen(false)}
            title="Close (Esc)"
            aria-label="Close help overlay"
          >
            ×
          </button>
        </header>

        <section>
          <h3>What is this?</h3>
          <p>
            KingdomOS is an ambient fantasy kingdom that lives on your desktop.
            It runs on its own — NPCs have schedules, the seasons turn, the
            economy ticks, and a soft narrative director weaves little stories
            into the journal even if nothing else is happening.
          </p>
        </section>

        <section>
          <h3>Keyboard</h3>
          <div className="kbd-grid">
            <Kbd k="WASD / arrows" desc="Pan the camera" />
            <Kbd k="Shift" desc="Hold for fast pan" />
            <Kbd k="Space" desc="Follow a random NPC" />
            <Kbd k="F" desc="Center on the castle" />
            <Kbd k="R" desc="Resume autopilot drift" />
            <Kbd k="P" desc="Photo mode — framed screenshot" />
            <Kbd k="X" desc="Cutaway mode — see NPCs inside buildings" />
            <Kbd k=", / ." desc="Slow / speed up the sim" />
            <Kbd k="/" desc="Pause toggle" />
            <Kbd k="? / H" desc="This help screen" />
            <Kbd k="Esc" desc="Close any open panel" />
          </div>
        </section>

        <section>
          <h3>Mouse</h3>
          <ul>
            <li><strong>Click an NPC</strong> — camera follows them</li>
            <li><strong>Click a structure</strong> — see who lives and works there</li>
            <li><strong>Click an empty tile</strong> — resume autopilot</li>
            <li><strong>Hover an NPC</strong> — name, role, age, partner</li>
          </ul>
        </section>

        <section>
          <h3>Identity</h3>
          <p>
            Your monarch, kingdom name, royal companion, and castle banner are
            all yours. Customize them anytime in Settings — your kingdom is
            saved automatically every 30 seconds and on close.
          </p>
        </section>

        <section>
          <h3>Optional integrations</h3>
          <p>
            Drop a JSON event in <code>%APPDATA%\com.jonat.kingdomos\inbox</code>,
            watch a git repo, or pipe in system CPU spikes — see Settings →
            Integrations. None are required; the world simulates without them.
          </p>
        </section>

        <section className="help-feedback-cta">
          <p>
            Got an idea, a bug, or a moment you loved?{" "}
            <button
              type="button"
              className="help-feedback-link"
              onClick={() => {
                setOpen(false);
                window.kingdomos?.openFeedback();
              }}
            >
              Tell the dev →
            </button>
          </p>
        </section>
      </div>
    </div>
  );
}

function Kbd({ k, desc }: { k: string; desc: string }) {
  return (
    <div className="kbd-row">
      <kbd>{k}</kbd>
      <span>{desc}</span>
    </div>
  );
}
