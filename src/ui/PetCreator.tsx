import { useEffect, useRef, useState } from "react";
import type { PetAccessory, PetKind, PetSpec } from "../engine/PetSpec";
import {
  PET_ACCESSORIES,
  PET_BODY_COLORS,
  PET_EYE_COLORS,
  defaultPetSpec,
} from "../engine/PetSpec";
import { FABRIC_COLORS } from "../engine/CharacterSpec";
import { CanvasSurface } from "../engine/CharacterRenderer";
import { drawPet } from "../engine/PetSpec";

const SCALE = 7;
const KINDS: PetKind[] = ["dog", "cat"];

export function PetCreator({
  initialSpec,
  title,
  ctaLabel,
  onCommit,
  onCancel,
}: {
  initialSpec: PetSpec;
  title?: string;
  ctaLabel?: string;
  onCommit: (spec: PetSpec) => void;
  onCancel?: () => void;
}) {
  const [spec, setSpec] = useState<PetSpec>(initialSpec);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setFrame((f) => (f + 1) % 4), 280);
    return () => clearInterval(id);
  }, []);

  // Keyboard shortcuts mirror the CharacterCreator's: Esc cancels,
  // Ctrl/Cmd-Enter commits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (e.key === "Escape" && onCancel) {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onCommit(spec);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onCommit, spec]);

  useEffect(() => {
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
    drawPet(new CanvasSurface(offCtx), spec, frame);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }, [spec, frame]);

  const set = <K extends keyof PetSpec>(k: K, v: PetSpec[K]) =>
    setSpec((s) => ({ ...s, [k]: v }));

  return (
    <div className="creator-overlay">
      <div className="creator-card">
        <div className="creator-header">
          <h2>{title ?? "Design your companion"}</h2>
          <button
            type="button"
            className="reroll"
            title="Reset to a random preset"
            onClick={() => {
              const k: PetKind = Math.random() < 0.5 ? "dog" : "cat";
              const base = defaultPetSpec(k);
              const rand: PetSpec = {
                ...base,
                bodyColor: pick(PET_BODY_COLORS),
                bellyColor: pick(PET_BODY_COLORS),
                accentColor: pick(PET_BODY_COLORS),
                eyeColor: pick(PET_EYE_COLORS),
                accessory: pick(PET_ACCESSORIES),
                accessoryColor: pick(FABRIC_COLORS),
              };
              setSpec(rand);
            }}
          >
            🎲 randomize
          </button>
        </div>

        <div className="creator-body">
          <div className="creator-preview">
            <canvas
              ref={canvasRef}
              width={32 * SCALE}
              height={32 * SCALE}
              className="creator-canvas"
            />
            <p className="creator-preview-caption">{spec.kind}</p>
          </div>

          <div className="creator-controls">
            <div className="creator-section">
              <h3>Breed</h3>
              <div className="chips">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={"chip" + (k === spec.kind ? " selected" : "")}
                    onClick={() => set("kind", k)}
                  >
                    {k === "dog" ? "🐕 dog" : "🐈 cat"}
                  </button>
                ))}
              </div>
            </div>

            <div className="creator-section">
              <h3>Fur color</h3>
              <div className="swatches">
                {PET_BODY_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={"swatch" + (c === spec.bodyColor ? " selected" : "")}
                    style={{ background: c, width: 22, height: 22 }}
                    onClick={() => set("bodyColor", c)}
                  />
                ))}
              </div>
            </div>

            <div className="creator-section">
              <h3>Belly / highlight</h3>
              <div className="swatches">
                {PET_BODY_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={"swatch" + (c === spec.bellyColor ? " selected" : "")}
                    style={{ background: c, width: 22, height: 22 }}
                    onClick={() => set("bellyColor", c)}
                  />
                ))}
              </div>
            </div>

            <div className="creator-section">
              <h3>Ear / accent</h3>
              <div className="swatches">
                {PET_BODY_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={"swatch" + (c === spec.accentColor ? " selected" : "")}
                    style={{ background: c, width: 22, height: 22 }}
                    onClick={() => set("accentColor", c)}
                  />
                ))}
              </div>
            </div>

            <div className="creator-section">
              <h3>Eyes</h3>
              <div className="swatches">
                {PET_EYE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={"swatch" + (c === spec.eyeColor ? " selected" : "")}
                    style={{ background: c, width: 20, height: 20 }}
                    onClick={() => set("eyeColor", c)}
                  />
                ))}
              </div>
            </div>

            <div className="creator-section">
              <h3>Accessory</h3>
              <div className="chips">
                {PET_ACCESSORIES.map((a: PetAccessory) => (
                  <button
                    key={a}
                    type="button"
                    className={"chip" + (a === spec.accessory ? " selected" : "")}
                    onClick={() => set("accessory", a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {spec.accessory !== "none" && (
              <div className="creator-section">
                <h3>Accessory color</h3>
                <div className="swatches">
                  {FABRIC_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={"swatch" + (c === spec.accessoryColor ? " selected" : "")}
                      style={{ background: c, width: 22, height: 22 }}
                      onClick={() => set("accessoryColor", c)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="creator-footer">
          {onCancel && (
            <button type="button" className="ghost" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="button" className="primary" onClick={() => onCommit(spec)}>
            {ctaLabel ?? "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
