import { useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { CanvasSurface, drawCharacter } from "../engine/CharacterRenderer";
import { AboutDialog } from "./AboutDialog";
import { PastKingdoms } from "./PastKingdoms";
import pkg from "../../package.json";
import {
  readSave,
  readAllSlotMeta,
  setActiveSlot,
  getActiveSlot,
  clearSaveSlot,
  SLOT_COUNT,
  type SlotMeta,
} from "../sim/Persistence";
import { readArchive } from "../sim/KingdomArchive";

/**
 * Pre-game title screen with main-menu actions.
 *
 * Shown when:
 *   - The app first boots (no save) → "New Kingdom" is the primary CTA
 *   - The user explicitly toggles a "return to title" action
 *
 * Tagline + animated decorative monarch/pet preview if a save exists,
 * otherwise a small marching village procession across the bottom.
 */
export function TitleScreen({
  hasSave,
  onContinue,
  onNew,
  onSettings,
  onQuit,
}: {
  hasSave: boolean;
  onContinue: () => void;
  onNew: () => void;
  onSettings: () => void;
  onQuit?: () => void;
}) {
  const identity = useGameStore((s) => s.identity);
  const monarchSpec = useGameStore((s) => s.monarchSpec);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [showSlots, setShowSlots] = useState(false);
  const [activeSlot, setActiveSlotState] = useState(getActiveSlot);
  /** Bumps to force the slot metadata to re-read after we wipe a slot. */
  const [slotsRev, setSlotsRev] = useState(0);
  const pastCount = useMemo(() => readArchive().length, []);
  const slotMeta = useMemo<SlotMeta[]>(() => readAllSlotMeta(), [showSlots, slotsRev]);

  // Pull the 3 most recent journal entries off the save file for the news
  // ticker. Computed once on mount because the title screen doesn't observe
  // the world tick.
  const recentEntries = useMemo(() => {
    if (!hasSave) return [];
    const save = readSave();
    if (!save?.journal) return [];
    return save.journal.slice(-3).reverse();
  }, [hasSave]);

  // Esc closes About or PastKingdoms if open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (aboutOpen) setAboutOpen(false);
      else if (pastOpen) setPastOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aboutOpen, pastOpen]);

  useEffect(() => {
    if (!hasSave) return;
    const id = window.setInterval(() => setFrame((f) => (f + 1) % 4), 280);
    return () => clearInterval(id);
  }, [hasSave]);

  useEffect(() => {
    if (!hasSave) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const off = document.createElement("canvas");
    off.width = 32;
    off.height = 32;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    drawCharacter(new CanvasSurface(offCtx), monarchSpec, frame, "s");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }, [hasSave, monarchSpec, frame]);

  return (
    <div className="title-overlay">
      <div className="title-card">
        <div className="title-crest">✦</div>
        <h1 className="title-wordmark">KingdomOS</h1>
        <p className="title-tagline">
          A small fantasy world,<br />living on your desktop.
        </p>

        {hasSave && (
          <div className="title-monarch-preview">
            <canvas ref={canvasRef} width={96} height={96} />
            <div className="title-monarch-meta">
              <div className="title-monarch-name">
                {identity?.monarchName ?? "Your monarch"}
              </div>
              <div className="title-monarch-sub">
                of {identity?.kingdomName ?? "the kingdom"}
              </div>
            </div>
          </div>
        )}

        {hasSave && recentEntries.length > 0 && (
          <div className="title-news">
            <div className="title-news-label">Latest from the realm</div>
            <ul>
              {recentEntries.map((e) => (
                <li key={e.id} className={`title-news-entry kind-${e.kind}`}>
                  <span className="title-news-day">Day {e.day}</span>
                  <span className="title-news-text">{e.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Save slot picker */}
        {showSlots && (
          <div className="slot-picker">
            <div className="slot-picker-label">Choose a save slot</div>
            {slotMeta.map((meta) => (
              <div
                key={meta.slot}
                className={`slot-row ${meta.slot === activeSlot ? "slot-active" : ""}`}
              >
                <button
                  type="button"
                  className="slot-btn"
                  onClick={() => {
                    setActiveSlot(meta.slot);
                    setActiveSlotState(meta.slot);
                    setShowSlots(false);
                    if (!meta.empty) onContinue();
                    else onNew();
                  }}
                >
                  <span className="slot-num">Slot {meta.slot + 1}</span>
                  {meta.empty ? (
                    <span className="slot-empty">— empty —</span>
                  ) : (
                    <span className="slot-info">
                      <span className="slot-name">{meta.kingdomName ?? "Unnamed"}</span>
                      <span className="slot-sub">Y{meta.year} · {meta.population} souls</span>
                    </span>
                  )}
                </button>
                {!meta.empty && (
                  <button
                    type="button"
                    className="slot-delete"
                    title={`Permanently delete the kingdom in slot ${meta.slot + 1}`}
                    aria-label={`Delete slot ${meta.slot + 1}`}
                    onClick={() => {
                      const label = meta.kingdomName ?? `slot ${meta.slot + 1}`;
                      if (
                        !confirm(
                          `Permanently delete ${label}? This kingdom and its journal will be erased. ` +
                            `(It will not be moved to Past Kingdoms.)`,
                        )
                      ) return;
                      clearSaveSlot(meta.slot);
                      // If we just wiped the active slot, reload — the title
                      // detects "has a save" once at mount, so the Continue
                      // button would otherwise stay live and try to load
                      // nothing. (resetKingdom would also archive, which is
                      // the opposite of what the player asked for.)
                      if (meta.slot === activeSlot) {
                        // Skip the unload-save race that would re-persist the
                        // very kingdom we just deleted.
                        (window as unknown as { __kingdomos_skip_save?: boolean }).__kingdomos_skip_save = true;
                        location.reload();
                        return;
                      }
                      setSlotsRev((v) => v + 1);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button className="slot-cancel" onClick={() => setShowSlots(false)}>Cancel</button>
          </div>
        )}

        <div className="title-actions">
          {hasSave && (
            <button className="primary" onClick={onContinue}>
              Continue
            </button>
          )}
          <button
            className="ghost"
            onClick={() => setShowSlots(true)}
            title="Switch between save slots"
          >
            {SLOT_COUNT > 1 ? `Slot ${activeSlot + 1} ▾` : "Slots"}
          </button>
          <button
            className={hasSave ? "ghost" : "primary"}
            onClick={() => {
              if (
                hasSave &&
                !confirm(
                  "Start a new kingdom in this slot? The current realm will be archived.",
                )
              ) {
                return;
              }
              onNew();
            }}
          >
            {hasSave ? "New Kingdom" : "Begin"}
          </button>
          <button
            className="ghost title-howto"
            title="A short, paused walkthrough of what everything does"
            onClick={() => {
              // Arm the guided tour, then drop into the game so it can
              // run (the tour highlights in-game HUD elements, so it needs
              // a founded kingdom). Continue an existing realm if there is
              // one; otherwise start a fresh kingdom — either way the
              // paused tour fires a few seconds after the world loads.
              useGameStore.getState().setShowTutorial(true);
              if (hasSave) onContinue();
              else onNew();
            }}
          >
            ❓ How to Play
          </button>
          <button className="ghost" onClick={onSettings}>
            Settings
          </button>
          {pastCount > 0 && (
            <button
              className="ghost"
              onClick={() => setPastOpen(true)}
              title={`Browse ${pastCount} archived kingdom${pastCount === 1 ? "" : "s"}`}
            >
              Past kingdoms ({pastCount})
            </button>
          )}
          <button className="ghost" onClick={() => setAboutOpen(true)}>
            About
          </button>
          {onQuit && (
            <button className="ghost" onClick={onQuit}>
              Quit
            </button>
          )}
        </div>

        <p className="title-footer">v{pkg.version} · jonat</p>
      </div>
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      <PastKingdoms open={pastOpen} onClose={() => setPastOpen(false)} />
    </div>
  );
}
