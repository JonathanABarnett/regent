/**
 * About / Credits dialog. Lives on top of the title screen.
 * Steam-friendly: a place for version, attributions, and contact.
 */
import pkg from "../../package.json";

export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="about-overlay" onClick={onClose}>
      <div className="about-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <div className="about-crest">✦</div>
          <h1>KingdomOS</h1>
          <p className="about-version">v{pkg.version} — Early Realm</p>
        </header>

        <section>
          <p className="about-blurb">
            A 16-bit fantasy kingdom that lives on your desktop and reflects
            the rhythms of your day. NPCs walk schedules, the seasons turn, the
            economy ticks, and a soft narrative director weaves little stories
            into the journal — even if you never touch a key.
          </p>
        </section>

        <section>
          <h3>Built with</h3>
          <ul className="credits">
            <li>
              <strong>Tauri 2</strong> — desktop shell
            </li>
            <li>
              <strong>React</strong> + <strong>TypeScript</strong> + <strong>Vite</strong>
            </li>
            <li>
              <strong>PixiJS v8</strong> — WebGL rendering
            </li>
            <li>
              <strong>Zustand</strong> — UI state
            </li>
            <li>
              <strong>Zod</strong> — input validation
            </li>
            <li>
              <strong>simplex-noise</strong> — terrain generation
            </li>
            <li>Web Audio API — programmatic ambient pad + SFX</li>
          </ul>
        </section>

        <section>
          <h3>Thanks</h3>
          <p className="about-blurb">
            To the cozy-game community, to Final Fantasy 6 and Chrono Trigger
            for setting the bar, and to every player who founded a kingdom and
            let it run.
          </p>
        </section>

        <footer>
          <button onClick={onClose}>Close (Esc)</button>
        </footer>
      </div>
    </div>
  );
}
