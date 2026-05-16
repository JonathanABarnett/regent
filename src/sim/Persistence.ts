import type { World } from "./World";
import type { NPC, Structure, WorldState } from "./types";
import { sanitizeName } from "../lib/sanitize";

/**
 * Save/load schema. Versioned so we can migrate when the data model changes
 * without invalidating existing kingdoms.
 *
 * Storage strategy:
 *   - Browser: localStorage (the dev preview, and the embedded webview when
 *     Tauri filesystem APIs aren't available)
 *   - Tauri: when available, also writes a JSON file to the app data dir so
 *     it survives across reinstalls / cache clears.
 */
export const SAVE_VERSION = 1;
const STORAGE_KEY = "kingdomos.kingdom.v1";

export interface SaveData {
  version: number;
  /** ISO-8601 timestamp the save was written */
  savedAt: string;
  /** real-world ms when this kingdom was first founded — anchors the calendar */
  foundedAtMs: number;
  /** Player-chosen kingdom name, fixed at founding. */
  kingdomName?: string;
  /** Player-chosen monarch name, fixed at founding. */
  monarchName?: string;
  /**
   * Optional one-line player-written kingdom motto. Persists across reigns
   * (it belongs to the kingdom, not the monarch). Capped at 80 chars on the
   * way in by the store's setIdentity; validateSave clamps again here as a
   * defense-in-depth pass against tampered files.
   */
  kingdomMotto?: string;
  /** Player-designed monarch appearance (CharacterSpec). */
  monarchSpec?: unknown;
  /** Player-designed pet appearance (PetSpec). */
  petSpec?: unknown;
  /** Real-world seconds the kingdom has been "lived" across all sessions */
  totalLifetimeSec: number;
  /** seed used to procgen this world */
  seed: number;
  /** in-world simulation time (seconds since boot) */
  simTime: number;
  weather: string;
  loadFactor: number;
  npcs: SavedNpc[];
  pets?: SavedPet[];
  /** key/value of unlocked achievement ids → ISO timestamp */
  achievements?: Record<string, string>;
  /** journal entries chronologically */
  journal?: SavedJournalEntry[];
  /** Royal succession: monarch generation + reign start day */
  succession?: { generation: number; reignStartDay: number };
  /** Royal vault — artifacts accumulated across all monarchs. */
  artifacts?: SavedArtifact[];
  /** Active or constructed buildings (we persist the active build; finished
   *  ones live inside map.structures, but the map itself is regenerated from
   *  seed so we also keep a stub list of "extra" structures to re-place). */
  construction?: {
    active: {
      kind: "watchtower" | "mill" | "shrine";
      startedDay: number;
      finishesOnDay: number;
      pos: { x: number; y: number };
    } | null;
    completed: Array<{
      id: string;
      kind: "watchtower" | "mill" | "shrine";
      name: string;
      pos: { x: number; y: number };
      size: { x: number; y: number };
    }>;
  };
  /** Aspirations system — active ids + map of completed ids → ISO timestamp. */
  aspirations?: {
    active: string[];
    completed: Record<string, string>;
  };
  /** Per-day stats snapshots for the sparklines panel. Oldest first. */
  history?: Array<{
    day: number;
    year: number;
    population: number;
    gold: number;
    vault: number;
    /** Added later; back-compat default is 0 on validate. */
    tomes: number;
  }>;
  /**
   * Spontaneous map landmarks discovered by the NarrativeDirector's
   * emergence branch (standing_stones, ruin, camp, wellspring, obelisk).
   * Separate from `construction.completed` because those are player-built
   * additions; landmarks are world-driven.
   */
  landmarks?: Array<{
    id: string;
    kind: string;
    name: string;
    pos: { x: number; y: number };
    size: { x: number; y: number };
  }>;
}

export interface SavedArtifact {
  id: string;
  kind: "scroll" | "relic" | "gem" | "tome" | "weapon" | "treasure";
  name: string;
  origin?: string;
  obtainedOnDay: number;
  obtainedOnYear: number;
}

export interface SavedPet {
  id: string;
  name: string;
  kind: "dog" | "cat";
  pos: { x: number; y: number };
  followingNpcId?: string;
}

export interface SavedJournalEntry {
  id: string;
  day: number;
  year: number;
  season: string;
  text: string;
  kind: "life" | "weather" | "event" | "milestone" | "system";
  /**
   * Optional structure this entry refers to ("highkeep", "rivermouth", "ironhearth", …).
   * When present, the JournalPanel renders a pin button that snaps the
   * camera to that structure's center. Old saves predate this field — UI
   * gracefully omits the pin button when undefined.
   */
  targetStructureId?: string;
}

export interface SavedNpc {
  id: string;
  role: NPC["role"];
  name?: string;
  pos: { x: number; y: number };
  facing: NPC["facing"];
  homeId: string;
  workId: string;
  seed: number;
  /** Optional persistent stats — relationships, age, etc. */
  age?: number;
  partnerId?: string;
  /** Ids of this NPC's parents (set only for in-sim newborns). */
  parentIds?: string[];
  /** Personality trait — restored on load, generated from seed on first spawn. */
  trait?: string;
}

export function serialize(
  world: World,
  lifetimeSec: number,
  extras: {
    achievements?: Record<string, string>;
    journal?: SavedJournalEntry[];
    kingdomName?: string;
    monarchName?: string;
    kingdomMotto?: string;
    monarchSpec?: unknown;
    petSpec?: unknown;
    succession?: { generation: number; reignStartDay: number };
    artifacts?: SavedArtifact[];
    construction?: SaveData["construction"];
  } = {},
): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    foundedAtMs: world.calendar.cfg.foundedAtMs,
    kingdomName: extras.kingdomName,
    monarchName: extras.monarchName,
    kingdomMotto: extras.kingdomMotto,
    monarchSpec: extras.monarchSpec,
    petSpec: extras.petSpec,
    totalLifetimeSec: lifetimeSec,
    seed: world.state.seed,
    simTime: world.state.time,
    weather: world.state.weather,
    loadFactor: world.state.loadFactor,
    npcs: world.npcs.map((n) => ({
      id: n.id,
      role: n.role,
      name: n.name,
      pos: { x: n.pos.x, y: n.pos.y },
      facing: n.facing,
      homeId: n.homeId,
      workId: n.workId,
      seed: n.seed,
      age: n.age,
      partnerId: n.partnerId,
      parentIds: n.parentIds,
      trait: n.trait,
    })),
    pets: world.pets.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      pos: { x: p.pos.x, y: p.pos.y },
      followingNpcId: p.followingNpcId,
    })),
    achievements: extras.achievements,
    journal: extras.journal,
    succession: extras.succession,
    artifacts: extras.artifacts,
    construction: extras.construction,
    aspirations: {
      active: world.aspirations.active,
      completed: world.aspirations.completed,
    },
    history: world.history.snapshots,
    landmarks: world.discoveries.snapshot(),
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

const NPCS_MAX_FROM_SAVE = 500;     // cap absolute roster from save (defends memory bombs)
const JOURNAL_MAX_FROM_SAVE = 5000;
const ACHIEVEMENTS_MAX_FROM_SAVE = 200;
const TEXT_MAX = 200;
const SAVE_SIZE_MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const VALID_FACINGS = new Set(["n", "s", "e", "w"]);
const VALID_NPC_ROLES = new Set([
  "villager", "courier", "scholar", "blacksmith", "miner", "guard", "monarch",
]);
const VALID_PET_KINDS = new Set(["dog", "cat"]);
const VALID_JOURNAL_KINDS = new Set(["life", "weather", "event", "milestone", "system"]);
const VALID_ARTIFACT_KINDS = new Set(["scroll", "relic", "gem", "tome", "weapon", "treasure"]);
const ARTIFACTS_MAX_FROM_SAVE = 200;

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function safeNumber(v: unknown, def = 0): number {
  if (typeof v !== "number") return def;
  if (!Number.isFinite(v)) return def;
  return v;
}

function safeInt(v: unknown, def = 0, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): number {
  const n = safeNumber(v, def);
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function safeString(v: unknown, max = TEXT_MAX): string {
  if (typeof v !== "string") return "";
  return sanitizeName(v, max);
}

/**
 * Returns a fully-sanitized SaveData object or null if the input is too
 * broken to recover. Never throws.
 */
export function validateSave(rawInput: unknown): SaveData | null {
  if (!isPlainObject(rawInput)) return null;
  let raw: Record<string, unknown> = rawInput;
  const incomingVersion = safeNumber(raw.version, 0);
  // Try to migrate older saves forward. If no path exists or the migration
  // returns null, treat the input as too broken to recover.
  if (incomingVersion !== SAVE_VERSION) {
    const migrated = migrateSave(raw, incomingVersion);
    if (!migrated) return null;
    raw = migrated;
  }
  const seed = safeInt(raw.seed, 0, 0, 2 ** 31 - 1);
  // Defensive cap on foundedAtMs: not in the future >1d, not before 2020-01-01.
  const now = Date.now();
  const foundedAtMs = (() => {
    const n = safeNumber(raw.foundedAtMs, now);
    return Math.max(1_577_836_800_000, Math.min(now + 86_400_000, n));
  })();
  const npcsRaw = Array.isArray(raw.npcs) ? raw.npcs : [];
  const npcs: SavedNpc[] = [];
  for (const item of npcsRaw.slice(0, NPCS_MAX_FROM_SAVE)) {
    if (!isPlainObject(item)) continue;
    const role = String(item.role);
    if (!VALID_NPC_ROLES.has(role)) continue;
    const facing = VALID_FACINGS.has(String(item.facing)) ? (item.facing as SavedNpc["facing"]) : "s";
    const pos = isPlainObject(item.pos)
      ? { x: safeNumber((item.pos as Record<string, unknown>).x, 0), y: safeNumber((item.pos as Record<string, unknown>).y, 0) }
      : { x: 0, y: 0 };
    let parentIds: string[] | undefined;
    if (Array.isArray(item.parentIds)) {
      const cleaned: string[] = [];
      // Walk the whole array but stop once we have 2 valid string entries.
      // This way `[42, null, "real_parent"]` still preserves "real_parent",
      // while `[a, b, c, d, e]` correctly caps to ["a", "b"].
      for (const p of item.parentIds as unknown[]) {
        if (cleaned.length >= 2) break;
        const s = safeString(p, 80);
        if (s) cleaned.push(s);
      }
      if (cleaned.length) parentIds = cleaned;
    }
    npcs.push({
      id: safeString(item.id, 80) || `npc_unknown_${npcs.length}`,
      role: role as SavedNpc["role"],
      name: item.name === undefined ? undefined : safeString(item.name, 64),
      pos,
      facing,
      homeId: safeString(item.homeId, 64) || "highkeep",
      workId: safeString(item.workId, 64) || "highkeep",
      seed: safeInt(item.seed, 0, 0, 2 ** 31 - 1),
      age: item.age === undefined ? undefined : Math.max(0, Math.min(200, safeNumber(item.age, 30))),
      partnerId: item.partnerId === undefined ? undefined : safeString(item.partnerId, 80),
      parentIds,
      trait: item.trait === undefined ? undefined : safeString(item.trait, 32),
    });
  }
  // Pets
  const petsRaw = Array.isArray(raw.pets) ? raw.pets : [];
  const pets: SavedPet[] = [];
  for (const item of petsRaw.slice(0, 8)) {
    if (!isPlainObject(item)) continue;
    const kind = String(item.kind);
    if (!VALID_PET_KINDS.has(kind)) continue;
    pets.push({
      id: safeString(item.id, 80) || `pet_${pets.length}`,
      name: safeString(item.name, 64) || "pet",
      kind: kind as SavedPet["kind"],
      pos: isPlainObject(item.pos)
        ? { x: safeNumber((item.pos as Record<string, unknown>).x, 0), y: safeNumber((item.pos as Record<string, unknown>).y, 0) }
        : { x: 0, y: 0 },
      followingNpcId: item.followingNpcId === undefined ? undefined : safeString(item.followingNpcId, 80),
    });
  }
  // Achievements (id → ISO timestamp). Strict on count and key length.
  const ach: Record<string, string> = {};
  if (isPlainObject(raw.achievements)) {
    let n = 0;
    for (const [k, v] of Object.entries(raw.achievements)) {
      if (n++ >= ACHIEVEMENTS_MAX_FROM_SAVE) break;
      if (k.length > 64) continue;
      if (typeof v !== "string") continue;
      ach[k] = safeString(v, 32);
    }
  }
  // Journal — keep newest entries first when capping
  const journal: SavedJournalEntry[] = [];
  if (Array.isArray(raw.journal)) {
    const slice = raw.journal.slice(-JOURNAL_MAX_FROM_SAVE);
    for (const item of slice) {
      if (!isPlainObject(item)) continue;
      const kind = String(item.kind);
      if (!VALID_JOURNAL_KINDS.has(kind)) continue;
      journal.push({
        id: safeString(item.id, 64) || `j_${journal.length}`,
        day: safeInt(item.day, 1, 0, 100_000),
        year: safeInt(item.year, 1, 0, 10_000),
        season: safeString(item.season, 16) || "spring",
        text: safeString(item.text, 240),
        kind: kind as SavedJournalEntry["kind"],
        targetStructureId:
          item.targetStructureId === undefined
            ? undefined
            : safeString(item.targetStructureId, 64) || undefined,
      });
    }
  }
  return {
    version: SAVE_VERSION,
    savedAt: safeString(raw.savedAt, 40) || new Date().toISOString(),
    foundedAtMs,
    kingdomName: raw.kingdomName === undefined ? undefined : safeString(raw.kingdomName, 32),
    monarchName: raw.monarchName === undefined ? undefined : safeString(raw.monarchName, 32),
    // Motto is capped at 80 (matches KINGDOM_MOTTO_MAX in the store), and
    // empty-string is normalized to undefined so renderers can use a simple
    // truthy check.
    kingdomMotto:
      raw.kingdomMotto === undefined
        ? undefined
        : (safeString(raw.kingdomMotto, 80) || undefined),
    monarchSpec: raw.monarchSpec, // re-validated by CharacterSpec consumers downstream
    petSpec: raw.petSpec,
    totalLifetimeSec: safeNumber(raw.totalLifetimeSec, 0),
    seed,
    simTime: Math.max(0, safeNumber(raw.simTime, 0)),
    weather: safeString(raw.weather, 16) || "clear",
    loadFactor: Math.max(0, Math.min(1, safeNumber(raw.loadFactor, 0))),
    npcs,
    pets,
    achievements: ach,
    journal,
    succession: isPlainObject(raw.succession)
      ? {
          generation: safeInt((raw.succession as Record<string, unknown>).generation, 1, 1, 1000),
          reignStartDay: safeInt(
            (raw.succession as Record<string, unknown>).reignStartDay,
            1,
            0,
            10_000_000,
          ),
        }
      : undefined,
    artifacts: Array.isArray(raw.artifacts)
      ? raw.artifacts
          .slice(0, ARTIFACTS_MAX_FROM_SAVE)
          .filter(isPlainObject)
          .map((item, idx) => {
            const kind = String(item.kind);
            if (!VALID_ARTIFACT_KINDS.has(kind)) return null;
            return {
              id: safeString(item.id, 80) || `art_${idx}`,
              kind: kind as SavedArtifact["kind"],
              name: safeString(item.name, 80) || "Unknown artifact",
              origin: item.origin === undefined ? undefined : safeString(item.origin, 120),
              obtainedOnDay: safeInt(item.obtainedOnDay, 1, 0, 100_000),
              obtainedOnYear: safeInt(item.obtainedOnYear, 1, 0, 10_000),
            } as SavedArtifact;
          })
          .filter((x): x is SavedArtifact => x !== null)
      : undefined,
    construction: validateConstruction(raw.construction),
    aspirations: validateAspirations(raw.aspirations),
    history: validateHistory(raw.history),
    landmarks: validateLandmarks(raw.landmarks),
  };
}

const VALID_LANDMARK_KINDS = new Set([
  "standing_stones",
  "ruin",
  "camp",
  "wellspring",
  "obelisk",
]);

function validateLandmarks(raw: unknown): SaveData["landmarks"] {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<SaveData["landmarks"]> = [];
  for (const item of raw.slice(0, 50)) {
    if (!isPlainObject(item)) continue;
    const k = String(item.kind);
    if (!VALID_LANDMARK_KINDS.has(k)) continue;
    out.push({
      id: safeString(item.id, 80) || `landmark_${out.length}`,
      kind: k,
      name: safeString(item.name, 64) || k,
      pos: isPlainObject(item.pos)
        ? {
            x: safeNumber((item.pos as Record<string, unknown>).x, 0),
            y: safeNumber((item.pos as Record<string, unknown>).y, 0),
          }
        : { x: 0, y: 0 },
      size: isPlainObject(item.size)
        ? {
            x: safeNumber((item.size as Record<string, unknown>).x, 2),
            y: safeNumber((item.size as Record<string, unknown>).y, 2),
          }
        : { x: 2, y: 2 },
    });
  }
  return out;
}

const HISTORY_MAX = 90;
function validateHistory(raw: unknown): SaveData["history"] {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<SaveData["history"]> = [];
  for (const item of raw.slice(-HISTORY_MAX)) {
    if (!isPlainObject(item)) continue;
    const day = safeInt(item.day, -1, 0, 100_000);
    const year = safeInt(item.year, -1, 0, 10_000);
    if (day < 0 || year < 0) continue;
    out.push({
      day,
      year,
      population: safeInt(item.population, 0, 0, 10_000),
      gold: safeInt(item.gold, 0, 0, 999_999),
      vault: safeInt(item.vault, 0, 0, 1_000),
      // tomes was added after the initial release; old saves without it
      // default to 0 so the sparkline just flats for the pre-upgrade days.
      tomes: safeInt(item.tomes, 0, 0, 999_999),
    });
  }
  return out;
}

const ASPIRATIONS_MAX_ACTIVE = 16;
const ASPIRATIONS_MAX_COMPLETED = 100;

function validateAspirations(raw: unknown): SaveData["aspirations"] {
  if (!isPlainObject(raw)) return undefined;
  const active: string[] = [];
  if (Array.isArray(raw.active)) {
    for (const v of (raw.active as unknown[]).slice(0, ASPIRATIONS_MAX_ACTIVE)) {
      const s = safeString(v, 64);
      if (s) active.push(s);
    }
  }
  const completed: Record<string, string> = {};
  if (isPlainObject(raw.completed)) {
    let n = 0;
    for (const [k, v] of Object.entries(raw.completed)) {
      if (n++ >= ASPIRATIONS_MAX_COMPLETED) break;
      if (k.length > 64) continue;
      if (typeof v !== "string") continue;
      completed[k] = safeString(v, 32);
    }
  }
  return { active, completed };
}

const VALID_BUILD_KINDS = new Set(["watchtower", "mill", "shrine"]);

function validateConstruction(raw: unknown): SaveData["construction"] {
  if (!isPlainObject(raw)) return undefined;
  // active
  let active: NonNullable<SaveData["construction"]>["active"] = null;
  if (isPlainObject(raw.active)) {
    const k = String(raw.active.kind);
    if (VALID_BUILD_KINDS.has(k)) {
      active = {
        kind: k as "watchtower" | "mill" | "shrine",
        startedDay: safeInt(raw.active.startedDay, 1, 0, 100_000),
        finishesOnDay: safeInt(raw.active.finishesOnDay, 1, 0, 100_000),
        pos: isPlainObject(raw.active.pos)
          ? {
              x: safeNumber((raw.active.pos as Record<string, unknown>).x, 0),
              y: safeNumber((raw.active.pos as Record<string, unknown>).y, 0),
            }
          : { x: 0, y: 0 },
      };
    }
  }
  const completed: NonNullable<SaveData["construction"]>["completed"] = [];
  if (Array.isArray(raw.completed)) {
    for (const item of raw.completed.slice(0, 50)) {
      if (!isPlainObject(item)) continue;
      const k = String(item.kind);
      if (!VALID_BUILD_KINDS.has(k)) continue;
      completed.push({
        id: safeString(item.id, 80) || `build_${completed.length}`,
        kind: k as "watchtower" | "mill" | "shrine",
        name: safeString(item.name, 64) || k,
        pos: isPlainObject(item.pos)
          ? {
              x: safeNumber((item.pos as Record<string, unknown>).x, 0),
              y: safeNumber((item.pos as Record<string, unknown>).y, 0),
            }
          : { x: 0, y: 0 },
        size: isPlainObject(item.size)
          ? {
              x: safeNumber((item.size as Record<string, unknown>).x, 2),
              y: safeNumber((item.size as Record<string, unknown>).y, 2),
            }
          : { x: 2, y: 2 },
      });
    }
  }
  return { active, completed };
}

/** Apply a save in-place to a freshly constructed World seeded with the same seed. */
export function applySave(world: World, save: SaveData): void {
  if (save.version !== SAVE_VERSION) {
    console.warn(`[Persistence] save version ${save.version} ≠ current ${SAVE_VERSION}; ignoring`);
    return;
  }
  (world.state as WorldState).time = save.simTime;
  world.state.weather = save.weather as WorldState["weather"];
  world.state.loadFactor = save.loadFactor;
  // NPC roster: replace by id where possible. Also reconstruct any newborns
  // (NPCs that exist in the save but not in the freshly-spawned world). Without
  // this, children born in a prior session vanish on reload.
  const byId = new Map(world.npcs.map((n) => [n.id, n]));
  for (const saved of save.npcs) {
    const live = byId.get(saved.id);
    if (live) {
      live.pos = { ...saved.pos };
      live.prevPos = { ...saved.pos };
      live.facing = saved.facing;
      if (saved.name) live.name = saved.name;
      if (saved.age !== undefined) live.age = saved.age;
      if (saved.partnerId) live.partnerId = saved.partnerId;
      if (saved.parentIds && saved.parentIds.length) live.parentIds = [...saved.parentIds];
      if (saved.trait) live.trait = saved.trait as typeof live.trait;
    } else {
      // Newborn from a prior session — reconstruct as a fresh NPC. pushNpc
      // enforces the runtime cap so a malicious save can't blow memory.
      world.pushNpc({
        id: saved.id,
        role: saved.role,
        name: saved.name,
        age: saved.age,
        partnerId: saved.partnerId,
        parentIds: saved.parentIds ? [...saved.parentIds] : undefined,
        trait: saved.trait as NPC["trait"] | undefined,
        pos: { ...saved.pos },
        prevPos: { ...saved.pos },
        facing: saved.facing,
        homeId: saved.homeId,
        workId: saved.workId,
        activity: "idle",
        path: [],
        activityTimer: 0,
        seed: saved.seed,
      });
    }
  }
  // Restore pets, if any.
  if (save.pets) {
    world.pets.length = 0;
    for (const p of save.pets) {
      world.pets.push({
        id: p.id,
        name: p.name,
        kind: p.kind,
        pos: { ...p.pos },
        prevPos: { ...p.pos },
        facing: "s",
        followingNpcId: p.followingNpcId,
      });
    }
  }
  // Seed the life-events system with the current day so we don't replay
  // marriages/births/deaths from day 1 just because the session restarted.
  // The cast survives because LifeEvents.lastProcessedDay is private —
  // we touch it intentionally as a save-load concession.
  (world.lifeEvents as unknown as { lastProcessedDay: number }).lastProcessedDay =
    world.state.day;
  // Restore succession state if present.
  if (save.succession) {
    world.succession.state.generation = save.succession.generation;
    world.succession.state.reignStartDay = save.succession.reignStartDay;
  }
  // Restore vault contents
  if (save.artifacts) {
    world.treasury.hydrate(save.artifacts);
  }
  // Restore construction: re-place completed buildings on the map and resume
  // any in-progress build.
  if (save.construction) {
    for (const c of save.construction.completed) {
      if (world.map.structures.some((s) => s.id === c.id)) continue;
      world.map.structures.push({
        id: c.id,
        kind: c.kind,
        name: c.name,
        pos: { ...c.pos },
        size: { ...c.size },
      });
      world.map.landmarks.set(c.id, {
        x: c.pos.x + Math.floor(c.size.x / 2),
        y: c.pos.y + Math.floor(c.size.y / 2),
      });
      // make walkable
      for (let dy = 0; dy < c.size.y; dy++) {
        for (let dx = 0; dx < c.size.x; dx++) {
          const t = world.map.tiles[(c.pos.y + dy) * world.map.width + (c.pos.x + dx)];
          if (t) t.walkable = true;
        }
      }
    }
    world.construction.hydrate(save.construction.active);
  }

  // "Welcome back, monarch X" — if the player has been gone a meaningful
  // stretch, write a single journal entry summarizing the gap. This is the
  // moment the wall-clock calendar pays off: returning to a world that has
  // moved on without you should *feel* like that.
  // Restore aspirations (active + completed) if present.
  if (save.aspirations) {
    world.aspirations.hydrate(save.aspirations.active, save.aspirations.completed);
  }
  // Restore the per-day history sparkline buffer.
  if (save.history) {
    world.history.hydrate(save.history);
  }
  // Re-place narrative-discovered landmarks. The map itself regenerates
  // from seed each load so the procgen structures come back automatically,
  // but landmarks are runtime additions and need to be restored.
  if (save.landmarks) {
    for (const l of save.landmarks) {
      if (world.map.structures.some((s) => s.id === l.id)) continue;
      world.map.structures.push({
        id: l.id,
        kind: l.kind as Structure["kind"],
        name: l.name,
        pos: { ...l.pos },
        size: { ...l.size },
      });
      world.map.landmarks.set(l.id, {
        x: l.pos.x + Math.floor(l.size.x / 2),
        y: l.pos.y + Math.floor(l.size.y / 2),
      });
      // Make the footprint walkable
      for (let dy = 0; dy < l.size.y; dy++) {
        for (let dx = 0; dx < l.size.x; dx++) {
          const t = world.map.tiles[(l.pos.y + dy) * world.map.width + (l.pos.x + dx)];
          if (t) t.walkable = true;
        }
      }
    }
  }
  writeWelcomeBack(world, save);
}

function writeWelcomeBack(world: World, save: SaveData) {
  const lastSavedAt = save.savedAt ? new Date(save.savedAt).getTime() : 0;
  if (!lastSavedAt || Number.isNaN(lastSavedAt)) return;
  const realMsAway = Date.now() - lastSavedAt;
  if (realMsAway < 5 * 60 * 1000) return; // skip for short reopens (< 5min)
  const hoursAway = Math.floor(realMsAway / (60 * 60 * 1000));
  let summary: string;
  if (hoursAway < 24) {
    const hourWord = hoursAway <= 1 ? "an hour" : `${hoursAway} hours`;
    summary = `You returned after ${hourWord} away. The kingdom carried on.`;
  } else {
    const days = Math.floor(hoursAway / 24);
    summary = `You returned after ${days} day${days === 1 ? "" : "s"} away. The kingdom aged with you, in its own time.`;
  }
  // Note: world.journal exists but its onEntry callback won't be hooked up
  // yet at apply-time (App.tsx wires it after). Queue this message for the
  // next event so it lands in the Zustand journal too.
  setTimeout(() => {
    try {
      world.journal.write(summary, "system");
    } catch {
      /* ignore */
    }
  }, 200);
}

export function writeSave(save: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch (err) {
    console.warn("[Persistence] localStorage write failed", err);
  }
  // Best-effort Tauri filesystem mirror; ignore if not available
  void writeTauriCopy(save);
}

export function readSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    if (raw.length > SAVE_SIZE_MAX_BYTES) {
      console.warn(`[Persistence] save too large (${raw.length} bytes); ignoring`);
      return null;
    }
    const parsed = JSON.parse(raw);
    return validateSave(parsed);
  } catch (err) {
    console.warn("[Persistence] read failed", err);
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Trigger a browser download of the current save as a JSON file.
 * Filename includes kingdom name (if any) and ISO date for archival.
 */
export function exportSave(save: SaveData): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeKingdom = (save.kingdomName ?? "kingdom").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 24);
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${safeKingdom}-${dateStr}.kingdomos.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Import a save from a user-selected file. Returns the parsed-and-validated
 * SaveData or null if the file is unreadable or fails validation.
 */
export async function importSaveFromFile(file: File): Promise<SaveData | null> {
  if (file.size > SAVE_SIZE_MAX_BYTES) {
    console.warn(`[Persistence] import: file too large (${file.size} bytes)`);
    return null;
  }
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    return validateSave(parsed);
  } catch (err) {
    console.warn("[Persistence] import: parse failed", err);
    return null;
  }
}

/** Persist the parsed-and-validated import as the active save and trigger reload. */
export function commitImportedSave(save: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch (err) {
    console.warn("[Persistence] commitImportedSave failed", err);
  }
}

/**
 * Lift an older save shape forward to the current SAVE_VERSION. Returns the
 * migrated object (still loosely typed; full validation runs after) or null
 * if no migration path exists.
 *
 * Each migration is a small pure function: take the raw object as the
 * previous version expected it, return the raw object as the next version
 * expects it. Stack migrations to walk N→N+1→…→current.
 *
 * No migrations are needed yet (we're at v1) but the scaffold is here so a
 * future v2 doesn't have to invent the architecture under deadline.
 */
function migrateSave(raw: Record<string, unknown>, fromVersion: number): Record<string, unknown> | null {
  let current: Record<string, unknown> = { ...raw };
  let v = fromVersion;
  // Migration chain — each step bumps version by 1.
  if (v === 0) { current = migrateV0ToV1(current); v = 1; }
  // Future migrations:
  //   if (v === 1) { current = migrateV1ToV2(current); v = 2; }
  //   if (v === 2) { current = migrateV2ToV3(current); v = 3; }
  if (v !== SAVE_VERSION) {
    console.warn(`[Persistence] no migration path from v${fromVersion} to v${SAVE_VERSION}`);
    return null;
  }
  return current;
}

/**
 * Migrate a v0 save (pre-release internal builds) up to v1.
 *
 * v0 saves predate several fields that the v1 schema considers optional but
 * the systems expect to find sensibly defaulted. The migration adds those
 * fields with safe placeholders rather than letting validateSave drop them.
 *
 * This is the canonical example of a save migration. When v2 ships, write
 * `migrateV1ToV2(raw)` in the same shape, chain it above.
 */
function migrateV0ToV1(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw, version: 1 };

  // v0 NPCs may be missing trait, parentIds, partnerId, age.
  if (Array.isArray(out.npcs)) {
    out.npcs = (out.npcs as unknown[]).map((n) => {
      if (!n || typeof n !== "object") return n;
      const npc = n as Record<string, unknown>;
      return {
        ...npc,
        // age defaulted to 30 if absent — adult, neither too old nor too young
        age: npc.age ?? 30,
      };
      // trait, partnerId, parentIds are optional in the v1 schema — leave undefined
    });
  }

  // v0 had no succession block; default to first generation.
  if (out.succession === undefined) {
    out.succession = { generation: 1, reignStartDay: 1 };
  }

  // v0 had no artifacts / construction / aspirations blocks. Leave as empty.
  if (out.artifacts === undefined) out.artifacts = [];
  if (out.construction === undefined) out.construction = { active: null, completed: [] };
  if (out.aspirations === undefined) out.aspirations = { active: [], completed: {} };

  // v0 had no journal — leave as empty so the new validator doesn't drop it.
  if (out.journal === undefined) out.journal = [];

  return out;
}

async function writeTauriCopy(save: SaveData): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  try {
    const fs = await import("@tauri-apps/plugin-fs");
    await fs.writeTextFile("kingdom.json", JSON.stringify(save, null, 2), {
      baseDir: fs.BaseDirectory.AppData,
    });
  } catch (err) {
    // non-fatal: localStorage write already succeeded
    console.warn("[Persistence] Tauri mirror failed", err);
  }
}
