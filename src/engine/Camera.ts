import type { OverworldMap } from "../sim/Map";

/**
 * Smooth camera with autopilot that drifts between landmarks when idle.
 * The camera operates in tile-space; pixel scaling is applied by the renderer.
 */
export class Camera {
  /** tile-space position of the camera center */
  x: number;
  y: number;
  zoom = 2; // integer multiplier on top of TILE_SIZE — 2 means each 32px tile shows at 64 logical pixels
  minZoom = 1;
  maxZoom = 4;
  private targetX: number;
  private targetY: number;
  private autopilot = true;
  private autopilotIdle = 0;
  private autopilotPause = 0;
  private currentTarget: { x: number; y: number } | null = null;
  /** When set, camera tracks this provider every tick instead of using a fixed target. */
  private follow: (() => { x: number; y: number } | null) | null = null;

  constructor(private map: OverworldMap, start: { x: number; y: number }) {
    this.x = start.x;
    this.y = start.y;
    this.targetX = start.x;
    this.targetY = start.y;
  }

  setManual(x: number, y: number) {
    this.autopilot = false;
    this.targetX = x;
    this.targetY = y;
  }

  /** Pan the manual target by (dx, dy) tiles. Used by keyboard controls. */
  pan(dx: number, dy: number) {
    this.autopilot = false;
    this.targetX = Math.max(2, Math.min(this.map.width - 2, this.targetX + dx));
    this.targetY = Math.max(2, Math.min(this.map.height - 2, this.targetY + dy));
  }

  /** Jump the manual target to a specific tile, snapping immediately. */
  snapTo(x: number, y: number) {
    this.autopilot = false;
    this.targetX = x;
    this.targetY = y;
    // also nudge actual position so the snap feels instant
    this.x = x;
    this.y = y;
  }

  enableAutopilot() {
    this.autopilot = true;
    this.follow = null;
    this.currentTarget = null;
  }

  /**
   * Tail a moving target (e.g. an NPC). Returning null from the provider
   * means the target no longer exists; the camera switches back to manual.
   */
  followTarget(provider: () => { x: number; y: number } | null) {
    this.autopilot = false;
    this.follow = provider;
  }

  /** Stop following without resuming autopilot. */
  stopFollowing() {
    this.follow = null;
  }

  isFollowing(): boolean {
    return this.follow !== null;
  }

  /** Scale zoom by `factor` (>1 zooms in, <1 zooms out). Clamps to [min, max]. */
  zoomBy(factor: number) {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
  }

  tick(dt: number) {
    if (this.follow) {
      const p = this.follow();
      if (p) {
        this.targetX = p.x;
        this.targetY = p.y;
      } else {
        this.follow = null;
      }
    } else if (this.autopilot) {
      this.autopilotTick(dt);
    }
    // exponential smoothing
    const k = 1 - Math.exp(-dt * 1.4);
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
  }

  private autopilotTick(dt: number) {
    if (this.autopilotPause > 0) {
      this.autopilotPause -= dt;
      return;
    }
    const reached =
      this.currentTarget &&
      Math.hypot(this.targetX - this.x, this.targetY - this.y) < 1;
    if (!this.currentTarget || reached) {
      const structures = this.map.structures;
      if (structures.length === 0) return;
      const next = structures[Math.floor(Math.random() * structures.length)];
      const cx = next.pos.x + Math.floor(next.size.x / 2);
      const cy = next.pos.y + Math.floor(next.size.y / 2);
      this.currentTarget = { x: cx, y: cy };
      this.targetX = cx;
      this.targetY = cy;
      this.autopilotPause = 6 + Math.random() * 6;
    }
    this.autopilotIdle += dt;
  }
}
