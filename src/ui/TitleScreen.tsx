import { useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { CanvasSurface, drawCharacter } from "../engine/CharacterRenderer";
import { AboutDialog } from "./AboutDialog";
import { PastKingdoms } from "./PastKingdoms";
import { readSave } from "../sim/Persistence";
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
  const pastCount = useMemo(() => readArchive().length, []);

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

        <div className="title-actions">
          {hasSave && (
            <button className="primary" onClick={onContinue}>
              Continue
            </button>
          )}
          <button
            className={hasSave ? "ghost" : "primary"}
            onClick={() => {
              if (
                hasSave &&
                !confirm(
                  "Found a new kingdom? Your current realm will be lost forever.",
                )
              ) {
                return;
              }
              onNew();
            }}
          >
            {hasSave ? "New Kingdom" : "Begin"}
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

        <p className="title-footer">v0.1 · jonat</p>
      </div>
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      <PastKingdoms open={pastOpen} onClose={() => setPastOpen(false)} />
    </div>
  );
}
