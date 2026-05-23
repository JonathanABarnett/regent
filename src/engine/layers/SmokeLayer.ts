import { Container, Graphics } from "pixi.js";
import type { World } from "../../sim/World";
import type { Structure } from "../../sim/types";

/**
 * Chimney smoke — thin grey particles rising from inhabited structures.
 * Atmospheric detail; signals that the kingdom is occupied rather than
 * a static set of buildings. Smokes:
 *   - castle, town: always (chimney fires year-round)
 *   - forge: always, denser
 *   - mill: only during day (people work it)
 *   - library, shrine, watchtower: minimal occasional puff
 *
 * Particles are cheap pixel rectangles that drift up and fade. Spawn
 * cadence tuned so each chimney has 2-4 visible particles at a time.
 */

interface Smoke {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
}

const SMOKE_KINDS = new Set<string>([
  "castle", "town", "forge", "mill",
]);

const SPAWN_INTERVAL: Record<string, number> = {
  castle: 0.6,
  town: 0.7,
  forge: 0.25, // more smoke from the forge
  mill: 1.0,
};

export class SmokeLayer {
  readonly container = new Container();
  private particles: Smoke[] = [];
  private graphics = new Graphics();
  private spawnTimers = new Map<string, number>();

  constructor(private world: World) {
    this.container.label = "smoke-layer";
    this.container.addChild(this.graphics);
  }

  update(dt: number): void {
    // Advance existing particles.
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy *= 0.98;        // decelerate as it dissipates
      p.size += dt * 0.4;  // billow outward
    }

    // Spawn new particles from each chimney.
    const hour = this.world.state.hour;
    const isDay = hour >= 6 && hour < 20;
    for (const s of this.world.map.structures) {
      if (!SMOKE_KINDS.has(s.kind)) continue;
      if (s.kind === "mill" && !isDay) continue;
      // Only smoke from explored structures (otherwise we'd reveal them through fog).
      const cx = s.pos.x + Math.floor(s.size.x / 2);
      const cy = s.pos.y + Math.floor(s.size.y / 2);
      const tile = this.world.map.tiles[cy * this.world.map.width + cx];
      if (!tile?.explored) continue;

      const interval = SPAWN_INTERVAL[s.kind] ?? 1.0;
      const timer = (this.spawnTimers.get(s.id) ?? 0) - dt;
      if (timer <= 0) {
        this.spawnTimers.set(s.id, interval * (0.7 + Math.random() * 0.6));
        this._spawn(s);
      } else {
        this.spawnTimers.set(s.id, timer);
      }
    }

    // Cap particles total.
    if (this.particles.length > 120) {
      this.particles.splice(0, this.particles.length - 120);
    }

    // Redraw.
    const T = 32;
    this.graphics.clear();
    for (const p of this.particles) {
      const t = p.age / p.life;
      const alpha = (1 - t) * 0.55;
      // colour: white smoke fades to dust grey
      const grey = 0xcccccc;
      this.graphics
        .rect(p.x * T, p.y * T, p.size, p.size)
        .fill({ color: grey, alpha });
    }
  }

  private _spawn(s: Structure): void {
    const cx = s.pos.x + s.size.x / 2;
    const cy = s.pos.y;
    // Spawn at the top of the building footprint (chimney height).
    this.particles.push({
      x: cx + (Math.random() - 0.5) * 0.3,
      y: cy - 0.1,
      vx: (Math.random() - 0.5) * 0.2,
      vy: -0.6 - Math.random() * 0.3,
      age: 0,
      life: 3 + Math.random() * 2,
      size: 1.5 + Math.random() * 1.5,
    });
  }
}
