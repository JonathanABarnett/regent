import { Container, Graphics } from "pixi.js";

/**
 * Cheap scanline + vignette CRT effect implemented as a sprite overlay rather
 * than a custom shader. Drawn on top of everything; toggled via setVisible.
 */
export class CrtOverlay {
  readonly container = new Container();
  private scanlines = new Graphics();
  private vignette = new Graphics();
  private currentW = 0;
  private currentH = 0;

  constructor() {
    this.container.label = "crt-overlay";
    this.container.eventMode = "none";
    this.container.zIndex = 100_000;
    this.container.visible = false;
    this.container.addChild(this.scanlines, this.vignette);
  }

  setVisible(v: boolean) {
    this.container.visible = v;
  }

  resize(w: number, h: number) {
    if (w === this.currentW && h === this.currentH) return;
    this.currentW = w;
    this.currentH = h;
    this.scanlines.clear();
    // every other 2px row is dimmed
    for (let y = 0; y < h; y += 2) {
      this.scanlines.rect(0, y, w, 1).fill({ color: 0x000000, alpha: 0.18 });
    }
    this.vignette.clear();
    // simple radial-ish vignette using stacked rect rings of increasing alpha
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.max(w, h) / 2;
    const rings = 12;
    for (let i = 0; i < rings; i++) {
      const r = maxR - (maxR / rings) * i;
      const alpha = 0.04 * (i / rings);
      this.vignette.circle(cx, cy, r).stroke({ color: 0x000000, alpha, width: 6 });
    }
  }
}
