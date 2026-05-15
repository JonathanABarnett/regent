import { Container, Graphics } from "pixi.js";

/**
 * Three sky/parallax bands. Cheap to draw and re-tinted per frame from the
 * day/night palette, so dawn/dusk gradients still show through above the
 * tile map's edges.
 */
export class ParallaxBackground {
  readonly container = new Container();
  private sky = new Graphics();
  private mid = new Graphics();
  private far = new Graphics();

  constructor() {
    this.container.label = "parallax";
    this.container.eventMode = "none";
    this.container.zIndex = -10000;
    this.container.addChild(this.sky, this.far, this.mid);
    this.draw(1280, 720);
  }

  draw(w: number, h: number) {
    this.sky.clear();
    this.mid.clear();
    this.far.clear();
    // sky band — top ~60%
    this.sky.rect(0, 0, w, h * 0.6).fill(0x4c5fb5);
    // far hills silhouette
    for (let x = 0; x < w; x += 24) {
      const hh = 18 + Math.sin(x * 0.05) * 10;
      this.far.rect(x, h * 0.55 - hh, 24, hh + 30).fill(0x223066);
    }
    // mid hills, slightly bolder
    for (let x = 0; x < w; x += 32) {
      const hh = 28 + Math.sin(x * 0.07 + 1.4) * 14;
      this.mid.rect(x, h * 0.6 - hh, 32, hh + 60).fill(0x142046);
    }
  }

  resize(w: number, h: number) {
    this.draw(w, h);
  }
}
