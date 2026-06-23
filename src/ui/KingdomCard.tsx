import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import type { World } from "../sim/World";
import {
  composeCardInput,
  composeReignCardInput,
  cardFilename,
  reignCardFilename,
  CARD_WIDTH,
  CARD_HEIGHT,
} from "./kingdom-card-data";
import type { ReignChapter } from "../sim/systems/Chronicle";
import { drawKingdomCard, CARD_TEMPLATES, type CardTemplate } from "./kingdom-card-renderer";
import { CanvasSurface, drawCharacter } from "../engine/CharacterRenderer";
import { drawPet } from "../engine/PetSpec";
import type { CharacterSpec } from "../engine/CharacterSpec";
import type { PetSpec } from "../engine/PetSpec";
import { Achievements } from "../sim/systems/Achievements";

/**
 * Render a monarch or pet spec to an offscreen 32×32 canvas, suitable for
 * passing to the card renderer's `drawImage` calls.
 */
function spriteCanvas(
  draw: (surface: CanvasSurface, frame: number) => void,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    draw(new CanvasSurface(ctx), 0);
  }
  return c;
}

function monarchSpriteCanvas(spec: CharacterSpec): HTMLCanvasElement {
  return spriteCanvas((surface, frame) => drawCharacter(surface, spec, frame));
}

function petSpriteCanvas(spec: PetSpec): HTMLCanvasElement {
  return spriteCanvas((surface, frame) => drawPet(surface, spec, frame));
}

/**
 * The Kingdom Card modal.
 *
 * The card is a programmatically-composed 1200×630 PNG that summarizes the
 * player's kingdom — kingdom name, monarch, generation, last several
 * milestone journal entries — into a single shareable artifact. Unlike
 * photo mode (which screenshots the live scene), this is a generative
 * composition: every share is a clean, on-brand image regardless of what
 * happened to be on-screen.
 *
 * Pass 1 ships a single "parchment" template. Pass 2 adds the monarch and
 * pet sprites; pass 3 adds stats; pass 4 adds multiple templates.
 */
export function KingdomCard({
  world,
  open,
  onClose,
  reign,
}: {
  world: World | null;
  open: boolean;
  onClose: () => void;
  /** When set, render a card for this single reign (chapter) instead of the whole kingdom. */
  reign?: ReignChapter | null;
}) {
  const identity = useGameStore((s) => s.identity);
  const journal = useGameStore((s) => s.journal);
  const monarchSpec = useGameStore((s) => s.monarchSpec);
  const petSpec = useGameStore((s) => s.petSpec);
  const achievements = useGameStore((s) => s.achievements);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [template, setTemplate] = useState<CardTemplate>("parchment");

  useEffect(() => {
    if (!open || !identity) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      if (reign) {
        // Single-reign card: foreground the monarch + era. No portrait inset —
        // the live monarch sprite isn't this historical ruler.
        const input = composeReignCardInput({
          chapter: reign,
          kingdomName: identity.kingdomName ?? "Aurelia",
          bannerColor: identity.bannerColor ?? "#b45309",
        });
        drawKingdomCard(ctx, input, { template });
        setDataUrl(canvas.toDataURL("image/png"));
        return;
      }
      if (!world) return;
      const input = composeCardInput({
        kingdomName: identity.kingdomName ?? "Aurelia",
        monarchName: identity.monarchName ?? "the Monarch",
        petName: world.pets[0]?.name,
        bannerColor: identity.bannerColor ?? "#b45309",
        day: world.state.day,
        year: world.state.year,
        generation: world.succession.state.generation,
        motto: identity.kingdomMotto,
        journal,
        stats: {
          population: world.npcs.length,
          gold: Math.floor(world.economy.state.gold),
          vault: world.treasury.count(),
          achievementsUnlocked: Object.keys(achievements).length,
          achievementsTotal: Achievements.definitions().length,
          populationSeries: world.history.series("population"),
        },
      });
      // Render the monarch + pet to small offscreen canvases at native 32×32
      // resolution. The card renderer scales them up with smoothing off so
      // they read as crisp pixel art rather than blurred photo stand-ins.
      const monarchImg = monarchSpriteCanvas(monarchSpec);
      const petImg = petSpec ? petSpriteCanvas(petSpec) : undefined;
      drawKingdomCard(ctx, input, {
        template,
        monarchSprite: monarchImg,
        petSprite: petImg,
      });
      setDataUrl(canvas.toDataURL("image/png"));
    } catch (err) {
      console.warn("[KingdomCard] render failed", err);
    }
  }, [open, world, identity, journal, monarchSpec, petSpec, achievements, template, reign]);

  // Esc-to-close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function download() {
    if (!dataUrl || !identity) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = reign
      ? reignCardFilename(identity.kingdomName ?? "kingdom", reign.chapter, reign.name)
      : cardFilename(identity.kingdomName ?? "kingdom", world?.state.day ?? 0, world?.state.year ?? 0);
    a.click();
  }

  function copyToClipboard() {
    if (!dataUrl) return;
    fetch(dataUrl)
      .then((r) => r.blob())
      .then((blob) =>
        navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]),
      )
      .catch((err) => console.warn("[KingdomCard] clipboard write failed", err));
  }

  if (!open) return null;
  return (
    <div
      className="kingdom-card-modal"
      onClick={onClose}
      role="dialog"
      aria-label={reign ? "Share this reign" : "Share your kingdom"}
    >
      <div className="kingdom-card-frame" onClick={(e) => e.stopPropagation()}>
        <div className="kingdom-card-canvas-wrap">
          <canvas ref={canvasRef} className="kingdom-card-canvas" />
        </div>
        <div className="kingdom-card-actions">
          <div className="kingdom-card-hint">
            {reign
              ? `Chapter ${reign.chapter} — ${reign.name}, ${reign.epithet}. A card you can share or save.`
              : "A keepsake card you can share or save. Built from the chronicle."}
          </div>
          <div className="kingdom-card-templates" role="radiogroup" aria-label="Card style">
            {CARD_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={"kingdom-card-template-btn" + (template === t.id ? " active" : "")}
                title={t.blurb}
                role="radio"
                aria-checked={template === t.id}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="kingdom-card-buttons">
            <button onClick={copyToClipboard} disabled={!dataUrl}>
              Copy
            </button>
            <button onClick={download} disabled={!dataUrl}>
              Save PNG
            </button>
            <button onClick={onClose}>Close (Esc)</button>
          </div>
        </div>
      </div>
    </div>
  );
}
