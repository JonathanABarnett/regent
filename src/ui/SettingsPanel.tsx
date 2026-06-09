import { useEffect, useRef, useState } from "react";
import { useGameStore, KINGDOM_MOTTO_MAX } from "../store/useGameStore";
import { FABRIC_COLORS } from "../engine/CharacterSpec";
import {
  exportSave,
  importSaveFromFile,
  commitImportedSave,
  readSave,
} from "../sim/Persistence";
import { getCrashLog, clearCrashLog, formatCrashLog } from "../lib/crashLog";

/** Fire a test world event via the kingdomos dev hook. */
function fireTestEvent(kind: string) {
  const k = (window as unknown as { kingdomos?: { publish: (e: unknown) => void } }).kingdomos;
  if (!k) return;
  k.publish({
    v: 1,
    id: `test_${kind}_${Date.now()}`,
    ts: Math.floor(Date.now() / 1000),
    kind,
    source: "internal",
    intensity: 0.7,
    payload: { label: "diagnostic test" },
  });
}

function fireTwitch(action: "follow" | "sub" | "bits" | "raid", user: string, n?: number) {
  const k = (window as unknown as {
    kingdomos?: { twitch: { follow: (u: string) => void; sub: (u: string, t?: 1 | 2 | 3) => void; bits: (u: string, b: number) => void; raid: (u: string, v: number) => void } };
  }).kingdomos;
  if (!k) return;
  if (action === "follow") k.twitch.follow(user);
  else if (action === "sub") k.twitch.sub(user, (n as 1 | 2 | 3) ?? 1);
  else if (action === "bits") k.twitch.bits(user, n ?? 100);
  else if (action === "raid") k.twitch.raid(user, n ?? 10);
}

export function SettingsPanel({
  open,
  onClose,
  onOpenCreator,
  onOpenPetCreator,
  onOpenKingdomCard,
  onOpenChronicle,
  onOpenVault,
  onOpenFeedback,
}: {
  open: boolean;
  onClose: () => void;
  onOpenCreator: () => void;
  onOpenPetCreator: () => void;
  onOpenKingdomCard: () => void;
  onOpenChronicle: () => void;
  onOpenVault: () => void;
  onOpenFeedback: () => void;
}) {
  const settings = useGameStore((s) => s.settings);
  const setCrt = useGameStore((s) => s.setCrt);
  const setIntegration = useGameStore((s) => s.setIntegration);
  const setSimSpeed = useGameStore((s) => s.setSimSpeed);
  const setVolume = useGameStore((s) => s.setVolume);
  const setFollowRealSeasons = useGameStore((s) => s.setFollowRealSeasons);
  const setStreamerMode = useGameStore((s) => s.setStreamerMode);
  const setTwitchChannel = useGameStore((s) => s.setTwitchChannel);
  const setShowPerfHud = useGameStore((s) => s.setShowPerfHud);
  const setMusicEnabled = useGameStore((s) => s.setMusicEnabled);
  const setCutawayMode = useGameStore((s) => s.setCutawayMode);
  const setRetro16bit  = useGameStore((s) => s.setRetro16bit);
  const setUiScale = useGameStore((s) => s.setUiScale);
  const setColorblindMode = useGameStore((s) => s.setColorblindMode);
  const setShowTutorial = useGameStore((s) => s.setShowTutorial);
  const addWatchedPath = useGameStore((s) => s.addWatchedPath);
  const removeWatchedPath = useGameStore((s) => s.removeWatchedPath);
  const resetKingdom = useGameStore((s) => s.resetKingdom);
  const achievements = useGameStore((s) => s.achievements);
  const identity = useGameStore((s) => s.identity);
  const setIdentity = useGameStore((s) => s.setIdentity);
  const [pathInput, setPathInput] = useState("");
  const worldStats = useGameStore((s) => s.worldStats);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  if (!open) return null;
  return (
    <aside className="settings-panel">
      <div className="settings-header">
        <span>Settings</span>
        <button onClick={onClose} title="Close">×</button>
      </div>
      <div className="settings-body">
        <section>
          <h3>World</h3>
          <dl className="kv">
            <dt>seed</dt><dd>{worldStats.seed}</dd>
            <dt>day</dt><dd>{worldStats.day} (Y{worldStats.year})</dd>
            <dt>season</dt><dd>{worldStats.season}</dd>
            <dt>hour</dt><dd>{worldStats.hour.toFixed(1)}</dd>
            <dt>weather</dt><dd>{worldStats.weather}</dd>
            <dt>npcs</dt><dd>{worldStats.npcCount}</dd>
            <dt>achievements</dt><dd>{Object.keys(achievements).length}</dd>
          </dl>
          <label className="row" style={{ marginTop: 10 }}>
            <input
              type="checkbox"
              checked={settings.followRealSeasons}
              onChange={(e) => setFollowRealSeasons(e.target.checked)}
            />
            Follow real-world seasons
          </label>
          <div style={{ marginTop: 12 }}>
            <h3 style={{
              margin: "0 0 6px",
              fontSize: 11,
              letterSpacing: "0.15em",
              color: "var(--accent)",
              textTransform: "uppercase",
            }}>Kingdom motto</h3>
            <input
              type="text"
              maxLength={KINGDOM_MOTTO_MAX}
              value={identity?.kingdomMotto ?? ""}
              placeholder="e.g. By bread and starlight"
              onChange={(e) => {
                if (!identity) return;
                setIdentity({ ...identity, kingdomMotto: e.target.value });
              }}
              disabled={!identity}
              style={{
                width: "100%",
                background: "transparent",
                color: "var(--panel-fg)",
                border: "1px solid var(--hud-border)",
                padding: "6px 8px",
                font: "inherit",
                fontSize: 12,
              }}
            />
            <div className="muted" style={{ fontSize: 10, marginTop: 4, fontStyle: "italic" }}>
              A one-line saying, shown on the Kingdom Card. Up to {KINGDOM_MOTTO_MAX} characters. Persists across reigns.
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <h3 style={{
              margin: "0 0 6px",
              fontSize: 11,
              letterSpacing: "0.15em",
              color: "var(--accent)",
              textTransform: "uppercase",
            }}>Royal banner</h3>
            <div className="swatches">
              {FABRIC_COLORS.map((c) => {
                const cur = identity?.bannerColor ?? "#dc2626";
                return (
                  <button
                    key={c}
                    type="button"
                    className={"swatch" + (c === cur ? " selected" : "")}
                    style={{ background: c, width: 20, height: 20 }}
                    onClick={() => {
                      if (!identity) return;
                      setIdentity({ ...identity, bannerColor: c });
                    }}
                    disabled={!identity}
                  />
                );
              })}
            </div>
          </div>
          <button
            onClick={onOpenCreator}
            style={{ marginTop: 12, width: "100%" }}
          >
            Customize monarch
          </button>
          <button
            onClick={onOpenPetCreator}
            style={{ marginTop: 8, width: "100%" }}
          >
            Customize companion
          </button>
          <button
            onClick={onOpenKingdomCard}
            style={{ marginTop: 8, width: "100%" }}
            title="Generate a shareable card of your kingdom"
            disabled={!identity}
          >
            Share kingdom (card)
          </button>
          <button
            onClick={onOpenChronicle}
            style={{ marginTop: 8, width: "100%" }}
            title="View the auto-generated prose history of your kingdom"
            disabled={!identity}
          >
            📜 Kingdom Chronicle
          </button>
          <button
            onClick={onOpenVault}
            style={{ marginTop: 8, width: "100%" }}
            title="Browse all artifacts in the royal vault"
            disabled={!identity}
          >
            ◆ Royal Vault
          </button>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button
              style={{ flex: 1 }}
              onClick={() => {
                const save = readSave();
                if (save) exportSave(save);
                else setImportMsg("No save found to export yet.");
              }}
            >
              Export save
            </button>
            <button
              style={{ flex: 1 }}
              onClick={() => importInputRef.current?.click()}
            >
              Import save
            </button>
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.kingdomos.json,application/json"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (!file) return;
              const ok = await importSaveFromFile(file);
              if (!ok) {
                setImportMsg("That file couldn't be loaded as a valid KingdomOS save.");
                return;
              }
              if (
                !confirm(
                  `Replace your current realm with "${ok.kingdomName ?? "the imported kingdom"}"? This cannot be undone.`,
                )
              ) {
                return;
              }
              commitImportedSave(ok);
              // Skip the unload-save race, then reload.
              (window as unknown as { __kingdomos_skip_save?: boolean }).__kingdomos_skip_save = true;
              location.reload();
            }}
          />
          {importMsg && (
            <p className="tip" style={{ color: "#fca5a5" }}>{importMsg}</p>
          )}
          <button
            className="danger"
            onClick={() => {
              if (
                confirm(
                  "Found a new kingdom? Your current realm — NPCs, journal, achievements — will be lost forever.",
                )
              ) {
                resetKingdom();
              }
            }}
            style={{ marginTop: 8 }}
          >
            Found new kingdom
          </button>
        </section>
        <section>
          <h3>Visual</h3>
          <label className="row">
            <input
              type="checkbox"
              checked={settings.retro16bit}
              onChange={(e) => {
                setRetro16bit(e.target.checked);
                // Requires reload — PixiApp reads this once at init.
                if (confirm("Switching pixel mode requires a reload. Reload now?")) {
                  location.reload();
                }
              }}
            />
            Retro 16-bit mode (480×270, chunky pixels)
            <span className="tip" style={{ display: "block", marginTop: 2 }}>
              Renders at low resolution then upscales — requires reload.
            </span>
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={settings.crt}
              onChange={(e) => setCrt(e.target.checked)}
            />
            CRT scanlines
          </label>
          <label className="row">
            <span>simulation speed: {settings.simSpeed.toFixed(1)}×</span>
            <input
              type="range"
              min="0"
              max="3"
              step="0.25"
              value={settings.simSpeed}
              onChange={(e) => setSimSpeed(parseFloat(e.target.value))}
            />
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={settings.showPerfHud}
              onChange={(e) => setShowPerfHud(e.target.checked)}
            />
            Show performance overlay (FPS + counts)
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={settings.musicEnabled}
              onChange={(e) => setMusicEnabled(e.target.checked)}
            />
            Ambient melody (sparse phrases over the pad)
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={settings.cutawayMode}
              onChange={(e) => setCutawayMode(e.target.checked)}
            />
            Cutaway / dollhouse mode (X key) — see NPCs inside their buildings
          </label>
          <label className="row">
            <span>audio volume: {(settings.audioVolume * 100).toFixed(0)}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.audioVolume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
            />
          </label>
        </section>
        <section>
          <h3>Diagnostics</h3>
          <p className="tip" style={{ marginTop: 0 }}>
            Manually fire test events into the world. Useful when wiring an integration.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            <button onClick={() => fireTestEvent("courier")}>Courier</button>
            <button onClick={() => fireTestEvent("forge")}>Forge</button>
            <button onClick={() => fireTestEvent("research")}>Scholar</button>
            <button onClick={() => fireTestEvent("mining")}>Mining</button>
            <button onClick={() => fireTestEvent("storm")}>Storm</button>
            <button onClick={() => fireTestEvent("celebration")}>Celebrate</button>
            <button onClick={() => fireTestEvent("festival")}>Festival</button>
            <button onClick={() => fireTestEvent("airship")}>Airship</button>
            <button onClick={() => fireTestEvent("monster")}>Monster</button>
          </div>
          <p className="tip" style={{ marginTop: 8 }}>Twitch (test users):</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            <button onClick={() => fireTwitch("follow", "test_follower")}>+ Follow</button>
            <button onClick={() => fireTwitch("sub", "test_sub", 1)}>+ Sub</button>
            <button onClick={() => fireTwitch("bits", "test_cheerer", 200)}>+ 200 bits</button>
            <button onClick={() => fireTwitch("raid", "test_raider", 25)}>+ Raid 25</button>
          </div>
        </section>

        <section>
          <h3>Accessibility</h3>
          <label className="row">
            <span>UI text scale</span>
            <span style={{ display: "inline-flex", gap: 4 }}>
              {[0.85, 1, 1.15, 1.3, 1.5].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={Math.abs((settings.uiScale ?? 1) - v) < 0.01 ? "primary" : "ghost"}
                  onClick={() => setUiScale(v)}
                  style={{ minWidth: 36, padding: "4px 8px" }}
                >
                  {v === 1 ? "1×" : `${v}×`}
                </button>
              ))}
            </span>
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={!!settings.colorblindMode}
              onChange={(e) => setColorblindMode(e.target.checked)}
            />
            Colorblind-friendly faction dots
          </label>
          <p className="tip">
            Scale resizes HUD + panel text without touching the world canvas.
            Colorblind mode swaps faction-loyalty colours to high-contrast
            hues that don't rely on red/green discrimination.
          </p>
        </section>

        <section>
          <h3>Tutorial</h3>
          <p className="tip">
            New to the kingdom? Replay the guided tour — it pauses the
            world and walks you through what each control does.
          </p>
          <button
            type="button"
            onClick={() => {
              setShowTutorial(true);
              onClose();
            }}
            style={{ marginTop: 4 }}
          >
            Replay tutorial
          </button>
        </section>

        <section>
          <h3>Streamer mode</h3>
          <label className="row">
            <input
              type="checkbox"
              checked={settings.streamerMode}
              onChange={(e) => setStreamerMode(e.target.checked)}
            />
            Enable streamer overlay (hides HUD)
          </label>
          <label className="row">
            <span>Twitch channel</span>
            <input
              type="text"
              placeholder="your-channel-name"
              value={settings.twitchChannel}
              onChange={(e) => setTwitchChannel(e.target.value)}
            />
          </label>
          <p className="tip">
            When on: HUD and panels hide; a small Twitch event ticker appears
            top-right. Use as an OBS Browser Source pointed at the running
            dev URL. Test events from devtools:{" "}
            <code>window.kingdomos.twitch.sub("Alice")</code>
          </p>
        </section>

        <section>
          <h3>Integrations</h3>
          {(Object.keys(settings.integrations) as Array<keyof typeof settings.integrations>).map((k) => (
            <label key={k} className="row">
              <input
                type="checkbox"
                checked={settings.integrations[k]}
                onChange={(e) => setIntegration(k, e.target.checked)}
              />
              {k}
              {k === "http" && (
                <small> &nbsp;(local 127.0.0.1 only — opt-in)</small>
              )}
            </label>
          ))}
          <p className="tip">
            All integrations are optional. The world simulates on its own — try
            switching everything off for the pure ambient mode.
          </p>
        </section>
        <section>
          <h3>Watched paths (FS / Git)</h3>
          <ul className="watched">
            {settings.watchedPaths.map((p) => (
              <li key={p}>
                <code>{p}</code>
                <button onClick={() => removeWatchedPath(p)} title="Remove">−</button>
              </li>
            ))}
            {settings.watchedPaths.length === 0 && (
              <li className="muted">no paths watched</li>
            )}
          </ul>
          <div className="row">
            <input
              type="text"
              placeholder="C:\Users\you\Projects\my-repo"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
            />
            <button
              onClick={() => {
                if (pathInput.trim()) {
                  addWatchedPath(pathInput.trim());
                  setPathInput("");
                }
              }}
            >
              add
            </button>
          </div>
        </section>
        <section>
          <h3>Feedback</h3>
          <p className="tip">
            Got an idea, a bug, or a moment you loved? Tell the dev directly.
            Submissions go straight to the team — no signup, no tracker.
          </p>
          <button
            type="button"
            className="primary"
            onClick={onOpenFeedback}
            style={{ marginTop: 4 }}
          >
            Send feedback
          </button>
        </section>
        <DiagnosticsSection />
      </div>
    </aside>
  );
}

/**
 * Diagnostics — shows the local crash log and lets the player download it
 * for bug reports. Intentionally small: the heuristic is "if the game
 * just blanked the screen, the player should be able to grab a useful
 * file in under three clicks."
 */
function DiagnosticsSection() {
  const [tick, setTick] = useState(0);
  void tick;
  const entries = getCrashLog();
  const count = entries.length;
  return (
    <section>
      <h3>Diagnostics</h3>
      <p className="tip">
        {count === 0
          ? "No crashes recorded. (This is a good thing.)"
          : `${count} crash${count === 1 ? "" : "es"} recorded — most recent: ${entries[entries.length - 1]?.message ?? "—"}`}
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          disabled={count === 0}
          onClick={() => {
            const text = formatCrashLog(entries);
            const blob = new Blob([text], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `kingdomos-crashlog-${new Date().toISOString().slice(0, 10)}.txt`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download crash log
        </button>
        <button
          type="button"
          className="danger"
          disabled={count === 0}
          onClick={() => {
            if (!confirm("Clear the local crash log? (This doesn't fix anything — just empties the buffer.)")) return;
            clearCrashLog();
            setTick((n) => n + 1);
          }}
        >
          Clear log
        </button>
      </div>
    </section>
  );
}
