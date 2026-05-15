import { useEffect, useRef, useState } from "react";
import type {
  BodyType,
  Cape,
  CharacterSpec,
  EyeAccessory,
  HairStyle,
  HandItem,
  HatStyle,
  OutfitStyle,
  SkinTone,
} from "../engine/CharacterSpec";
import {
  EYE_COLORS,
  FABRIC_COLORS,
  HAIR_COLORS,
  SKIN_PALETTE,
  randomSpec,
} from "../engine/CharacterSpec";
import { CanvasSurface, drawCharacter } from "../engine/CharacterRenderer";

const HAIR_STYLES: HairStyle[] = ["short", "long", "ponytail", "bald", "mohawk", "braid", "topknot"];
const OUTFITS: OutfitStyle[] = ["tunic", "robe", "armor", "peasant", "regal"];
const HATS: HatStyle[] = ["none", "crown", "circlet", "hood", "cap", "wizard", "helm", "jester"];
const SKIN_TONES: SkinTone[] = ["fair", "tan", "olive", "brown", "dark"];
const BODY_TYPES: BodyType[] = ["slim", "average", "stout"];
const CAPES: Cape[] = ["none", "short", "long"];
const HAND_ITEMS: HandItem[] = ["none", "sword", "staff", "book", "scepter", "lute", "shield"];
const EYE_ACCESSORIES: EyeAccessory[] = ["none", "glasses", "monocle", "eyepatch"];

const SCALE = 7; // 32×32 → 224×224 px preview

type Tab = "body" | "outfit" | "accessories";

export function CharacterCreator({
  initialSpec,
  title,
  ctaLabel,
  cancelLabel,
  onCommit,
  onCancel,
}: {
  initialSpec: CharacterSpec;
  title?: string;
  ctaLabel?: string;
  cancelLabel?: string;
  onCommit: (spec: CharacterSpec) => void;
  onCancel?: () => void;
}) {
  const [spec, setSpec] = useState<CharacterSpec>(initialSpec);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const [tab, setTab] = useState<Tab>("body");

  // Walk-cycle the preview so it feels alive.
  useEffect(() => {
    const id = window.setInterval(() => setFrame((f) => (f + 1) % 4), 280);
    return () => clearInterval(id);
  }, []);

  // Keyboard shortcuts: Esc cancels (if cancellable), Enter commits.
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

  // Redraw on spec/frame change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Offscreen 32×32 draw, then scale-blit for crispness
    const off = document.createElement("canvas");
    off.width = 32;
    off.height = 32;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    drawCharacter(new CanvasSurface(offCtx), spec, frame, "s");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }, [spec, frame]);

  const set = <K extends keyof CharacterSpec>(k: K, v: CharacterSpec[K]) =>
    setSpec((s) => ({ ...s, [k]: v }));

  return (
    <div className="creator-overlay">
      <div className="creator-card">
        <div className="creator-header">
          <h2>{title ?? "Design your monarch"}</h2>
          <button
            type="button"
            className="reroll"
            title="Randomize everything"
            onClick={() => setSpec(randomSpec())}
          >
            🎲 randomize
          </button>
        </div>

        <div className="creator-body">
          {/* Live preview */}
          <div className="creator-preview">
            <canvas
              ref={canvasRef}
              width={32 * SCALE}
              height={32 * SCALE}
              className="creator-canvas"
            />
            <p className="creator-preview-caption">walk cycle</p>
          </div>

          {/* Controls */}
          <div className="creator-controls">
            <div className="creator-tabs">
              <button
                type="button"
                className={"tab" + (tab === "body" ? " active" : "")}
                onClick={() => setTab("body")}
              >
                Body
              </button>
              <button
                type="button"
                className={"tab" + (tab === "outfit" ? " active" : "")}
                onClick={() => setTab("outfit")}
              >
                Outfit
              </button>
              <button
                type="button"
                className={"tab" + (tab === "accessories" ? " active" : "")}
                onClick={() => setTab("accessories")}
              >
                Accessories
              </button>
            </div>

            {tab === "body" && (
              <>
                <Section title="Build">
                  <Chips
                    options={BODY_TYPES}
                    selected={spec.bodyType}
                    onPick={(v) => set("bodyType", v)}
                  />
                </Section>

                <Section title="Skin">
                  <Swatches
                    values={SKIN_TONES.map((t) => SKIN_PALETTE[t])}
                    labels={SKIN_TONES}
                    selected={SKIN_PALETTE[spec.skinTone]}
                    onPick={(_, idx) => set("skinTone", SKIN_TONES[idx])}
                  />
                </Section>

                <Section title="Hair style">
                  <Chips
                    options={HAIR_STYLES}
                    selected={spec.hairStyle}
                    onPick={(v) => set("hairStyle", v)}
                  />
                </Section>

                <Section title="Hair color">
                  <Swatches
                    values={HAIR_COLORS}
                    selected={spec.hairColor}
                    onPick={(v) => set("hairColor", v)}
                  />
                </Section>

                <Section title="Eyes">
                  <Swatches
                    values={EYE_COLORS}
                    selected={spec.eyeColor}
                    onPick={(v) => set("eyeColor", v)}
                    size={20}
                  />
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={spec.beard}
                      onChange={(e) => set("beard", e.target.checked)}
                    />
                    beard
                  </label>
                </Section>
              </>
            )}

            {tab === "outfit" && (
              <>
                <Section title="Outfit style">
                  <Chips
                    options={OUTFITS}
                    selected={spec.outfit}
                    onPick={(v) => set("outfit", v)}
                  />
                </Section>

                <Section title="Outfit color">
                  <Swatches
                    values={FABRIC_COLORS}
                    selected={spec.outfitColor}
                    onPick={(v) => set("outfitColor", v)}
                  />
                </Section>

                <Section title="Accent (trim, belt)">
                  <Swatches
                    values={FABRIC_COLORS}
                    selected={spec.accentColor}
                    onPick={(v) => set("accentColor", v)}
                  />
                </Section>

                <Section title="Cape">
                  <Chips
                    options={CAPES}
                    selected={spec.cape}
                    onPick={(v) => set("cape", v)}
                  />
                </Section>

                {spec.cape !== "none" && (
                  <Section title="Cape color">
                    <Swatches
                      values={FABRIC_COLORS}
                      selected={spec.capeColor}
                      onPick={(v) => set("capeColor", v)}
                    />
                  </Section>
                )}
              </>
            )}

            {tab === "accessories" && (
              <>
                <Section title="Hat">
                  <Chips
                    options={HATS}
                    selected={spec.hat}
                    onPick={(v) => set("hat", v)}
                  />
                </Section>

                {spec.hat !== "none" && (
                  <Section title="Hat color">
                    <Swatches
                      values={FABRIC_COLORS}
                      selected={spec.hatColor}
                      onPick={(v) => set("hatColor", v)}
                    />
                  </Section>
                )}

                <Section title="Eye accessory">
                  <Chips
                    options={EYE_ACCESSORIES}
                    selected={spec.eyeAccessory}
                    onPick={(v) => set("eyeAccessory", v)}
                  />
                </Section>

                <Section title="Held item">
                  <Chips
                    options={HAND_ITEMS}
                    selected={spec.handItem}
                    onPick={(v) => set("handItem", v)}
                  />
                </Section>

                {spec.handItem !== "none" && (
                  <Section title="Item color">
                    <Swatches
                      values={FABRIC_COLORS}
                      selected={spec.handItemColor}
                      onPick={(v) => set("handItemColor", v)}
                    />
                  </Section>
                )}
              </>
            )}
          </div>
        </div>

        <div className="creator-footer">
          {onCancel && (
            <button type="button" className="ghost" onClick={onCancel}>
              {cancelLabel ?? "Cancel"}
            </button>
          )}
          <button
            type="button"
            className="primary"
            onClick={() => onCommit(spec)}
          >
            {ctaLabel ?? "Looks good"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="creator-section">
      <h3>{title}</h3>
      <div className="creator-section-body">{children}</div>
    </div>
  );
}

function Swatches({
  values,
  labels,
  selected,
  onPick,
  size = 22,
}: {
  values: string[];
  labels?: string[];
  selected: string;
  onPick: (value: string, index: number) => void;
  size?: number;
}) {
  return (
    <div className="swatches">
      {values.map((v, i) => (
        <button
          key={`${v}-${i}`}
          type="button"
          className={"swatch" + (v === selected ? " selected" : "")}
          style={{ background: v, width: size, height: size }}
          title={labels?.[i] ?? v}
          onClick={() => onPick(v, i)}
        />
      ))}
    </div>
  );
}

function Chips<T extends string>({
  options,
  selected,
  onPick,
}: {
  options: readonly T[];
  selected: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="chips">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={"chip" + (opt === selected ? " selected" : "")}
          onClick={() => onPick(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
