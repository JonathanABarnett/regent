import { Container, Sprite } from "pixi.js";
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

  update(_dt: number, viewport: { minX: number; minY: number; maxX: number; maxY: number }) {
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
  }

  private spawnParticle(kind: string, vp: { minX: number; minY: number; maxX: number; maxY: number }): Particle {
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
}
