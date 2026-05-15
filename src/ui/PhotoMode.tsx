import { useEffect, useState } from "react";

/**
 * Photo mode. Press `P` to pause + frame + screenshot the current scene.
 *
 * This is the project's primary marketing engine: every cute frame a user
 * shares is free distribution. Multiple frame styles let players match
 * their kingdom's vibe — parchment for cozy, classic wood for stately,
 * window for a "looking out into your kingdom" feel.
 */

export interface PhotoModeOpts {
  /** Returns the live pixi <canvas> element. */
  getCanvas: () => HTMLCanvasElement | null;
  /** Returns the current world stat line (e.g. "Day 47 · clear · Highkeep"). */
  getCaption: () => string;
}

type FrameStyle = "wood" | "parchment" | "stone" | "window" | "naked";

const FRAME_STYLES: FrameStyle[] = ["wood", "parchment", "stone", "window", "naked"];

export function PhotoMode({ getCanvas, getCaption }: PhotoModeOpts) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [styleIdx, setStyleIdx] = useState(0);
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);

  // Re-render with the current style whenever it changes
  useEffect(() => {
    if (!open || !sourceCanvas) return;
    try {
      setDataUrl(renderFramed(sourceCanvas, caption, FRAME_STYLES[styleIdx]));
    } catch (err) {
      console.warn("[PhotoMode] re-frame failed", err);
    }
  }, [styleIdx, open, sourceCanvas, caption]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        capture();
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function capture() {
    const canvas = getCanvas();
    if (!canvas) return;
    const cap = getCaption();
    setCaption(cap);
    setSourceCanvas(canvas);
    try {
      setDataUrl(renderFramed(canvas, cap, FRAME_STYLES[styleIdx]));
      setOpen(true);
    } catch (err) {
      console.warn("[PhotoMode] capture failed", err);
    }
  }

  function copyToClipboard() {
    if (!dataUrl) return;
    fetch(dataUrl)
      .then((r) => r.blob())
      .then((blob) => navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]))
      .catch((err) => console.warn("[PhotoMode] clipboard write failed", err));
  }

  function download() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `kingdomos-${FRAME_STYLES[styleIdx]}-${Date.now()}.png`;
    a.click();
  }

  function cycleStyle() {
    setStyleIdx((i) => (i + 1) % FRAME_STYLES.length);
  }

  if (!open) return null;
  return (
    <div className="photo-modal" onClick={() => setOpen(false)}>
      <div className="photo-card" onClick={(e) => e.stopPropagation()}>
        {dataUrl && <img src={dataUrl} alt="kingdom photo" />}
        <div className="photo-caption">{caption}</div>
        <div className="photo-actions">
          <button onClick={cycleStyle} title="Cycle frame style">
            Frame: {FRAME_STYLES[styleIdx]}
          </button>
          <button onClick={copyToClipboard}>Copy</button>
          <button onClick={download}>Save PNG</button>
          <button onClick={() => setOpen(false)}>Close (Esc)</button>
        </div>
      </div>
    </div>
  );
}

/** Render the source canvas into a styled composition with caption. */
function renderFramed(source: HTMLCanvasElement, caption: string, style: FrameStyle): string {
  if (style === "naked") {
    return source.toDataURL("image/png");
  }
  const padding = style === "window" ? 56 : 40;
  const captionH = 60;
  const out = document.createElement("canvas");
  out.width = source.width + padding * 2;
  out.height = source.height + padding * 2 + captionH;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("no 2d ctx");
  ctx.imageSmoothingEnabled = false;

  drawFrame(ctx, out.width, out.height, style);

  // Inner thin border
  if (style !== "window") {
    ctx.fillStyle = style === "parchment" ? "#3f2616" : "#0c0a09";
    ctx.fillRect(padding - 4, padding - 4, source.width + 8, source.height + 8);
  }

  // The actual scene
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, padding, padding, source.width, source.height);

  // Optional window "muntins" overlay — cross of brass-y bars
  if (style === "window") {
    drawWindowBars(ctx, padding, source.width, source.height);
  }

  // Caption
  ctx.fillStyle = captionColor(style);
  ctx.font = "bold 22px 'Press Start 2P', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    caption,
    out.width / 2,
    padding + source.height + captionH / 2 + 4,
    out.width - padding * 2,
  );

  // Tiny wordmark
  ctx.fillStyle = wordmarkColor(style);
  ctx.font = "11px monospace";
  ctx.textAlign = "right";
  ctx.fillText("KingdomOS", out.width - 12, out.height - 8);

  return out.toDataURL("image/png");
}

function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, style: FrameStyle) {
  switch (style) {
    case "wood": {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#3f2616");
      grad.addColorStop(0.5, "#5a3a22");
      grad.addColorStop(1, "#2a190d");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "parchment": {
      ctx.fillStyle = "#fde68a";
      ctx.fillRect(0, 0, w, h);
      // soft mottling
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(146, 64, 14, ${0.04 + Math.random() * 0.04})`;
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.fillRect(x, y, 2 + Math.random() * 8, 1);
      }
      // burned-edge vignette
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(80,40,15,0.45)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "stone": {
      ctx.fillStyle = "#52525b";
      ctx.fillRect(0, 0, w, h);
      // brick lines
      for (let y = 0; y < h; y += 24) {
        ctx.fillStyle = "#3f3f46";
        ctx.fillRect(0, y, w, 1);
        const offset = (y / 24) % 2 === 0 ? 0 : 32;
        for (let x = offset; x < w; x += 64) {
          ctx.fillRect(x, y, 1, 24);
        }
      }
      break;
    }
    case "window": {
      // Bronze frame
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#92400e");
      grad.addColorStop(0.5, "#b45309");
      grad.addColorStop(1, "#78350f");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // Inner shadow ring
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(8, 8, w - 16, 4);
      ctx.fillRect(8, h - 12, w - 16, 4);
      ctx.fillRect(8, 8, 4, h - 16);
      ctx.fillRect(w - 12, 8, 4, h - 16);
      break;
    }
    default:
      ctx.fillStyle = "#0c0a09";
      ctx.fillRect(0, 0, w, h);
  }
}

function drawWindowBars(
  ctx: CanvasRenderingContext2D,
  padding: number,
  contentW: number,
  contentH: number,
) {
  ctx.fillStyle = "rgba(120, 53, 15, 0.85)";
  // Vertical center bar
  ctx.fillRect(padding + contentW / 2 - 2, padding, 4, contentH);
  // Horizontal center bar
  ctx.fillRect(padding, padding + contentH / 2 - 2, contentW, 4);
}

function captionColor(style: FrameStyle): string {
  switch (style) {
    case "parchment": return "#92400e";
    case "window": return "#fde68a";
    default: return "#fbbf24";
  }
}

function wordmarkColor(style: FrameStyle): string {
  switch (style) {
    case "parchment": return "#92400e";
    case "window": return "#fde68a";
    default: return "#92400e";
  }
}
