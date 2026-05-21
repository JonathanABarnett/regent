import { Container, Sprite, Texture } from "pixi.js";
import type { World } from "../../sim/World";
import type { SpriteFactory } from "../SpriteFactory";

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
}

export class WeatherLayer {
  readonly container = new Container();
  private rain: Particle[] = [];
  private snow: Particle[] = [];
  private clouds: Sprite[] = [];
  private pollen: Particle[] = [];
  private fireflies: Particle[] = [];
  private leaves: Particle[] = [];
  /** Ambient ember sparks rising from active forge structures. */
  private embers: Particle[] = [];

  constructor(private world: World, private factory: SpriteFactory) {
    this.container.label = "weather";
    this.container.eventMode = "none";
    // pre-spawn cloud sprites used in cloudy/storm/rain weather
    for (let i = 0; i < 6; i++) {
      const c = new Sprite(factory.props.get("cloud"));
      c.alpha = 0;
      this.container.addChild(c);
      this.clouds.push(c);
    }
  }

  update(_dt: number, viewport: { minX: number; minY: number; maxX: number; maxY: number; }) {
    const T = 32;
    const w = this.world.weather.current;
    const wRain = w === "rain" || w === "storm" ? 1 : 0;
    const wSnow = w === "snow" ? 1 : 0;
    const wCloud = w === "cloudy" || w === "rain" || w === "storm" ? 1 : 0;

    // ── clouds ──
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.alpha = wCloud * 0.85;
      c.y = (viewport.minY + 2 + i * 3) * T;
      c.x = ((viewport.minX * T) + ((performance.now() / 50 + i * 200) % ((viewport.maxX - viewport.minX) * T + 64))) - 64;
      c.zIndex = -1000;
    }

    // ── rain ──
    const targetRain = Math.floor(wRain * 200);
    while (this.rain.length < targetRain) {
      const p = this.spawnParticle("rain_drop", viewport);
      this.rain.push(p);
    }
    while (this.rain.length > targetRain) {
      const p = this.rain.pop();
      if (p) p.sprite.parent?.removeChild(p.sprite);
    }
    for (const p of this.rain) {
      p.sprite.x += p.vx;
      p.sprite.y += p.vy;
      p.life -= 0.016;
      if (p.life <= 0 || p.sprite.y > (viewport.maxY + 2) * T) {
        p.sprite.x = (viewport.minX + Math.random() * (viewport.maxX - viewport.minX)) * T;
        p.sprite.y = (viewport.minY - 2) * T;
        p.life = 1.5;
      }
    }

    // ── snow ──
    const targetSnow = Math.floor(wSnow * 80);
    while (this.snow.length < targetSnow) {
      const p = this.spawnParticle("snow_flake", viewport);
      p.vx = (Math.random() - 0.5) * 1;
      p.vy = 1;
      this.snow.push(p);
    }
    while (this.snow.length > targetSnow) {
      const p = this.snow.pop();
      if (p) p.sprite.parent?.removeChild(p.sprite);
    }
    for (const p of this.snow) {
      p.sprite.x += p.vx + Math.sin(p.sprite.y * 0.05) * 0.3;
      p.sprite.y += p.vy;
      p.life -= 0.016;
      if (p.life <= 0 || p.sprite.y > (viewport.maxY + 2) * T) {
        p.sprite.x = (viewport.minX + Math.random() * (viewport.maxX - viewport.minX)) * T;
        p.sprite.y = (viewport.minY - 2) * T;
        p.life = 3;
      }
    }

    this.updatePollen(_dt, viewport);
    this.updateFireflies(_dt, viewport);
    this.updateLeaves(_dt, viewport);
    this.updateEmbers(_dt, viewport);
  }

  private spawnParticle(kind: string, vp: { minX: number; minY: number; maxX: number; maxY: number; }): Particle {
    const T = 32;
    const sprite = new Sprite(this.factory.props.get(kind));
    sprite.x = (vp.minX + Math.random() * (vp.maxX - vp.minX)) * T;
    sprite.y = (vp.minY - 2 + Math.random() * 4) * T;
    sprite.zIndex = 5000;
    this.container.addChild(sprite);
    return {
      sprite,
      vx: -1,
      vy: 8 + Math.random() * 4,
      life: 1 + Math.random() * 2,
    };
  }

  // ── Pollen ──────────────────────────────────────────────────────────────
  // Active in spring, daytime hours 6–19. Tiny cream-yellow motes drifting
  // slowly upward with a gentle sideways sine wobble.

  private spawnPollenParticle(vp: { minX: number; minY: number; maxX: number; maxY: number; }): Particle {
    const T = 32;
    const sprite = new Sprite(Texture.WHITE);
    const size = 1 + Math.round(Math.random());  // 1 or 2 px
    sprite.width = size;
    sprite.height = size;
    sprite.tint = 0xfefce8;
    sprite.alpha = 0.55;
    sprite.zIndex = 5001;
    // Spawn near the bottom two-thirds of the viewport
    sprite.x = (vp.minX + Math.random() * (vp.maxX - vp.minX)) * T;
    sprite.y = (vp.minY + (vp.maxY - vp.minY) * (0.4 + Math.random() * 0.6)) * T;
    this.container.addChild(sprite);
    const T32 = 32;
    const rand = Math.random();
    return {
      sprite,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -(0.4 + rand * 0.3) * T32 * 0.016,  // slow upward (pixels/frame at ~60fps)
      life: 4 + Math.random() * 3,             // 4–7 seconds
    };
  }

  private updatePollen(dt: number, vp: { minX: number; minY: number; maxX: number; maxY: number; }) {
    const { season, hour } = this.world.state;
    const active = season === "spring" && hour >= 6 && hour < 19;
    const target = active ? 40 : 0;

    while (this.pollen.length < target) {
      this.pollen.push(this.spawnPollenParticle(vp));
    }
    while (this.pollen.length > target) {
      const p = this.pollen.pop();
      if (p) p.sprite.parent?.removeChild(p.sprite);
    }

    const T = 32;
    for (const p of this.pollen) {
      // Sine wobble on horizontal axis
      p.vx += Math.sin(p.life * 3) * 0.008;
      p.sprite.x += p.vx;
      p.sprite.y += p.vy;
      p.life -= dt;
      // Respawn when lifetime expires or particle drifts off the top
      if (p.life <= 0 || p.sprite.y < (vp.minY - 2) * T) {
        const size = 1 + Math.round(Math.random());
        p.sprite.width = size;
        p.sprite.height = size;
        p.sprite.x = (vp.minX + Math.random() * (vp.maxX - vp.minX)) * T;
        p.sprite.y = (vp.minY + (vp.maxY - vp.minY) * (0.4 + Math.random() * 0.6)) * T;
        const rand = Math.random();
        p.vx = (Math.random() - 0.5) * 0.4;
        p.vy = -(0.4 + rand * 0.3) * T * 0.016;
        p.life = 4 + Math.random() * 3;
      }
    }
  }

  // ── Fireflies ────────────────────────────────────────────────────────────
  // Active in summer dusk/early-night, hours 19–22. Amber motes that blink
  // with a sine wave per-particle phase; respawn at a new random position
  // on expiry rather than being removed.

  private spawnFireflyParticle(vp: { minX: number; minY: number; maxX: number; maxY: number; }): Particle {
    const T = 32;
    const sprite = new Sprite(Texture.WHITE) as Sprite & { _fireflyPhase: number };
    sprite.width = 2;
    sprite.height = 2;
    sprite.tint = 0xfbbf24;
    sprite.zIndex = 5002;
    // Spawn across lower 70% of the viewport
    sprite.x = (vp.minX + Math.random() * (vp.maxX - vp.minX)) * T;
    sprite.y = (vp.minY + (vp.maxY - vp.minY) * (0.3 + Math.random() * 0.7)) * T;
    sprite._fireflyPhase = Math.random() * Math.PI * 2;
    this.container.addChild(sprite);
    return {
      sprite,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      life: 3 + Math.random() * 2,
    };
  }

  private updateFireflies(dt: number, vp: { minX: number; minY: number; maxX: number; maxY: number; }) {
    const { season, hour } = this.world.state;
    const active = season === "summer" && hour >= 19 && hour < 22;
    const target = active ? 18 : 0;

    while (this.fireflies.length < target) {
      this.fireflies.push(this.spawnFireflyParticle(vp));
    }
    while (this.fireflies.length > target) {
      const p = this.fireflies.pop();
      if (p) p.sprite.parent?.removeChild(p.sprite);
    }

    const T = 32;
    const now = performance.now();
    for (const p of this.fireflies) {
      const sp = p.sprite as Sprite & { _fireflyPhase?: number };
      const phase = sp._fireflyPhase ?? 0;
      sp.alpha = Math.abs(Math.sin(now * 0.003 + phase)) * 0.75 + 0.1;

      p.sprite.x += p.vx;
      p.sprite.y += p.vy;
      p.life -= dt;

      if (p.life <= 0) {
        // Respawn at new random position with new drift direction and phase
        p.sprite.x = (vp.minX + Math.random() * (vp.maxX - vp.minX)) * T;
        p.sprite.y = (vp.minY + (vp.maxY - vp.minY) * (0.3 + Math.random() * 0.7)) * T;
        p.vx = (Math.random() - 0.5) * 0.3;
        p.vy = (Math.random() - 0.5) * 0.3;
        p.life = 3 + Math.random() * 2;
        (p.sprite as Sprite & { _fireflyPhase: number })._fireflyPhase = Math.random() * Math.PI * 2;
      }
    }
  }

  // ── Falling Leaves ───────────────────────────────────────────────────────
  // Active every autumn. Rust/amber/red 2–3 px squares blown rightward and
  // downward; alpha pulses gently to mimic tumbling.

  private static readonly LEAF_COLORS = [0xc2410c, 0xdc2626, 0xd97706, 0x92400e] as const;

  private spawnLeafParticle(vp: { minX: number; minY: number; maxX: number; maxY: number; }): Particle {
    const T = 32;
    const sprite = new Sprite(Texture.WHITE);
    sprite.width = 2 + Math.round(Math.random());  // 2 or 3 px wide
    sprite.height = 2;
    sprite.tint = WeatherLayer.LEAF_COLORS[Math.floor(Math.random() * WeatherLayer.LEAF_COLORS.length)];
    sprite.alpha = 0.7;
    sprite.zIndex = 5003;
    // Spawn near the left edge and across the top of the viewport
    const fromLeft = Math.random() < 0.6;
    if (fromLeft) {
      sprite.x = (vp.minX - 1 + Math.random() * 3) * T;
      sprite.y = (vp.minY + Math.random() * (vp.maxY - vp.minY)) * T;
    } else {
      sprite.x = (vp.minX + Math.random() * (vp.maxX - vp.minX)) * T;
      sprite.y = (vp.minY - 1) * T;
    }
    this.container.addChild(sprite);
    return {
      sprite,
      vx: (0.4 + Math.random() * 0.6) * T * 0.016,
      vy: (0.8 + Math.random() * 0.5) * T * 0.016,
      life: 2 + Math.random() * 2,
    };
  }

  // ── Forge embers ─────────────────────────────────────────────────────────
  // A small cluster of orange/red sparks rises from each forge structure
  // continuously. The effect is subtle — 4–6 embers per forge, short life,
  // tight origin point — but makes the forge feel alive even when no
  // explicit forge event is running.

  private updateEmbers(dt: number, vp: { minX: number; minY: number; maxX: number; maxY: number; }) {
    const T = 32;
    const forges = this.world.map.structures.filter((s) => s.kind === "forge");
    const target = forges.length * 5; // 5 embers per forge

    while (this.embers.length < target) {
      // Pick a random forge as the origin for this ember.
      const forge = forges[Math.floor(Math.random() * forges.length)];
      if (!forge) break;
      const sprite = new Sprite(Texture.WHITE);
      sprite.width  = 1 + (Math.random() > 0.6 ? 1 : 0);
      sprite.height = sprite.width;
      sprite.tint   = Math.random() > 0.5 ? 0xf97316 : 0xfbbf24; // orange or amber
      sprite.alpha  = 0.7 + Math.random() * 0.25;
      sprite.zIndex = 5010;
      // Spawn at the chimney position (top-centre of the forge footprint)
      const ox = (forge.pos.x + forge.size.x * 0.5) * T + (Math.random() - 0.5) * 8;
      const oy = forge.pos.y * T - 4;
      sprite.x = ox;
      sprite.y = oy;
      this.container.addChild(sprite);
      this.embers.push({
        sprite,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(1.5 + Math.random() * 1.5),  // drift upward
        life: 0.8 + Math.random() * 0.8,
      });
    }

    while (this.embers.length > target) {
      const p = this.embers.pop();
      if (p) p.sprite.parent?.removeChild(p.sprite);
    }

    for (const p of this.embers) {
      // Gentle sideways wobble + upward drift; fade out toward end of life
      p.vx += (Math.random() - 0.5) * 0.15;
      p.sprite.x += p.vx;
      p.sprite.y += p.vy;
      p.vy *= 0.97; // decelerate slightly as hot air cools
      p.life -= dt;
      p.sprite.alpha = Math.max(0, p.life / 0.8) * 0.9;

      // Respawn when the ember burns out — but only if the forge is still visible
      if (p.life <= 0) {
        const forge = forges[Math.floor(Math.random() * forges.length)];
        if (!forge) { p.life = 99; continue; }
        const cx = (forge.pos.x + forge.size.x * 0.5) * T;
        const cy = forge.pos.y * T - 4;
        // Only respawn if the forge is within the current viewport
        if (cx < vp.minX * T || cx > vp.maxX * T || cy < vp.minY * T || cy > vp.maxY * T) {
          p.life = 99; // park it off-screen until next viewport scroll
          p.sprite.alpha = 0;
          continue;
        }
        p.sprite.x = cx + (Math.random() - 0.5) * 8;
        p.sprite.y = cy;
        p.vx = (Math.random() - 0.5) * 0.4;
        p.vy = -(1.5 + Math.random() * 1.5);
        p.life = 0.8 + Math.random() * 0.8;
        p.sprite.tint = Math.random() > 0.5 ? 0xf97316 : 0xfbbf24;
        p.sprite.alpha = 0.7 + Math.random() * 0.25;
      }
    }
  }

  private updateLeaves(dt: number, vp: { minX: number; minY: number; maxX: number; maxY: number; }) {
    const { season } = this.world.state;
    const target = season === "autumn" ? 25 : 0;

    while (this.leaves.length < target) {
      this.leaves.push(this.spawnLeafParticle(vp));
    }
    while (this.leaves.length > target) {
      const p = this.leaves.pop();
      if (p) p.sprite.parent?.removeChild(p.sprite);
    }

    const T = 32;
    for (const p of this.leaves) {
      p.sprite.x += p.vx;
      p.sprite.y += p.vy;
      p.life -= dt;
      // Alpha pulse to fake tumbling rotation
      p.sprite.alpha = 0.5 + 0.2 * Math.sin(p.life * 4);

      if (p.life <= 0 || p.sprite.x > (vp.maxX + 2) * T || p.sprite.y > (vp.maxY + 2) * T) {
        // Respawn
        p.sprite.tint = WeatherLayer.LEAF_COLORS[Math.floor(Math.random() * WeatherLayer.LEAF_COLORS.length)];
        p.sprite.width = 2 + Math.round(Math.random());
        const fromLeft = Math.random() < 0.6;
        if (fromLeft) {
          p.sprite.x = (vp.minX - 1 + Math.random() * 3) * T;
          p.sprite.y = (vp.minY + Math.random() * (vp.maxY - vp.minY)) * T;
        } else {
          p.sprite.x = (vp.minX + Math.random() * (vp.maxX - vp.minX)) * T;
          p.sprite.y = (vp.minY - 1) * T;
        }
        p.vx = (0.4 + Math.random() * 0.6) * T * 0.016;
        p.vy = (0.8 + Math.random() * 0.5) * T * 0.016;
        p.life = 2 + Math.random() * 2;
      }
    }
  }
}
