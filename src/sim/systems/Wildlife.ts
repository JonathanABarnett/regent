import type { World } from "../World";
import type { Vec2, NPC } from "../types";

/**
 * Wildlife — ambient creatures that share the map with NPCs.
 *
 * Four kinds, each with their own biome and time-of-day:
 *   DEER  — graze in forests and plains during day. Skittish.
 *   FISH  — jump in rivers. Splash particles for the renderer to find.
 *   HAWK  — circle high overhead during day. No collision.
 *   WOLF  — prowl forests at night. Will pursue and wound a lone NPC
 *           if they come within ~3 tiles. Wounded NPCs get a temporary
 *           speech bubble and a journal entry. (No deaths from wolves —
 *           they're flavour, not the war system.)
 *
 * Wildlife counts are bounded (~12 creatures total) and they're spawned
 * once on world start in suitable terrain. Movement is simple drift
 * with random direction changes — they don't pathfind like NPCs.
 */

export type WildlifeKind = "deer" | "fish" | "hawk" | "wolf";

export interface WildlifeEntity {
  id: string;
  kind: WildlifeKind;
  pos: Vec2;
  prevPos: Vec2;
  /** Random direction in radians. */
  heading: number;
  /** Seconds until they pick a new heading. */
  changeTimer: number;
  /** Seed for per-creature appearance variation. */
  seed: number;
}

const MAX_CREATURES = {
  deer: 6,
  fish: 4,
  hawk: 2,
  wolf: 3,
} as const;

const SPEED = {
  deer: 0.4,   // slow grazers
  fish: 0.1,   // mostly stationary
  hawk: 0.8,   // glide fast across the sky
  wolf: 0.55,  // can outpace a walking NPC
} as const;

const WOLF_PURSUE_RANGE = 3.5;
const WOLF_ATTACK_RANGE = 1.0;
const WOLF_INJURY_COOLDOWN_DAYS = 4;

const WOLF_ATTACK_LINES: readonly string[] = [
  "A wolf came down from the north woods and caught {name} alone on the road. They drove it off — barely. The bite will take a week to heal.",
  "{name} was attacked by a wolf at dusk. They are alive, but limping. The guards have doubled the night watch.",
  "{name} returned to the keep with a torn cloak and a story. There were two wolves, they say. The bite is real.",
];

export interface WildlifeSnapshot {
  entities: WildlifeEntity[];
  /** Last in-world day a wolf attack happened (cooldown gate). */
  lastWolfAttackDay: number;
}

export class Wildlife {
  entities: WildlifeEntity[] = [];
  private lastWolfAttackDay = -999;
  private spawned = false;

  constructor(
    private world: World,
    private rand: () => number,
  ) {}

  snapshot(): WildlifeSnapshot {
    return {
      entities: this.entities.map((e) => ({
        ...e, pos: { ...e.pos }, prevPos: { ...e.prevPos },
      })),
      lastWolfAttackDay: this.lastWolfAttackDay,
    };
  }

  restore(s: WildlifeSnapshot): void {
    this.entities = s.entities.map((e) => ({
      ...e, pos: { ...e.pos }, prevPos: { ...e.prevPos },
    }));
    this.lastWolfAttackDay = s.lastWolfAttackDay;
    this.spawned = true;
  }

  /** Populate the world with wildlife. Called once after map generation. */
  spawn(): void {
    if (this.spawned) return;
    this.spawned = true;
    const map = this.world.map;
    let id = 0;
    const tryPlace = (kind: WildlifeKind, validKinds: string[]): boolean => {
      for (let tries = 0; tries < 100; tries++) {
        const x = Math.floor(this.rand() * map.width);
        const y = Math.floor(this.rand() * map.height);
        const t = map.tiles[y * map.width + x];
        if (!t) continue;
        if (!validKinds.includes(t.kind)) continue;
        this.entities.push({
          id: `wild_${kind}_${id++}`,
          kind,
          pos: { x, y },
          prevPos: { x, y },
          heading: this.rand() * Math.PI * 2,
          changeTimer: 2 + this.rand() * 6,
          seed: Math.floor(this.rand() * 2 ** 31),
        });
        return true;
      }
      return false;
    };
    for (let i = 0; i < MAX_CREATURES.deer; i++) tryPlace("deer", ["forest", "plain"]);
    for (let i = 0; i < MAX_CREATURES.fish; i++) tryPlace("fish", ["river"]);
    for (let i = 0; i < MAX_CREATURES.hawk; i++) tryPlace("hawk", ["plain", "forest", "hill"]);
    for (let i = 0; i < MAX_CREATURES.wolf; i++) tryPlace("wolf", ["forest", "hill"]);
  }

  /** Called every sim tick (dt in seconds). */
  tick(dt: number): void {
    if (!this.spawned) this.spawn();
    const band = this.world.dayNight.bandAt(this.world.state.time);

    for (const e of this.entities) {
      // Hide some creatures by time-of-day: hawks rest at night, wolves hide by day.
      // We don't actually remove them — just skip movement so they linger in place.
      const active =
        e.kind === "fish" ||
        (e.kind === "deer" && band !== "night") ||
        (e.kind === "hawk" && band === "day") ||
        (e.kind === "wolf" && (band === "night" || band === "dusk"));
      if (!active) {
        e.prevPos.x = e.pos.x;
        e.prevPos.y = e.pos.y;
        continue;
      }

      e.changeTimer -= dt;
      if (e.changeTimer <= 0) {
        e.heading = this.rand() * Math.PI * 2;
        e.changeTimer = 2 + this.rand() * 8;
      }

      const speed = SPEED[e.kind];
      const newX = e.pos.x + Math.cos(e.heading) * speed * dt;
      const newY = e.pos.y + Math.sin(e.heading) * speed * dt;
      e.prevPos.x = e.pos.x;
      e.prevPos.y = e.pos.y;

      if (this._validForKind(e.kind, newX, newY)) {
        e.pos.x = newX;
        e.pos.y = newY;
      } else {
        // Bounce off invalid terrain — rotate heading.
        e.heading += Math.PI / 2 + this.rand() * Math.PI;
      }

      // Wolves hunt nearby NPCs at night.
      if (e.kind === "wolf" && band === "night") {
        this._wolfHunt(e);
      }
    }
  }

  private _validForKind(kind: WildlifeKind, x: number, y: number): boolean {
    const map = this.world.map;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 1 || ty < 1 || tx >= map.width - 1 || ty >= map.height - 1) return false;
    const t = map.tiles[ty * map.width + tx];
    if (!t) return false;
    switch (kind) {
      case "deer": return t.kind === "forest" || t.kind === "plain";
      case "fish": return t.kind === "river";
      case "hawk": return t.kind !== "ocean";
      case "wolf": return t.kind === "forest" || t.kind === "hill" || t.kind === "plain";
    }
  }

  private _wolfHunt(wolf: WildlifeEntity): void {
    // Find the closest NPC within range.
    let target: NPC | null = null;
    let bestDist = WOLF_PURSUE_RANGE;
    for (const n of this.world.npcs) {
      if (n.role === "monarch") continue; // monarch is protected
      const dx = n.pos.x - wolf.pos.x;
      const dy = n.pos.y - wolf.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        target = n;
      }
    }
    if (!target) return;

    // Steer the wolf toward the target.
    wolf.heading = Math.atan2(target.pos.y - wolf.pos.y, target.pos.x - wolf.pos.x);
    wolf.changeTimer = 1.5;

    // Attack if close enough and cooldown elapsed.
    const day = this.world.state.day;
    if (bestDist < WOLF_ATTACK_RANGE && day - this.lastWolfAttackDay >= WOLF_INJURY_COOLDOWN_DAYS) {
      this.lastWolfAttackDay = day;
      const line = WOLF_ATTACK_LINES[Math.floor(this.rand() * WOLF_ATTACK_LINES.length)]
        .replace("{name}", target.name ?? "a traveller");
      this.world.journal.write(line, "event");
      target.speech = "*howl*";
      target.speechUntil = this.world.state.time + 5;
    }
  }
}
