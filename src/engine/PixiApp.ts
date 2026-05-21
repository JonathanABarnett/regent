import {
  Application,
  Container,
  ColorMatrixFilter,
} from "pixi.js";
import type { World } from "../sim/World";
import type { CinematicPOI } from "./Camera";
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
import { EdgeLayer } from "./layers/EdgeLayer";
import { RoadLayer } from "./layers/RoadLayer";
import { DecorLayer } from "./layers/DecorLayer";
import { NightLightsLayer } from "./layers/NightLightsLayer";

/** Virtual canvas dimensions for low-res (retro 16-bit) mode. */
export const RETRO_CANVAS = { w: 480, h: 270 } as const;

export interface PixiAppOptions {
  world: World;
  parent: HTMLElement;
  crtEnabled?: boolean;
  paused?: () => boolean;
  /** Sim speed multiplier: 0 = paused, 1 = normal, 2 = double, etc. */
  speedMultiplier?: () => number;
  /**
   * When true, the game renders at 480×270 (RETRO_CANVAS) and is CSS-stretched
   * to fill the container with nearest-neighbour upscaling.  Every pixel becomes
   * a crisp 4-6 px block on a 1080p/1440p monitor — authentic 16-bit feel.
   *
   * When false, the canvas resizes to the container (current high-res behaviour).
   *
   * A setting change requires a full PixiApp re-initialisation to take effect.
   * Defaults to true.
   */
  lowResMode?: boolean;
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
  edgeLayer!: EdgeLayer;
  roadLayer!: RoadLayer;
  decorLayer!: DecorLayer;
  nightLightsLayer!: NightLightsLayer;
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
    const lowRes = this.opts.lowResMode ?? true;
    if (lowRes) {
      await this.app.init({
        background: 0x0d0d2b,           // deep night — matches ParallaxBackground sky
        width:  RETRO_CANVAS.w,
        height: RETRO_CANVAS.h,
        antialias: false,
        resolution: 1,
        autoDensity: false,
        preference: "webgl",
      });
    } else {
      await this.app.init({
        background: 0x222244,
        resizeTo: this.opts.parent,
        antialias: false,
        resolution: 1,
        autoDensity: false,
        preference: "webgl",
      });
    }

    if (this.destroyed) {
      this.app.destroy(true, { children: true, texture: true });
      return;
    }

    // pixel-perfect: native canvas is tiny, CSS stretches it up
    const canvas = this.app.canvas;
    canvas.style.imageRendering = "pixelated";
    if (lowRes) {
      // Fill the parent container while maintaining aspect ratio.
      // Letterboxes on non-16:9 screens (black bars), which is intentional —
      // the game world is always shown at its canonical pixel density.
      canvas.style.width  = "100%";
      canvas.style.height = "100%";
      canvas.style.objectFit = "contain";
      canvas.style.display = "block";
    }
    this.opts.parent.appendChild(canvas);

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
      // Low-res: 1.0 → 15 tiles visible across the 480px virtual canvas.
      //   Castle + starting structures fill the screen comfortably.
      //   Scroll/pinch out to 0.25× (60-tile bird's-eye) or in to 2× (close detail).
      // High-res: 2.0 → same apparent tile size on large monitors.
      initialZoom: lowRes ? 1.0 : 2.0,
    });

    this.tileRenderer = new TileRenderer(this.opts.world.map, this.factory);
    this.edgeLayer = new EdgeLayer(this.opts.world.map);
    this.roadLayer  = new RoadLayer(this.opts.world.map);
    this.decorLayer = new DecorLayer(this.opts.world.map);
    this.structureLayer = new StructureLayer(this.opts.world.map, this.factory);
    this.nightLightsLayer = new NightLightsLayer(this.opts.world);
    this.borderLayer = new BorderLayer(this.opts.world);
    this.cutawayLayer = new CutawayLayer(this.opts.world);
    this.entityLayer = new EntityLayer(this.opts.world, this.factory);
    this.weatherLayer = new WeatherLayer(this.opts.world, this.factory);
    // EntityLayer reads from the CutawayLayer to relocate "inside" NPCs to
    // their stations within their associated building.
    this.entityLayer.cutawayLayer = this.cutawayLayer;

    // Layer order (bottom → top):
    //   tiles → roads → decor → edge-transitions → border → structures → night-lights → cutaway → entities → weather
    this.worldStage.addChild(this.tileRenderer.container);
    this.worldStage.addChild(this.roadLayer.container);
    this.worldStage.addChild(this.decorLayer.container);
    this.worldStage.addChild(this.edgeLayer.container);
    this.worldStage.addChild(this.borderLayer.container);
    this.worldStage.addChild(this.structureLayer.container);
    // Night lights sit between structures and NPCs so the glow bleeds
    // visually outward from the building face without covering NPCs.
    this.worldStage.addChild(this.nightLightsLayer.container);
    // Cutaway sits OVER the (faded) structure sprite, UNDER the NPCs
    this.worldStage.addChild(this.cutawayLayer.container);
    this.worldStage.addChild(this.entityLayer.container);
    this.worldStage.addChild(this.weatherLayer.container);
    this.worldStage.sortableChildren = false;

    if (this.opts.crtEnabled) this.setCrt(true);

    // In low-res mode the renderer stays at the fixed virtual resolution —
    // only the CSS changes on resize, so we just initialise parallax once.
    // In high-res mode the ResizeObserver drives renderer + overlay updates.
    this.parallax.resize(this.app.renderer.width, this.app.renderer.height);
    this.crtOverlay.resize(this.app.renderer.width, this.app.renderer.height);
    const ro = new ResizeObserver(() => {
      if (!this.initialized || this.destroyed) return;
      if (lowRes) return; // CSS handles it; renderer stays fixed
      const rw = this.app.renderer.width;
      const rh = this.app.renderer.height;
      this.parallax.resize(rw, rh);
      this.crtOverlay.resize(rw, rh);
    });
    ro.observe(this.opts.parent);

    this.app.ticker.add(this.frame);
    this.initialized = true;
  }

  setCrt(enabled: boolean) {
    this.crtOverlay.setVisible(enabled);
  }

  private _buildCinematicPOIs(): CinematicPOI[] {
    const world = this.opts.world;
    const pois: CinematicPOI[] = [];

    // Active effects get highest priority — festivals, forge fire, etc.
    for (const fx of world.effects) {
      const struct = fx.structureId
        ? world.map.structures.find((s) => s.id === fx.structureId)
        : null;
      if (struct) {
        const priority =
          fx.kind === "festival" ? 9 :
          fx.kind === "celebration" ? 8 :
          fx.kind === "forge" ? 6 :
          fx.kind === "monster" ? 7 : 5;
        pois.push({
          x: struct.pos.x + struct.size.x / 2,
          y: struct.pos.y + struct.size.y / 2,
          priority,
          label: fx.label ?? fx.kind,
        });
      }
    }

    // Monarch NPC — always worth watching.
    const monarch = world.npcs.find((n) => n.role === "monarch");
    if (monarch) {
      pois.push({ x: monarch.pos.x, y: monarch.pos.y, priority: 4, label: monarch.name });
    }

    // Active couriers in transit.
    for (const c of world.couriers) {
      pois.push({ x: c.pos.x, y: c.pos.y, priority: 3, label: c.label });
    }

    // Fallback to structures if no active events.
    if (pois.length === 0) {
      for (const s of world.map.structures) {
        const p =
          s.kind === "castle" ? 3 :
          s.kind === "forge"  ? 2 :
          s.kind === "library" || s.kind === "mine" ? 2 : 1;
        pois.push({
          x: s.pos.x + Math.floor(s.size.x / 2),
          y: s.pos.y + Math.floor(s.size.y / 2),
          priority: p,
          label: s.name,
        });
      }
    }

    return pois;
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

    const simTime = this.opts.world.state.time;
    const hour = this.opts.world.state.hour;

    // Switch seasonal tile textures + decor when the in-world season changes.
    this.tileRenderer.setSeason(this.opts.world.state.season);
    this.decorLayer.update(this.opts.world.state.season);
    this.tileRenderer.update(minX, minY, maxX, maxY);
    // Animate water tiles: slow ripple cycle driven by sim time.
    this.tileRenderer.animate(simTime);
    // Edge-transition shadows between biomes — same viewport bounds as tiles.
    this.edgeLayer.update(minX, minY, maxX, maxY);
    // Reconcile is cheap: it walks the structure list and adds any new ones.
    // Called every frame so newly-constructed buildings (mill, watchtower,
    // shrine) appear without restarting the renderer.
    this.structureLayer.reconcile();
    // Apply cutaway sprite fade — structure sprites become translucent so
    // the cutaway layer's interior overlay reads as "inside the building."
    this.structureLayer.container.alpha = this.cutawayLayer.enabled ? 0.35 : 1;
    // Building window and forge glows — intensity follows in-world hour.
    this.nightLightsLayer.update(hour);
    this.borderLayer.update();
    this.cutawayLayer.update();
    this.entityLayer.update(dt, this.alpha, simTime);
    this.weatherLayer.update(dt, { minX, minY, maxX, maxY });

    // day/night + season tint (multiplied)
    const tod = dayNightTint(hour);
    const sea = seasonTint(this.opts.world.state.season);
    const m = this.tintFilter.matrix;
    m.fill(0);
    m[0] = tod.r * sea.r;
    m[6] = tod.g * sea.g;
    m[12] = tod.b * sea.b;
    m[18] = 1; // alpha
    this.tintFilter.matrix = m;

    // Parallax: slow scroll + dynamic sky (stars, moon, horizon glow).
    this.parallax.container.x = -this.camera.x * 4;
    this.parallax.update(hour, simTime);

    // Feed cinematic POIs to the camera autopilot so it gravitates toward
    // active effects (festivals, forge, weddings) rather than random structures.
    this.camera.setCinematicPOIs(this._buildCinematicPOIs());
  }
}
