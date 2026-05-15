import { generateMap, type OverworldMap } from "./Map";
import type {
  NPC,
  NPCRole,
  Pet,
  PetKind,
  Structure,
  Vec2,
  WorldState,
} from "./types";
import { findPath } from "./systems/Pathfinding";
import { DayNight } from "./systems/DayNight";
import { Weather } from "./systems/Weather";
import { Economy } from "./systems/Economy";
import { preferredDestination } from "./systems/Schedule";
import { NarrativeDirector } from "./systems/NarrativeDirector";
import { generateName } from "./systems/Names";
import { traitFor } from "./systems/Traits";
import { backstoryFor } from "./systems/Backstories";
import { Calendar } from "./systems/Calendar";
import { Journal } from "./systems/Journal";
import { LifeEvents } from "./systems/LifeEvents";
import { Quests } from "./systems/Quests";
import { Decisions } from "./systems/Decisions";
import { Succession } from "./systems/Succession";
import { Treasury } from "./systems/Treasury";
import { Construction } from "./systems/Construction";
import { Holidays } from "./systems/Holidays";
import { CourtSpeech } from "./systems/CourtSpeech";
import { Aspirations } from "./systems/Aspirations";
import { History } from "./systems/History";
import { Threats } from "./systems/Threats";
import type { SavedJournalEntry } from "./Persistence";
import { EventBus } from "./events/EventBus";
import type { ExternalEvent } from "./events/EventSchema";
import { ExternalEvent as EventSchema, makeEvent } from "./events/EventSchema";

export interface ActiveCourier {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  pos: Vec2;
  prevPos: Vec2;
  path: Vec2[];
  speed: number; // tiles per second
  expiresAt: number; // simSeconds when removed if it never reaches
}

export interface ActiveEffect {
  id: string;
  kind: "forge" | "mining" | "research" | "celebration" | "festival" | "monster" | "airship" | "storm";
  structureId?: string;
  /** for moving effects (airship), tile-space pos */
  pos?: Vec2;
  prevPos?: Vec2;
  velocity?: Vec2;
  intensity: number;
  expiresAt: number;
  label?: string;
}

export interface WorldOptions {
  seed?: number;
  width?: number;
  height?: number;
  /** real-world ms when this kingdom was first founded. Defaults to now. */
  foundedAtMs?: number;
  /** when true, season tracks the wall-clock month rather than in-world day */
  followRealSeasons?: boolean;
}

/** "1" → "1st", "2" → "2nd", "3" → "3rd", "4-20" → "Nth", then mod-10 rule. */
function ordinalSuffix(n: number): string {
  const abs = Math.abs(Math.floor(n));
  const lastTwo = abs % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (abs % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Runtime caps to prevent denial-of-service via event spam (e.g. malicious
 * Twitch raid floods, scripted curl loops against the HTTP receiver, broken
 * integrations replaying events). These are intentionally generous — well
 * past anything an honest user could create — and clamp rather than crash.
 */
export const WORLD_CAPS = {
  npcs: 200,
  pets: 4,
  couriers: 50,
  effects: 100,
  recentEvents: 200,
} as const;

/**
 * Anniversary chronicle phrasings, rotated by `ordinal % length` so the same
 * kingdom's 2nd, 3rd, 4th anniversaries all read differently. Year 1 is the
 * founding itself and is not an anniversary.
 */
const ANNIVERSARY_LINES: readonly string[] = [
  "the courtyard filled at dawn — another year of the same banner. Old hands clasped, and young ones learned the song.",
  "the bells rang in sequence from each tower. The kingdom counted itself again, and was satisfied.",
  "an old veteran stood by the gate at sunrise and would not say why. Some things, the kingdom remembers without needing words.",
  "the chronicler closed one volume and opened another. The new one began with the date in red ink.",
  "the pet sat where it always sits. The kingdom did the same.",
];

/** Journal anchor text fired once when the season rolls over (not on day 1). */
const SEASON_ANCHORS: Record<"spring" | "summer" | "autumn" | "winter", string> = {
  spring:
    "Spring came on quietly today — the first green broke through the frost, and the children chased it across the meadows.",
  summer:
    "Summer settled over the kingdom. The fields turned gold, and the masons worked stripped to the waist.",
  autumn:
    "Autumn arrived with a colder wind. The leaves began to turn, and the harvest carts rolled at first light.",
  winter:
    "Winter took the kingdom in the night. Hearths burned through every house, and the watch sang to keep warm.",
};

export class World {
  readonly map: OverworldMap;
  readonly npcs: NPC[] = [];
  readonly pets: Pet[] = [];
  readonly couriers: ActiveCourier[] = [];
  readonly effects: ActiveEffect[] = [];
  readonly bus = new EventBus();
  readonly state: WorldState;
  readonly economy = new Economy();
  readonly dayNight = new DayNight();
  readonly weather: Weather;
  readonly director: NarrativeDirector;
  readonly calendar: Calendar;
  readonly journal: Journal;
  readonly lifeEvents: LifeEvents;
  readonly quests: Quests;
  readonly decisions: Decisions;
  readonly succession: Succession;
  readonly treasury: Treasury;
  readonly construction: Construction;
  readonly holidays: Holidays;
  readonly courtSpeech: CourtSpeech;
  readonly aspirations: Aspirations;
  readonly history: History;
  readonly threats: Threats;
  /** Callbacks invoked when the Journal writes a new entry. */
  onJournal?: (entry: SavedJournalEntry) => void;

  /**
   * Active court effects. The UI sets the appointed-NPC ids via `setCourt`;
   * each tick the booleans are recomputed to reflect whether the appointee
   * is still alive. Reading these flags from sim systems is cheap and keeps
   * the simulation independent of the Zustand identity store.
   *
   *   advisorSeated → Quests extends decision auto-expiry from 90s to 180s
   *   captainSeated → Weather reduces storm transition probability
   *   scholarSeated → Economy boosts tome generation rate
   *
   * If the appointed NPC dies, the corresponding flag clears automatically
   * on the next `setCourt(...)` call (App.tsx repumps on identity change).
   */
  readonly courtEffects = {
    advisorSeated: false,
    captainSeated: false,
    scholarSeated: false,
  };

  /**
   * Last-known appointee ids. Stored so the sim can revalidate seats each day
   * — if a court member dies mid-session, the corresponding bonus clears
   * automatically without waiting for the player to re-open the picker.
   */
  private courtIds: {
    advisorId?: string;
    captainId?: string;
    scholarId?: string;
  } = {};

  /** rng dedicated to gameplay decisions */
  private rand: () => number;

  /** sim ticks per second */
  readonly tickRate = 10;

  constructor(opts: WorldOptions = {}) {
    const seed = opts.seed ?? Math.floor(Math.random() * 2_000_000);
    this.rand = mulberry32(seed);
    this.map = generateMap({
      width: opts.width ?? 96,
      height: opts.height ?? 64,
      seed,
    });
    this.weather = new Weather(this.rand);
    this.director = new NarrativeDirector(this.bus, this.map, this.rand);
    this.calendar = new Calendar({
      foundedAtMs: opts.foundedAtMs ?? Date.now(),
      followRealSeasons: opts.followRealSeasons ?? false,
    });
    this.journal = new Journal(this, (entry) => this.onJournal?.(entry));
    this.lifeEvents = new LifeEvents(this, this.journal, this.rand);
    this.quests = new Quests(this, this.journal, this.rand);
    this.decisions = new Decisions(this);
    this.succession = new Succession(this, this.journal);
    this.treasury = new Treasury(this, this.journal);
    this.construction = new Construction(this, this.journal);
    this.holidays = new Holidays(this, this.journal);
    this.courtSpeech = new CourtSpeech(this, this.journal, this.rand);
    this.aspirations = new Aspirations(this.rand);
    this.aspirations.seedInitial();
    this.history = new History();
    this.threats = new Threats(this, this.journal, this.rand);
    const cal = this.calendar.snapshot();
    this.state = {
      time: 0,
      hour: this.dayNight.startHour,
      day: cal.day,
      year: cal.year,
      season: cal.season,
      dayOfWeek: cal.dayOfWeek,
      weather: "clear",
      loadFactor: 0,
      recentNarrativeEvents: 0,
      seed,
    };
    this.spawnInitialNPCs();
    this.bus.subscribe((ev) => this.handleEvent(ev));
  }

  /** Public accessors */

  structureById(id: string): Structure | undefined {
    return this.map.structures.find((s) => s.id === id);
  }

  /** Step the world forward by `dt` real seconds. */
  tick(dt: number) {
    this.state.time += dt;
    this.state.hour = this.dayNight.hourAt(this.state.time);
    // refresh calendar each tick — cheap and lets seasons advance live
    const cal = this.calendar.snapshot();
    const dayChanged = cal.day !== this.state.day;
    const seasonChanged = cal.season !== this.state.season;
    const yearChanged = cal.year !== this.state.year;
    this.state.day = cal.day;
    this.state.year = cal.year;
    this.state.season = cal.season;
    this.state.dayOfWeek = cal.dayOfWeek;
    if (dayChanged) {
      this.bus.publish(makeEvent("custom", {
        source: "internal",
        payload: { label: `Day ${cal.day} dawns over the kingdom` },
      }));
      // Day-rollover sweep: if a court appointee died yesterday, vacate the
      // seat now so their bonus doesn't linger into the new day.
      this.revalidateCourt();
      // Court members get a chance to say something today.
      this.courtSpeech.tick();
      // Snapshot today's stats for the sparklines panel.
      this.history.capture(this);
      // Rare threat roll — captain seated cuts the chance dramatically.
      this.threats.tick();
      // Aspirations: check progress, fire journal on completion.
      const completed = this.aspirations.evaluate(this);
      for (const id of completed) {
        const def = Aspirations.definitions().find((a) => a.id === id);
        if (def) {
          this.journal.write(`Aspiration fulfilled — ${def.title}: ${def.description}`, "milestone");
        }
      }
    }
    if (seasonChanged && this.state.day > 1) {
      // Anchor the season turn with a journal entry. Skipped on day 1 to
      // avoid a redundant "spring began" on a fresh kingdom.
      this.journal.write(SEASON_ANCHORS[cal.season], "weather");
    }
    if (yearChanged && cal.year > 1) {
      // Kingdom Anniversary — once per year roll, write a milestone entry
      // and fire a quiet festival to give the moment some visual weight.
      this.fireAnniversary(cal.year);
    }
    this.weather.tick(dt, this.state.time);
    this.state.weather = this.weather.current;
    this.lifeEvents.tick();
    this.quests.tick();
    this.decisions.tick(Date.now());
    this.succession.tick();
    this.construction.tick();
    this.holidays.tick();
    this.director.tick(dt);
    this.economy.tick(
      dt,
      this.npcs.filter((n) => n.role === "miner").length,
      this.npcs.filter((n) => n.role === "blacksmith").length,
      this.npcs.filter((n) => n.role === "scholar").length,
    );

    this.tickNPCs(dt);
    this.tickPets(dt);
    this.tickCouriers(dt);
    this.tickEffects(dt);
  }

  /**
   * Create or replace the player's pet. Stored in `world.pets` and persisted.
   * Returns the new pet.
   */
  adoptPet(name: string, kind: PetKind): Pet {
    // Remove any existing pet (single-pet kingdom for MVP)
    this.pets.length = 0;
    const castle = this.map.structures.find((s) => s.kind === "castle") ?? this.map.structures[0];
    const startPos = castle
      ? { x: castle.pos.x + castle.size.x / 2, y: castle.pos.y + castle.size.y + 1 }
      : { x: this.map.width / 2, y: this.map.height / 2 };
    const pet: Pet = {
      id: `pet_${Math.floor(this.state.time * 1000)}`,
      name,
      kind,
      pos: { ...startPos },
      prevPos: { ...startPos },
      facing: "s",
      // Default to the player-styled sprite set; App.tsx ensures this key
      // is populated in the SpriteFactory at boot time and on every spec
      // change. The breed-default sprite remains the fallback.
      spriteKey: "pet_custom",
    };
    this.pets.push(pet);
    this.journal.write(
      `A ${kind} named ${name} was welcomed into the kingdom.`,
      "life",
    );
    return pet;
  }

  /** Bind the pet to follow a specific NPC; pass undefined to free it. */
  setPetFollowing(npcId: string | undefined) {
    const pet = this.pets[0];
    if (!pet) return;
    pet.followingNpcId = npcId;
  }

  /**
   * Apply court appointments. Each id is checked against the live roster —
   * if an appointee no longer exists (e.g. they died and the player hasn't
   * re-picked yet), the corresponding seat is treated as vacant. Returns the
   * NPC names that were validated so callers can write a journal entry.
   *
   * Idempotent: calling with the same ids is a no-op.
   */
  setCourt(opts: {
    advisorId?: string;
    captainId?: string;
    scholarId?: string;
  }) {
    this.courtIds = { ...opts };
    this.courtSpeech.setCourtIds(this.courtIds);
    this.revalidateCourt();
  }

  /**
   * Re-check the stored appointee ids against the live roster and update the
   * court-effect flags accordingly. Called by `setCourt` and on each day
   * rollover so that a court member's death automatically vacates their seat.
   */
  revalidateCourt() {
    const alive = (id?: string) =>
      id !== undefined && this.npcs.some((n) => n.id === id);
    this.courtEffects.advisorSeated = alive(this.courtIds.advisorId);
    this.courtEffects.captainSeated = alive(this.courtIds.captainId);
    this.courtEffects.scholarSeated = alive(this.courtIds.scholarId);
    // Mirror into systems that read at tick time.
    this.weather.captainBonus = this.courtEffects.captainSeated;
    this.economy.scholarBonus = this.courtEffects.scholarSeated;
  }

  /** External entry point: anyone can publish well-formed events. */
  publish(event: ExternalEvent) {
    this.bus.publish(event);
  }

  /** Validate raw input from external integrations and publish. */
  publishRaw(raw: unknown): { ok: true; event: ExternalEvent } | { ok: false; error: string } {
    const result = EventSchema.safeParse(raw);
    if (!result.success) {
      return { ok: false, error: result.error.issues.map((i) => i.message).join("; ") };
    }
    this.bus.publish(result.data);
    return { ok: true, event: result.data };
  }

  // ---------------------------------------------------------------------------
  //   internals
  // ---------------------------------------------------------------------------

  /**
   * Fire a Kingdom Anniversary milestone for `year`. Writes a milestone
   * journal entry (year ordinal + a rotating flavor line) and emits a low-key
   * festival event so the moment also reads visually rather than only in text.
   */
  private fireAnniversary(year: number) {
    const ordinal = ordinalSuffix(year - 1); // year 2 = 1st anniversary
    const flavor =
      ANNIVERSARY_LINES[(year - 2) % ANNIVERSARY_LINES.length] ?? ANNIVERSARY_LINES[0];
    this.journal.write(
      `The ${ordinal} anniversary of the kingdom — ${flavor}`,
      "milestone",
    );
    const castle = this.map.structures.find((s) => s.kind === "castle");
    if (castle) {
      this.bus.publish(
        makeEvent("festival", {
          source: "narrative",
          intensity: 0.75,
          duration_ms: 40_000,
          payload: { structure: castle.id, label: `${ordinal} anniversary` },
        }),
      );
    }
  }

  private spawnInitialNPCs() {
    const homes = this.map.structures.filter((s) => s.kind === "town" || s.kind === "castle");
    if (!homes.length) return;
    const work: Record<NPCRole, Structure | undefined> = {
      blacksmith: this.map.structures.find((s) => s.kind === "forge"),
      miner: this.map.structures.find((s) => s.kind === "mine"),
      scholar: this.map.structures.find((s) => s.kind === "library"),
      courier: this.map.structures.find((s) => s.kind === "castle"),
      guard: this.map.structures.find((s) => s.kind === "castle"),
      monarch: this.map.structures.find((s) => s.kind === "castle"),
      villager: homes[0],
    };

    const roster: Array<{ role: NPCRole; count: number }> = [
      { role: "villager", count: 5 },
      { role: "blacksmith", count: 2 },
      { role: "miner", count: 3 },
      { role: "scholar", count: 2 },
      { role: "guard", count: 2 },
      { role: "courier", count: 1 },
    ];

    let idCounter = 0;
    for (const { role, count } of roster) {
      const w = work[role] ?? homes[0];
      for (let i = 0; i < count; i++) {
        const home = homes[(idCounter + i) % homes.length];
        const center = {
          x: home.pos.x + Math.floor(home.size.x / 2),
          y: home.pos.y + Math.floor(home.size.y / 2),
        };
        const npcSeed = Math.floor(this.rand() * 2 ** 31);
        this.npcs.push({
          id: `npc_${idCounter++}`,
          role,
          name: generateName(role, npcSeed),
          age: 18 + Math.floor(this.rand() * 50),
          trait: traitFor(npcSeed),
          pos: { ...center },
          prevPos: { ...center },
          facing: "s",
          homeId: home.id,
          workId: w.id,
          activity: "idle",
          path: [],
          activityTimer: 1 + this.rand() * 4,
          seed: npcSeed,
        });
      }
    }
  }

  /**
   * Push a new NPC into the world if under the cap. Returns true if added.
   * Prevents memory bombs from Twitch raid floods or scripted spam.
   */
  pushNpc(npc: NPC): boolean {
    if (this.npcs.length >= WORLD_CAPS.npcs) return false;
    this.npcs.push(npc);
    return true;
  }

  /**
   * Spawn (or refresh) the monarch NPC. Called after onboarding so the player
   * sees their own customized character in-world. The monarch lives in and
   * wanders near the castle, never works elsewhere.
   */
  spawnMonarch(name: string): string {
    const castle = this.map.structures.find((s) => s.kind === "castle");
    if (!castle) return "";
    const center = {
      x: castle.pos.x + Math.floor(castle.size.x / 2),
      y: castle.pos.y + Math.floor(castle.size.y / 2),
    };
    // remove any existing monarch (single per kingdom)
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      if (this.npcs[i].role === "monarch") this.npcs.splice(i, 1);
    }
    const id = "npc_monarch";
    this.npcs.push({
      id,
      role: "monarch",
      name,
      age: 30,
      pos: { ...center },
      prevPos: { ...center },
      facing: "s",
      homeId: castle.id,
      workId: castle.id,
      activity: "idle",
      path: [],
      activityTimer: 4 + this.rand() * 4,
      seed: Math.floor(this.rand() * 2 ** 31),
    });
    return id;
  }

  private tickNPCs(dt: number) {
    const band = this.dayNight.bandAt(this.state.time);
    for (const npc of this.npcs) {
      // expire speech bubbles
      if (npc.speechUntil && this.state.time > npc.speechUntil) {
        npc.speech = undefined;
        npc.speechUntil = undefined;
      }

      if (npc.activity === "walking" && npc.path.length > 0) {
        this.advanceAlongPath(npc, dt);
      } else {
        npc.activityTimer -= dt;
        if (npc.activityTimer > 0) continue;
        // pick a new destination based on schedule
        const destId = preferredDestination(npc, band, this.map);
        const dest = this.map.landmarks.get(destId);
        const cur = { x: Math.round(npc.pos.x), y: Math.round(npc.pos.y) };
        if (dest && (dest.x !== cur.x || dest.y !== cur.y)) {
          const path = findPath(this.map, cur, dest);
          if (path && path.length > 0) {
            npc.path = path;
            npc.activity = "walking";
          } else {
            // wander locally
            npc.activity = "idle";
            npc.activityTimer = 3 + this.rand() * 6;
          }
        } else {
          // already there → work or idle
          npc.activity = npc.role === "villager" ? "idle" : "working";
          npc.activityTimer = 6 + this.rand() * 8;
        }
      }
    }
  }

  private advanceAlongPath(npc: NPC, dt: number) {
    const speed = 2.2; // tiles/sec
    let remaining = speed * dt;
    npc.prevPos = { ...npc.pos };
    while (remaining > 0 && npc.path.length > 0) {
      const target = npc.path[0];
      const dx = target.x - npc.pos.x;
      const dy = target.y - npc.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-3) {
        npc.path.shift();
        continue;
      }
      const step = Math.min(remaining, dist);
      npc.pos.x += (dx / dist) * step;
      npc.pos.y += (dy / dist) * step;
      remaining -= step;
      if (Math.abs(dx) > Math.abs(dy)) npc.facing = dx > 0 ? "e" : "w";
      else npc.facing = dy > 0 ? "s" : "n";
      if (Math.hypot(target.x - npc.pos.x, target.y - npc.pos.y) < 0.05) {
        npc.pos.x = target.x;
        npc.pos.y = target.y;
        npc.path.shift();
      }
    }
    if (npc.path.length === 0) {
      npc.activity = "working";
      npc.activityTimer = 6 + this.rand() * 8;
    }
  }

  private tickPets(dt: number) {
    for (const pet of this.pets) {
      pet.prevPos = { ...pet.pos };
      // pick a target — followed NPC, else stay near castle
      let target: Vec2 | null = null;
      if (pet.followingNpcId) {
        const npc = this.npcs.find((n) => n.id === pet.followingNpcId);
        if (npc) target = npc.pos;
      }
      if (!target) {
        const castle = this.map.structures.find((s) => s.kind === "castle") ?? this.map.structures[0];
        if (castle) {
          target = {
            x: castle.pos.x + castle.size.x / 2,
            y: castle.pos.y + castle.size.y + 1,
          };
        }
      }
      if (!target) continue;
      const dx = target.x - pet.pos.x;
      const dy = target.y - pet.pos.y;
      const dist = Math.hypot(dx, dy);
      // pets keep ~1.2 tile distance so they don't overlap the NPC
      const followRadius = 1.2;
      if (dist > followRadius) {
        const speed = 3.0; // slightly faster than NPCs so they catch up
        const step = Math.min(speed * dt, dist - followRadius);
        pet.pos.x += (dx / dist) * step;
        pet.pos.y += (dy / dist) * step;
        if (Math.abs(dx) > Math.abs(dy)) pet.facing = dx > 0 ? "e" : "w";
        else pet.facing = dy > 0 ? "s" : "n";
      } else {
        // close enough: idle wiggle
        pet.pos.x += (this.rand() - 0.5) * 0.4 * dt;
        pet.pos.y += (this.rand() - 0.5) * 0.4 * dt;
      }
    }
  }

  private tickCouriers(dt: number) {
    for (let i = this.couriers.length - 1; i >= 0; i--) {
      const c = this.couriers[i];
      if (this.state.time > c.expiresAt) {
        this.couriers.splice(i, 1);
        continue;
      }
      c.prevPos = { ...c.pos };
      let remaining = c.speed * dt;
      while (remaining > 0 && c.path.length > 0) {
        const target = c.path[0];
        const dx = target.x - c.pos.x;
        const dy = target.y - c.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-3) { c.path.shift(); continue; }
        const step = Math.min(remaining, dist);
        c.pos.x += (dx / dist) * step;
        c.pos.y += (dy / dist) * step;
        remaining -= step;
        if (Math.hypot(target.x - c.pos.x, target.y - c.pos.y) < 0.05) {
          c.pos.x = target.x;
          c.pos.y = target.y;
          c.path.shift();
        }
      }
      if (c.path.length === 0) {
        // arrived → fireworks at destination then remove
        const arr = this.structureById(c.toId);
        if (arr) {
          this.spawnEffect({
            kind: "celebration",
            structureId: arr.id,
            intensity: 0.6,
            durationMs: 4000,
            label: c.label,
          });
        }
        this.couriers.splice(i, 1);
      }
    }
  }

  private tickEffects(dt: number) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      if (e.pos && e.velocity) {
        e.prevPos = { ...e.pos };
        e.pos.x += e.velocity.x * dt;
        e.pos.y += e.velocity.y * dt;
      }
      if (this.state.time > e.expiresAt) {
        this.effects.splice(i, 1);
      }
    }
  }

  private handleEvent(ev: ExternalEvent) {
    switch (ev.kind) {
      case "courier":
        this.spawnCourier(ev);
        break;
      case "forge":
        this.spawnEffect({
          kind: "forge",
          structureId: ev.payload.structure ?? "ironhearth",
          intensity: ev.intensity,
          durationMs: ev.duration_ms ?? 12_000,
          label: ev.payload.label,
        });
        break;
      case "research":
        this.spawnEffect({
          kind: "research",
          structureId: ev.payload.structure ?? "scriptorium",
          intensity: ev.intensity,
          durationMs: ev.duration_ms ?? 10_000,
          label: ev.payload.label,
        });
        break;
      case "mining":
        this.spawnEffect({
          kind: "mining",
          structureId: ev.payload.structure ?? "deeprock",
          intensity: ev.intensity,
          durationMs: ev.duration_ms ?? 20_000,
          label: ev.payload.label,
        });
        this.state.loadFactor = 0.5 + ev.intensity * 0.5;
        break;
      case "storm":
        this.weather.forceStorm(this.state.time, (ev.duration_ms ?? 30_000) / 1000);
        break;
      case "celebration":
        this.spawnEffect({
          kind: "celebration",
          structureId: ev.payload.structure,
          intensity: ev.intensity,
          durationMs: ev.duration_ms ?? 6000,
          label: ev.payload.label,
        });
        this.npcSpeech(ev.payload.structure, ev.payload.label);
        break;
      case "festival":
        this.spawnEffect({
          kind: "festival",
          structureId: ev.payload.structure,
          intensity: ev.intensity,
          durationMs: ev.duration_ms ?? 30_000,
          label: ev.payload.label,
        });
        break;
      case "monster":
        this.spawnAirshipOrMonster(ev, "monster");
        break;
      case "airship":
        this.spawnAirshipOrMonster(ev, "airship");
        break;
      case "custom":
        // generic display only
        break;
      // ── Twitch-source events ──────────────────────────────────────────
      case "twitch_follow": {
        const user = (ev.payload.meta?.user as string) ?? "a stranger";
        this.spawnEffect({
          kind: "celebration",
          structureId: "highkeep",
          intensity: 0.5,
          durationMs: ev.duration_ms ?? 6000,
          label: `+${user}`,
        });
        this.journal.write(
          `A new traveler, ${user}, was glimpsed beyond the gates of the kingdom.`,
          "event",
        );
        break;
      }
      case "twitch_sub": {
        const user = (ev.payload.meta?.user as string) ?? "a new soul";
        const tier = (ev.payload.meta?.tier as number) ?? 1;
        // If a villager with this name already exists (re-sub from the same
        // viewer), don't spawn a duplicate — fire a smaller "welcome back"
        // celebration at their existing home and call it a day.
        const existing = this.npcs.find(
          (n) => n.name === user && n.role === "villager",
        );
        if (existing) {
          this.spawnEffect({
            kind: "celebration",
            structureId: existing.homeId,
            intensity: 0.5 + tier * 0.1,
            durationMs: ev.duration_ms ?? 6000,
            label: `${user} re-subscribed`,
          });
          this.journal.write(
            `${user} renewed their pledge to the kingdom.`,
            "milestone",
          );
          break;
        }
        // Spawn a new villager named after the subscriber, settling at a town
        const homes = this.map.structures.filter((s) => s.kind === "town" || s.kind === "castle");
        const home = homes[Math.floor(this.rand() * homes.length)];
        if (home) {
          const center = {
            x: home.pos.x + Math.floor(home.size.x / 2),
            y: home.pos.y + Math.floor(home.size.y / 2),
          };
          const npcSeed = Math.floor(this.rand() * 2 ** 31);
          const added = this.pushNpc({
            id: `npc_sub_${user}_${Math.floor(this.state.time)}`,
            role: "villager",
            name: user,
            age: 18,
            pos: { ...center },
            prevPos: { ...center },
            facing: "s",
            homeId: home.id,
            workId: home.id,
            activity: "idle",
            path: [],
            activityTimer: 2,
            seed: npcSeed,
            trait: traitFor(npcSeed),
          });
          if (added) {
            this.spawnEffect({
              kind: "festival",
              structureId: home.id,
              intensity: 0.7 + tier * 0.1,
              durationMs: ev.duration_ms ?? 10_000,
              label: `${user} joined the kingdom`,
            });
            this.journal.write(
              `${user} arrived from afar and was welcomed into ${home.name}.`,
              "life",
            );
            // A self-contained backstory line, deterministic per (name, seed).
            this.journal.write(backstoryFor(user, npcSeed), "event");
          }
        }
        break;
      }
      case "twitch_bits": {
        const user = (ev.payload.meta?.user as string) ?? "a benefactor";
        const bits = (ev.payload.meta?.bits as number) ?? 100;
        this.spawnEffect({
          kind: "celebration",
          structureId: "highkeep",
          intensity: ev.intensity,
          durationMs: ev.duration_ms ?? 8000,
          label: `${user}: ${bits} coins`,
        });
        // bits → gold in treasury
        this.economy.state.gold = Math.min(99999, this.economy.state.gold + bits / 10);
        this.journal.write(
          `${user} sent a purse of ${bits} coins to the royal treasury.`,
          "milestone",
        );
        break;
      }
      case "twitch_raid": {
        const user = (ev.payload.meta?.user as string) ?? "a band of riders";
        const viewers = (ev.payload.meta?.viewers as number) ?? 10;
        // Airship arrival + multiple new villagers
        this.spawnAirshipOrMonster(
          {
            ...ev,
            payload: { ...ev.payload, label: `${user}'s arrival` },
          },
          "airship",
        );
        // Spawn N visiting villagers proportional to raid size (cap at 6)
        const count = Math.min(6, Math.max(2, Math.floor(Math.log2(viewers + 1))));
        const homes = this.map.structures.filter((s) => s.kind === "town" || s.kind === "castle");
        for (let i = 0; i < count; i++) {
          const home = homes[Math.floor(this.rand() * homes.length)];
          if (!home) continue;
          const center = {
            x: home.pos.x + Math.floor(home.size.x / 2),
            y: home.pos.y + Math.floor(home.size.y / 2),
          };
          const added = this.pushNpc({
            id: `npc_raid_${user}_${i}_${Math.floor(this.state.time)}`,
            role: "villager",
            name: `${user}'s companion`,
            age: 22,
            pos: { ...center },
            prevPos: { ...center },
            facing: "s",
            homeId: home.id,
            workId: home.id,
            activity: "idle",
            path: [],
            activityTimer: 1,
            seed: Math.floor(this.rand() * 2 ** 31),
          });
          if (!added) break; // cap reached — stop spawning the raid party
        }
        this.journal.write(
          `${user} led a raid party of ${viewers} into the kingdom. The streets filled with cheers.`,
          "milestone",
        );
        // Larger raids occasionally yield a vault piece.
        if (viewers >= 25 && Math.random() < 0.4) {
          this.treasury.acquire("treasure", `gift from ${user}'s raid`);
        }
        break;
      }
    }
  }

  private spawnCourier(ev: ExternalEvent) {
    const fromId = ev.payload.from ?? "scriptorium";
    const toId = ev.payload.to ?? "highkeep";
    const from = this.map.landmarks.get(fromId);
    const to = this.map.landmarks.get(toId);
    if (!from || !to) return;
    // Cap: drop oldest courier if at limit.
    if (this.couriers.length >= WORLD_CAPS.couriers) {
      this.couriers.shift();
    }
    const path = findPath(this.map, from, to) ?? [to];
    this.couriers.push({
      id: `cour_${this.couriers.length}_${Math.floor(this.state.time)}`,
      fromId,
      toId,
      label: ev.payload.label ?? "courier",
      pos: { ...from },
      prevPos: { ...from },
      path,
      speed: 4 + ev.intensity * 4,
      expiresAt: this.state.time + (ev.duration_ms ? ev.duration_ms / 1000 : 90),
    });
  }

  private spawnAirshipOrMonster(ev: ExternalEvent, kind: "airship" | "monster") {
    const startX = kind === "airship" ? -2 : this.map.width + 2;
    const startY = 2 + this.rand() * (this.map.height - 4);
    const endX = kind === "airship" ? this.map.width + 2 : -2;
    const dx = endX - startX;
    const distance = Math.abs(dx);
    const duration = (ev.duration_ms ?? 25_000) / 1000;
    this.effects.push({
      id: `${kind}_${Math.floor(this.state.time * 1000)}`,
      kind,
      pos: { x: startX, y: startY },
      prevPos: { x: startX, y: startY },
      velocity: { x: dx / duration, y: 0 },
      intensity: ev.intensity,
      expiresAt: this.state.time + duration,
      label: ev.payload.label,
    });
  }

  private spawnEffect(opts: {
    kind: ActiveEffect["kind"];
    structureId?: string;
    intensity: number;
    durationMs: number;
    label?: string;
  }) {
    if (this.effects.length >= WORLD_CAPS.effects) {
      this.effects.shift();
    }
    this.effects.push({
      id: `fx_${Math.floor(this.state.time * 1000)}_${this.effects.length}`,
      kind: opts.kind,
      structureId: opts.structureId,
      intensity: opts.intensity,
      expiresAt: this.state.time + opts.durationMs / 1000,
      label: opts.label,
    });
  }

  private npcSpeech(structureId: string | undefined, text: string | undefined) {
    if (!structureId || !text) return;
    const candidates = this.npcs.filter(
      (n) => n.homeId === structureId || n.workId === structureId,
    );
    if (!candidates.length) return;
    const npc = candidates[Math.floor(this.rand() * candidates.length)];
    npc.speech = text;
    npc.speechUntil = this.state.time + 3;
  }
}

/** Convenience for tests / internal flavor. */
export { makeEvent };
