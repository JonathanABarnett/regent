import type { OverworldMap } from "../sim/Map";

export interface CinematicPOI {
  x: number;
  y: number;
  /** 0 = low-priority structure drift, 10 = urgent dramatic event */
  priority: number;
  label?: string;
}

/**
 * Smooth camera with priority-based cinematic autopilot that drifts to
 * interesting points of interest when the user is idle.
 *
 * The camera operates in tile-space; pixel scaling is applied by the renderer.
 */
export class Camera {
  /** tile-space position of the camera center */
  x: number;
  y: number;
  zoom = 1;
  /** Zoom out far enough to survey the whole initial reveal bubble. */
  minZoom = 0.25;
  /** "zoomed all the way in" — tiles are large and readable but not huge. */
  maxZoom = 2;
  private targetX: number;
  private targetY: number;
  private autopilot = true;
  private autopilotIdle = 0;
  private autopilotPause = 0;
  private currentTarget: { x: number; y: number } | null = null;
  /** When set, camera tracks this provider every tick instead of using a fixed target. */
  private follow: (() => { x: number; y: number } | null) | null = null;
  /** Cinematic POI list supplied by PixiApp each frame. */
  private pois: CinematicPOI[] = [];

  constructor(private map: OverworldMap, start: { x: number; y: number; initialZoom?: number }) {
    this.x = start.x;
    this.y = start.y;
    this.targetX = start.x;
    this.targetY = start.y;
    // Pin on the starting position (castle) for 12 seconds before the
    // autopilot starts drifting. Without this, the very first tick
    // immediately picks a new POI and the camera flies away before the
    // player has seen the kingdom.
    this.currentTarget = { x: start.x, y: start.y };
    this.autopilotPause = 12;
    if (start.initialZoom !== undefined) {
      this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, start.initialZoom));
    }
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

  /**
   * Supply the cinematic POI list for the autopilot to choose from.
   * PixiApp calls this each frame with world-derived interesting spots.
   */
  setCinematicPOIs(pois: CinematicPOI[]): void {
    this.pois = pois;
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
      // Choose next POI: prioritise highest-priority POIs but add a small
      // random weight so the camera doesn't always loop through the same path.
      const candidate = this._pickNextPOI();
      if (!candidate) return;
      this.currentTarget = { x: candidate.x, y: candidate.y };
      this.targetX = candidate.x;
      this.targetY = candidate.y;
      // High-priority POIs get longer pauses (dramatic events deserve the stage).
      const basePause = candidate.priority >= 7 ? 10 : candidate.priority >= 4 ? 7 : 5;
      this.autopilotPause = basePause + Math.random() * 5;
    }
    this.autopilotIdle += dt;
  }

  private _pickNextPOI(): CinematicPOI | null {
    const pool = this.pois.length > 0 ? this.pois : this._defaultPOIs();
    if (pool.length === 0) return null;

    // Weighted random: weight = priority + 1 so even priority-0 items get picked.
    const totalWeight = pool.reduce((s, p) => s + p.priority + 1, 0);
    let r = Math.random() * totalWeight;
    for (const poi of pool) {
      r -= poi.priority + 1;
      if (r <= 0) return poi;
    }
    return pool[pool.length - 1];
  }

  private _defaultPOIs(): CinematicPOI[] {
    // Only drift to structures the player has already discovered (explored tiles).
    // On large maps many structures start in fog — flying into dark territory
    // looks like the camera is in the wrong place entirely.
    const explored = this.map.structures.filter((s) => {
      const cx = s.pos.x + Math.floor(s.size.x / 2);
      const cy = s.pos.y + Math.floor(s.size.y / 2);
      const tile = this.map.tiles[cy * this.map.width + cx];
      return tile == null || tile.explored !== false;
    });
    // Always include at least the first structure (castle) as a fallback.
    const pool = explored.length > 0 ? explored : this.map.structures.slice(0, 1);
    return pool.map((s) => ({
      x: s.pos.x + Math.floor(s.size.x / 2),
      y: s.pos.y + Math.floor(s.size.y / 2),
      priority: s.kind === "castle" ? 3 : s.kind === "forge" ? 2 : 1,
      label: s.name,
    }));
  }
}

