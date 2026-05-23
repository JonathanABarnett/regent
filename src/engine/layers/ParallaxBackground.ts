import { Container, Graphics, FillGradient } from "pixi.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Star {
  x: number;   // 0..1 normalised
  y: number;   // 0..1 normalised inside sky band
  baseAlpha: number;
  phase: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tiny seeded PRNG — mulberry32 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0xffffffff;
  };
}

/** Linear interpolation between two 24-bit hex colours, returns a hex number. */
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Clamp a value to [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Map hour (0–24, wrapping) to a 0–1 factor within [start, end]. Returns 0 outside. */
function hourFactor(hour: number, start: number, end: number): number {
  if (start <= end) {
    if (hour < start || hour > end) return 0;
    return clamp((hour - start) / (end - start), 0, 1);
  }
  // wraps midnight — e.g. 19..6
  const span = 24 - start + end;
  const rel = hour >= start ? hour - start : hour + (24 - start);
  return clamp(rel / span, 0, 1);
}

// ---------------------------------------------------------------------------
// Time-of-day colour palette
// ---------------------------------------------------------------------------

// Sky top colour (deep indigo) stays fairly constant; only the horizon shifts.
const SKY_TOP = 0x0d0d2b;

// Horizon colours keyed to time of day
const HORIZON_NIGHT = 0x0a0a1e;
const HORIZON_DAWN  = 0xf5c07a;  // pale amber
const HORIZON_DAY   = 0x87ceeb;  // sky blue
const HORIZON_DUSK  = 0xe8622a;  // orange-red

// Horizon glow strip colours
const GLOW_DAWN_TOP  = 0xf4a23e;
const GLOW_DAWN_BOT  = 0xffd580;
const GLOW_DUSK_TOP  = 0xc93a10;
const GLOW_DUSK_BOT  = 0xf5843a;

/** Compute the horizon colour for a given fractional hour (0–24). */
function horizonColor(hour: number): number {
  // Night: 21–4
  // Dawn transition: 4–7
  // Day: 7–17
  // Dusk transition: 17–21
  const h = ((hour % 24) + 24) % 24;

  if (h >= 7 && h <= 17) {
    // day
    const t = (h <= 12)
      ? (h - 7) / 5          // 7→12 ramp to noon
      : 1 - (h - 12) / 5;   // 12→17 ramp back
    return lerpColor(HORIZON_DAWN, HORIZON_DAY, clamp(t, 0, 1));
  }
  if (h > 4 && h < 7) {
    // dawn
    const t = (h - 4) / 3;
    return lerpColor(HORIZON_NIGHT, HORIZON_DAWN, t);
  }
  if (h >= 17 && h <= 21) {
    // dusk
    const t = (h - 17) / 4;
    return lerpColor(HORIZON_DAY, HORIZON_DUSK, t);
  }
  // night
  if (h > 21) {
    const t = (h - 21) / 3;
    return lerpColor(HORIZON_DUSK, HORIZON_NIGHT, t);
  }
  // h <= 4 — night fading back from dusk wrap
  return HORIZON_NIGHT;
}

// ---------------------------------------------------------------------------
// ParallaxBackground
// ---------------------------------------------------------------------------

export class ParallaxBackground {
  readonly container = new Container();

  // Static geometry
  private skyBg    = new Graphics();   // gradient sky band
  private farHills = new Graphics();   // 3-layer far silhouette
  private midHills = new Graphics();   // mid silhouette

  // Dynamic layers (re-drawn every frame-ish)
  private starLayer  = new Graphics();
  private moonLayer  = new Graphics();
  private glowLayer  = new Graphics();

  // Stored so resize can reproduce them without re-seeding
  private stars: Star[] = [];

  // Cached canvas size
  private _w = 1280;
  private _h = 720;

  constructor() {
    this.container.label = "parallax";
    this.container.eventMode = "none";
    this.container.zIndex = -10000;

    // Build star data from seeded RNG (stable positions)
    this._buildStarData();

    // Add children in back-to-front order
    this.container.addChild(
      this.skyBg,
      this.starLayer,
      this.moonLayer,
      this.glowLayer,
      this.farHills,
      this.midHills,
    );

    this.build(1280, 720);
    this.update(7, 0);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Called each frame from PixiApp (or wherever the game loop lives). */
  update(hour: number, simTime: number, cometActive = false): void {
    this.draw(this._w, this._h);
    this.updateDynamic(hour, simTime);
    this.updateComet(hour, simTime, cometActive);
  }

  // Lazily-created comet streak layer.
  private cometLayer: Graphics | null = null;

  private updateComet(hour: number, simTime: number, active: boolean): void {
    if (!this.cometLayer) {
      this.cometLayer = new Graphics();
      this.container.addChild(this.cometLayer);
    }
    this.cometLayer.clear();
    if (!active) return;
    // Comet only visible at night/dusk hours.
    const H = ((hour % 24) + 24) % 24;
    let vis = 0;
    if (H >= 20 || H < 5) vis = 1;
    else if (H >= 18 && H < 20) vis = (H - 18) / 2;
    else if (H >= 5 && H < 6) vis = 1 - (H - 5);
    if (vis <= 0.01) return;

    const w = this._w;
    const skyH = this._h * 0.6;
    // Slow drift across the sky over multiple hours.
    const t = ((simTime * 0.005) % 1);
    const cx = w * (0.15 + t * 0.7);
    const cy = skyH * (0.18 + Math.sin(t * Math.PI) * 0.08);

    // Tail (long line trailing back toward the upper-left).
    const tailLen = 80;
    const dx = -tailLen, dy = -tailLen * 0.3;
    for (let i = 0; i < 12; i++) {
      const u = i / 12;
      const sx = cx + dx * u;
      const sy = cy + dy * u;
      const a = (1 - u) * 0.7 * vis;
      this.cometLayer.rect(sx, sy, 2, 2).fill({ color: 0xfff7d6, alpha: a });
    }
    // Head — small bright point.
    this.cometLayer.rect(cx - 1, cy - 1, 3, 3).fill({ color: 0xffffff, alpha: 0.95 * vis });
    this.cometLayer.rect(cx, cy, 1, 1).fill({ color: 0xfff2c2, alpha: vis });
  }

  resize(w: number, h: number): void {
    this._w = w;
    this._h = h;
    this.draw(w, h);
    // dynamic layer sizes also need to refresh — call with last-known values
    // (the caller is expected to call update() next frame anyway, but let's
    // keep moonLayer/glowLayer consistent immediately)
    this.moonLayer.clear();
    this.glowLayer.clear();
    this.starLayer.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal — static geometry
  // ---------------------------------------------------------------------------

  /** Re-draws the sky gradient and hill silhouettes. */
  draw(w: number, h: number): void {
    this._w = w;
    this._h = h;

    const skyH = h * 0.6;

    // -- sky gradient --
    this.skyBg.clear();
    const horizCol = horizonColor(this._lastHour ?? 7);
    const grad = new FillGradient({
      type: "linear",
      start: { x: 0, y: 0 },
      end:   { x: 0, y: 1 },
      colorStops: [
        { offset: 0,   color: SKY_TOP   },
        { offset: 1,   color: horizCol  },
      ],
      textureSpace: "local",
    });
    this.skyBg.rect(0, 0, w, skyH).fill(grad);

    // -- far hills — 3 subtle depth layers --
    this.farHills.clear();
    // Layer 1 (darkest/furthest)
    for (let x = 0; x < w; x += 24) {
      const hh = 14 + Math.sin(x * 0.04) * 8;
      this.farHills.rect(x, skyH - hh - 4, 24, hh + 12).fill(0x1a2455);
    }
    // Layer 2
    for (let x = 0; x < w; x += 24) {
      const hh = 10 + Math.sin(x * 0.055 + 1.1) * 7;
      this.farHills.rect(x, skyH - hh, 24, hh + 8).fill(0x1e2a60);
    }
    // Layer 3 (closest far-hill, slightly lighter)
    for (let x = 0; x < w; x += 24) {
      const hh = 18 + Math.sin(x * 0.05 + 2.3) * 10;
      this.farHills.rect(x, skyH - hh, 24, hh + 20).fill(0x223066);
    }

    // -- mid hills --
    this.midHills.clear();
    for (let x = 0; x < w; x += 32) {
      const hh = 28 + Math.sin(x * 0.07 + 1.4) * 14;
      this.midHills.rect(x, skyH - hh, 32, hh + 60).fill(0x142046);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal — dynamic elements
  // ---------------------------------------------------------------------------

  private _lastHour: number = 7;

  /** Re-draws stars, moon, and horizon glow for the current time. */
  updateDynamic(hour: number, simTime: number): void {
    this._lastHour = hour;
    const w = this._w;
    const h = this._h;
    const skyH = h * 0.6;

    // ── Stars ──────────────────────────────────────────────────────────────
    // Visibility factor: full night 20–4, fades dawn 4–7 and dusk 17–20
    let starVis = 0;
    const H = ((hour % 24) + 24) % 24;
    if (H >= 20 || H < 4) {
      starVis = 1;
    } else if (H >= 4 && H < 7) {
      starVis = 1 - (H - 4) / 3;   // fade out dawn
    } else if (H >= 17 && H < 20) {
      starVis = (H - 17) / 3;       // fade in dusk
    }

    this.starLayer.clear();
    if (starVis > 0.01) {
      for (const star of this.stars) {
        // twinkle only at dusk/night
        const twinkle = starVis > 0.5
          ? Math.sin(simTime * 0.8 + star.phase) * 0.15
          : 0;
        const alpha = clamp((star.baseAlpha + twinkle) * starVis, 0, 1);
        const sx = star.x * w;
        const sy = star.y * skyH;
        this.starLayer
          .rect(sx, sy, 1, 1)
          .fill({ color: 0xffffff, alpha });
      }
    }

    // ── Moon ───────────────────────────────────────────────────────────────
    // Visible hour 19–6 (wraps midnight), 1hr fade in/out
    this.moonLayer.clear();
    let moonAlpha = 0;
    if (H >= 20 || H <= 5) {
      moonAlpha = 0.85;
    } else if (H >= 19 && H < 20) {
      moonAlpha = 0.85 * (H - 19);          // fade in at dusk
    } else if (H > 5 && H <= 6) {
      moonAlpha = 0.85 * (1 - (H - 5));     // fade out at dawn
    }

    if (moonAlpha > 0.01) {
      // Moon moves from x=70% at hour 19 to x=10% at hour 6 (left across sky)
      // Map hour 19 → 0, hour 6 (next day) → 1 — total arc = 11 hours
      let moonT: number;
      if (H >= 19) {
        moonT = (H - 19) / 11;
      } else {
        moonT = (H + 24 - 19) / 11;
      }
      moonT = clamp(moonT, 0, 1);
      const moonX = (0.70 - moonT * 0.60) * w;  // 70% → 10%
      const moonY = skyH * 0.25;
      const R = 12;

      // Base moon disc
      this.moonLayer
        .circle(moonX, moonY, R)
        .fill({ color: 0xe8eaf6, alpha: moonAlpha });

      // Crescent shadow: slightly offset dark circle on right side
      this.moonLayer
        .circle(moonX + R * 0.35, moonY, R * 0.88)
        .fill({ color: 0x0d0d2b, alpha: moonAlpha * 0.55 });
    }

    // ── Horizon glow ───────────────────────────────────────────────────────
    this.glowLayer.clear();

    // Dawn glow: hour 5–9 (peak at 6-7)
    let dawnStrength = 0;
    if (H >= 5 && H <= 9) {
      dawnStrength = H <= 7
        ? (H - 5) / 2      // ramp up 5→7
        : 1 - (H - 7) / 2; // ramp down 7→9
      dawnStrength = clamp(dawnStrength, 0, 1);
    }

    // Dusk glow: hour 17–21 (peak at 18-19)
    let duskStrength = 0;
    if (H >= 17 && H <= 21) {
      duskStrength = H <= 19
        ? (H - 17) / 2      // ramp up 17→19
        : 1 - (H - 19) / 2; // ramp down 19→21
      duskStrength = clamp(duskStrength, 0, 1);
    }

    const glowH = skyH * 0.22;
    const glowY = skyH - glowH;

    if (dawnStrength > 0.01) {
      const dawnGrad = new FillGradient({
        type: "linear",
        start: { x: 0, y: 0 },
        end:   { x: 0, y: 1 },
        colorStops: [
          { offset: 0, color: GLOW_DAWN_TOP },
          { offset: 1, color: GLOW_DAWN_BOT },
        ],
        textureSpace: "local",
      });
      this.glowLayer
        .rect(0, glowY, w, glowH)
        .fill({ fill: dawnGrad, alpha: dawnStrength * 0.72 });
    }

    if (duskStrength > 0.01) {
      const duskGrad = new FillGradient({
        type: "linear",
        start: { x: 0, y: 0 },
        end:   { x: 0, y: 1 },
        colorStops: [
          { offset: 0, color: GLOW_DUSK_TOP },
          { offset: 1, color: GLOW_DUSK_BOT },
        ],
        textureSpace: "local",
      });
      this.glowLayer
        .rect(0, glowY, w, glowH)
        .fill({ fill: duskGrad, alpha: duskStrength * 0.78 });
    }
  }

  // ---------------------------------------------------------------------------
  // Internal — star seed
  // ---------------------------------------------------------------------------

  private _buildStarData(): void {
    const rng = makeRng(12345);
    this.stars = [];
    for (let i = 0; i < 80; i++) {
      this.stars.push({
        x:         rng(),
        y:         rng() * 0.92,   // stay in upper sky, not right at horizon
        baseAlpha: 0.3 + rng() * 0.6,
        phase:     rng() * Math.PI * 2,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Alias used by PixiApp constructor path
  // ---------------------------------------------------------------------------

  /** Alias kept so the original constructor call style `this.build(w, h)` works. */
  build(w: number, h: number): void {
    this._w = w;
    this._h = h;
    this.draw(w, h);
  }
}
