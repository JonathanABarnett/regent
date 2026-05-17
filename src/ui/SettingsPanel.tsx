import { useEffect, useRef, useState } from "react";
import { useGameStore, KINGDOM_MOTTO_MAX } from "../store/useGameStore";
import { FABRIC_COLORS } from "../engine/CharacterSpec";
import {
  exportSave,
  importSaveFromFile,
  commitImportedSave,
  readSave,
} from "../sim/Persistence";

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
}: {
  open: boolean;
  onClose: () => void;
  onOpenCreator: () => void;
  onOpenPetCreator: () => void;
  onOpenKingdomCard: () => void;
  onOpenChronicle: () => void;
  onOpenVault: () => void;
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
  const setPadEnabled = useGameStore((s) => s.setPadEnabled);
  const setCutawayMode = useGameStore((s) => s.setCutawayMode);
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
        <EdictsSection />
        <section>
          <h3>Visual</h3>
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
              checked={settings.padEnabled}
              onChange={(e) => setPadEnabled(e.target.checked)}
            />
            Ambient drone pad (the quiet background hum)
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
      </div>
    </aside>
  );
}

/**
 * Royal Edicts picker. Reads + writes through window.kingdomos.world() so
 * the section can live in SettingsPanel without growing the panel's prop
 * surface or threading the world reference through. State updates every
 * second so the "days left" countdown stays current.
 */
function EdictsSection() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  // touch tick so React knows this re-render is coming from the interval
  void tick;

  const k = (window as unknown as {
    kingdomos?: {
      world: () => {
        edicts?: {
          status: () => { active: string | null; daysLeft: number };
          proclaim: (id: string) => boolean;
          revoke: () => void;
        };
      };
    };
  }).kingdomos;
  const world = k?.world();
  const edicts = world?.edicts;
  if (!edicts) return null;
  const status = edicts.status();

  // Keep the def list local to the component so we don't need a fresh import
  // just to render labels — keeps the bundle's tree-shake clean.
  const DEFS: Array<{ id: string; label: string; blurb: string }> = [
    { id: "hospitality", label: "Edict of Hospitality", blurb: "Travelers arrive more often. The roads stay warm." },
    { id: "studious", label: "Edict of Letters", blurb: "+50% tome production for seven days." },
    { id: "frugal", label: "Edict of Thrift", blurb: "Gold accumulates +25% for seven days." },
    { id: "open_court", label: "Edict of an Open Court", blurb: "Royal decisions linger longer before defaulting." },
  ];

  return (
    <section>
      <h3>Royal edicts</h3>
      <div className="muted" style={{ fontSize: 11, fontStyle: "italic", marginBottom: 8 }}>
        Choose one short decree; the kingdom reacts. Each lasts seven in-world days. Only one at a time.
      </div>
      {status.active ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>
            Active: {DEFS.find((d) => d.id === status.active)?.label ?? status.active}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            {status.daysLeft} day{status.daysLeft === 1 ? "" : "s"} remaining.
          </div>
          <button
            style={{ marginTop: 6, width: "100%" }}
            onClick={() => edicts.revoke()}
            title="Rescind the active edict immediately"
          >
            Revoke
          </button>
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
          No edict currently in force.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {DEFS.map((d) => (
          <button
            key={d.id}
            onClick={() => edicts.proclaim(d.id)}
            disabled={status.active === d.id}
            title={d.blurb}
            style={{ textAlign: "left", padding: "6px 8px" }}
          >
            <div style={{ fontWeight: 600, fontSize: 11 }}>{d.label}</div>
            <div className="muted" style={{ fontSize: 10, fontStyle: "italic", marginTop: 1 }}>
              {d.blurb}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
