import {
  Application,
  Container,
  ColorMatrixFilter,
} from "pixi.js";
import type { World } from "../sim/World";
import { SpriteFactory } from "./SpriteFactory";
import { TileRenderer } from "./TileRenderer";
import { Camera } from "./Camera";
import { dayNightTint } from "./Palette";
import { seasonTint } from "../sim/systems/Calendar";
import { StructureLayer } from "./layers/StructureLayer";
import { EntityLayer } from "./layers/EntityLayer";
import { WeatherLayer } from "./layers/WeatherLayer";
import { ParallaxBackground } from "./layers/ParallaxBackground";
import { CrtOverlay } from "./layers/CrtOverlay";
import { BorderLayer } from "./layers/BorderLayer";
import { CutawayLayer } from "./layers/CutawayLayer";

export interface PixiAppOptions {
  world: World;
  parent: HTMLElement;
  crtEnabled?: boolean;
  paused?: () => boolean;
  /** Sim speed multiplier: 0 = paused, 1 = normal, 2 = double, etc. */
  speedMultiplier?: () => number;
}

export class PixiApp {
  app = new Application();
  factory!: SpriteFactory;
  camera!: Camera;
  tileRenderer!: TileRenderer;
  entityLayer!: EntityLayer;
  structureLayer!: StructureLayer;
  borderLayer!: BorderLayer;
  cutawayLayer!: CutawayLayer;
  weatherLayer!: WeatherLayer;
  parallax = new ParallaxBackground();
  worldStage = new Container();
  uiStage = new Container();
  tintFilter = new ColorMatrixFilter();
  crtOverlay = new CrtOverlay();
  private lastSimTickAcc = 0;
  /** seconds elapsed since last sim tick — used to compute interpolation alpha for renderer */
  private accumulator = 0;
  private alpha = 0;
  private initialized = false;
  private destroyed = false;

  constructor(private opts: PixiAppOptions) {}

  async init(): Promise<void> {
    await this.app.init({
      background: 0x222244,
      resizeTo: this.opts.parent,
      antialias: false,
      resolution: 1,
      autoDensity: false,
      preference: "webgl",
    });
    if (this.destroyed) {
      // raced with destroy(); tear down what we just built and bail
      this.app.destroy(true, { children: true, texture: true });
      return;
    }
    // pixel-perfect scaling
    this.app.canvas.style.imageRendering = "pixelated";
    this.opts.parent.appendChild(this.app.canvas);

    this.factory = new SpriteFactory(this.app);
    await this.factory.build();
    if (this.destroyed) return;

    this.worldStage.label = "world-stage";
    this.uiStage.label = "ui-stage";
    this.app.stage.addChild(this.parallax.container);
    this.app.stage.addChild(this.worldStage);
    this.app.stage.addChild(this.uiStage);
    this.app.stage.addChild(this.crtOverlay.container);
    this.crtOverlay.resize(this.app.renderer.width, this.app.renderer.height);

    // tint applied to the world stage so parallax/UI keep their own colors
    this.worldStage.filters = [this.tintFilter];

    const startStruct = this.opts.world.map.structures[0];
    this.camera = new Camera(this.opts.world.map, {
      x: startStruct ? startStruct.pos.x + startStruct.size.x / 2 : this.opts.world.map.width / 2,
      y: startStruct ? startStruct.pos.y + startStruct.size.y / 2 : this.opts.world.map.height / 2,
    });

    this.tileRenderer = new TileRenderer(this.opts.world.map, this.factory);
    this.structureLayer = new StructureLayer(this.opts.world.map, this.factory);
    this.borderLayer = new BorderLayer(this.opts.world);
    this.cutawayLayer = new CutawayLayer(this.opts.world);
    this.entityLayer = new EntityLayer(this.opts.world, this.factory);
    this.weatherLayer = new WeatherLayer(this.opts.world, this.factory);
    // EntityLayer reads from the CutawayLayer to relocate "inside" NPCs to
    // their stations within their associated building.
    this.entityLayer.cutawayLayer = this.cutawayLayer;

    this.worldStage.addChild(this.tileRenderer.container);
    // Border sits between tiles and structures so structure sprites stamp
    // over it cleanly but the outline draws on top of the bare terrain.
    this.worldStage.addChild(this.borderLayer.container);
    this.worldStage.addChild(this.structureLayer.container);
    // Cutaway sits OVER the (faded) structure sprite, UNDER the NPCs
    this.worldStage.addChild(this.cutawayLayer.container);
    this.worldStage.addChild(this.entityLayer.container);
    this.worldStage.addChild(this.weatherLayer.container);
    this.worldStage.sortableChildren = false;

    if (this.opts.crtEnabled) this.setCrt(true);

    // resize parallax + CRT overlay with the window
    const ro = new ResizeObserver(() => {
      if (!this.initialized || this.destroyed) return;
      this.parallax.resize(this.app.renderer.width, this.app.renderer.height);
      this.crtOverlay.resize(this.app.renderer.width, this.app.renderer.height);
    });
    ro.observe(this.opts.parent);

    this.app.ticker.add(this.frame);
    this.initialized = true;
  }

  setCrt(enabled: boolean) {
    this.crtOverlay.setVisible(enabled);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.initialized) return;
    try {
      this.app.ticker?.remove?.(this.frame);
    } catch {
      /* swallow */
    }
    try {
      this.app.destroy?.(true, { children: true, texture: true });
    } catch (e) {
      console.warn("[PixiApp] destroy error", e);
    }
  }

  private frame = () => {
    if (this.opts.paused?.()) return;
    const dt = this.app.ticker.deltaMS / 1000;
    this.simStep(dt);
    this.render(dt);
  };

  private simStep(realDt: number) {
    const tickDuration = 1 / this.opts.world.tickRate; // 0.1s default
    const speed = Math.max(0, this.opts.speedMultiplier?.() ?? 1);
    if (speed === 0) {
      // paused: don't advance sim time, but still render the last state
      this.alpha = 0;
      return;
    }
    this.accumulator += realDt * speed;
    let steps = 0;
    // Cap steps higher at 4x speed so the fast-forward feels snappy
    const maxSteps = speed >= 2 ? 10 : 5;
    while (this.accumulator >= tickDuration && steps < maxSteps) {
      this.opts.world.tick(tickDuration);
      this.accumulator -= tickDuration;
      this.lastSimTickAcc = 0;
      steps++;
    }
    this.alpha = this.accumulator / tickDuration;
  }

  private render(dt: number) {
    const T = 32;
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    const zoom = this.camera.zoom;

    this.camera.tick(dt);

    // world stage transform: center camera tile in screen
    this.worldStage.scale.set(zoom);
    this.worldStage.x = -this.camera.x * T * zoom + w / 2;
    this.worldStage.y = -this.camera.y * T * zoom + h / 2;

    // viewport in tile-space
    const visTilesX = w / (T * zoom);
    const visTilesY = h / (T * zoom);
    const minX = this.camera.x - visTilesX / 2;
    const minY = this.camera.y - visTilesY / 2;
    const maxX = this.camera.x + visTilesX / 2;
    const maxY = this.camera.y + visTilesY / 2;

    this.tileRenderer.update(minX, minY, maxX, maxY);
    // Reconcile is cheap: it walks the structure list and adds any new ones.
    // Called every frame so newly-constructed buildings (mill, watchtower,
    // shrine) appear without restarting the renderer.
    this.structureLayer.reconcile();
    // Apply cutaway sprite fade — structure sprites become translucent so
    // the cutaway layer's interior overlay reads as "inside the building."
    this.structureLayer.container.alpha = this.cutawayLayer.enabled ? 0.35 : 1;
    this.borderLayer.update();
    this.cutawayLayer.update();
    this.entityLayer.update(dt, this.alpha, this.opts.world.state.time);
    this.weatherLayer.update(dt, { minX, minY, maxX, maxY });

    // day/night + season tint (multiplied)
    const tod = dayNightTint(this.opts.world.state.hour);
    const sea = seasonTint(this.opts.world.state.season);
    const m = this.tintFilter.matrix;
    m.fill(0);
    m[0] = tod.r * sea.r;
    m[6] = tod.g * sea.g;
    m[12] = tod.b * sea.b;
    m[18] = 1; // alpha
    this.tintFilter.matrix = m;

    // parallax slow scroll
    this.parallax.container.x = -this.camera.x * 4;
  }
}
