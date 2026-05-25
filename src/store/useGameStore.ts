import { create } from "zustand";
import type { ExternalEvent } from "../sim/events/EventSchema";
import type { SavedJournalEntry } from "../sim/Persistence";
import { summarize, appendToArchive } from "../sim/KingdomArchive";
import type { CharacterSpec } from "../engine/CharacterSpec";
import { DEFAULT_SPEC } from "../engine/CharacterSpec";
import type { PetSpec } from "../engine/PetSpec";
import { defaultPetSpec } from "../engine/PetSpec";
import { sanitizeName } from "../lib/sanitize";

/** Max characters retained for a kingdom motto. Exported so the UI can mirror. */
export const KINGDOM_MOTTO_MAX = 80;

export interface IntegrationToggles {
  narrative: boolean;
  system: boolean;
  fs: boolean;
  git: boolean;
  inbox: boolean;
  http: boolean;
}

export interface SettingsState {
  crt: boolean;
  audioVolume: number;
  simSpeed: number; // multiplier; 1 = normal
  integrations: IntegrationToggles;
  watchedPaths: string[];
  followRealSeasons: boolean;
  /**
   * Streamer overlay mode: hides the HUD, the panels, and the keyboard hints;
   * positions a small subscriber-event ticker top-right. Pair with an OBS
   * Browser Source pointing at the dev URL (or eventually the Tauri build).
   */
  streamerMode: boolean;
  /** Twitch channel name (display only — wired by the Rust adapter later). */
  twitchChannel: string;
  /** Show the FPS + entity-count perf overlay. */
  showPerfHud: boolean;
  /** Show the first-launch tutorial hints. Auto-true on first boot. */
  showTutorial: boolean;
  /** Sparse melody layer on top of the ambient drone pad. */
  musicEnabled: boolean;
  /** Ambient drone pad (the low background hum). Toggleable independently. */
  padEnabled: boolean;
  /**
   * Render the world at 480×270 then CSS-upscale for authentic chunky
   * 16-bit pixel feel. Requires a page reload to take effect.
   * Defaults to true — the retro look is the intended aesthetic.
   */
  retro16bit: boolean;
  /**
   * Cutaway / "dollhouse" mode: building sprites fade to translucent and
   * NPCs at home/work render INSIDE their building at the appropriate
   * station. Toggleable with the X key or in Settings.
   */
  cutawayMode: boolean;
  /**
   * Multiplier applied to all HUD text + panel text via a CSS root
   * variable. 1.0 is the default. Useful on small/HiDPI displays where
   * the 11–12px UI font is hard to read. Persists across sessions.
   */
  uiScale: number;
  /**
   * Colorblind-friendly palette swap. Currently retargets the faction
   * dots and weather glyphs so they're distinguishable without relying
   * on red/green hue contrast. Off by default.
   */
  colorblindMode: boolean;
}

export interface AchievementToast {
  id: string;
  title: string;
  description: string;
  unlockedAt: string;
}

export type CourtRole = "advisor" | "captain" | "scholar";

export interface KingdomIdentity {
  kingdomName: string;
  monarchName: string;
  /** Color of the castle's banner. Defaults to red on first founding. */
  bannerColor?: string;
  /**
   * A short player-written motto that appears on the Kingdom Card and in
   * the title bar. Optional. Capped to ~80 characters and sanitized of
   * control/bidi-override chars by the setter. Empty string means "none".
   */
  kingdomMotto?: string;
  /** Player-appointed NPCs filling specific court roles. NPC id → role. */
  court?: Partial<Record<CourtRole, string>>;
}

export interface GameState {
  events: ExternalEvent[];
  journal: SavedJournalEntry[];
  achievements: Record<string, string>;
  achievementToast: AchievementToast | null;
  identity: KingdomIdentity | null;
  monarchSpec: CharacterSpec;
  petSpec: PetSpec;
  /** Last-seen counts so HUD buttons can show "new" badges */
  seen: { journal: number; events: number };
  settings: SettingsState;
  worldStats: {
    hour: number;
    day: number;
    year: number;
    season: string;
    dayOfWeek: string;
    weather: string;
    npcCount: number;
    seed: number;
    /** name → NPC id map; refreshed each stats update so JournalPanel can linkify names */
    npcNames: Record<string, string>;
    /** Faction loyalty snapshot — pushed each stats update */
    factions: { merchants: number; scholars: number; guard: number };
    /** Trait-flavored quote from a random NPC, refreshes once per in-world day. */
    quoteOfDay?: string | null;
    /** Kingdom mood label ("the kingdom is content"). */
    moodLabel?: string;
    /** Kingdom mood tier for CSS styling. */
    moodTier?: "celebrating" | "content" | "uneasy" | "anxious";
    /** Monarch generation — increments on succession (= a monarch died
     *  and an heir ascended). Watched by FeedbackMoments to fire the
     *  monarch-death prompt at the peak emotional moment. */
    generation?: number;
    /** Featured advisor — the oldest living non-monarch NPC. Surfaces
     *  as a portrait chip in the HUD so the player has one named human
     *  to care about beyond their own monarch. Re-elected automatically
     *  when the current advisor dies (next-oldest takes the role). */
    advisor?: { id: string; name: string; role: string; trait?: string };
  };
  pushEvent: (e: ExternalEvent) => void;
  clearEvents: () => void;
  pushJournalEntry: (e: SavedJournalEntry) => void;
  setJournal: (entries: SavedJournalEntry[]) => void;
  clearJournal: () => void;
  /** Set a player-written note on a specific journal entry by id. */
  setJournalNote: (entryId: string, note: string) => void;
  unlockAchievement: (id: string, title: string, description: string) => void;
  setAchievements: (a: Record<string, string>) => void;
  dismissAchievementToast: () => void;
  setCrt: (b: boolean) => void;
  setIntegration: (k: keyof IntegrationToggles, v: boolean) => void;
  setSimSpeed: (n: number) => void;
  setVolume: (n: number) => void;
  setFollowRealSeasons: (b: boolean) => void;
  addWatchedPath: (p: string) => void;
  removeWatchedPath: (p: string) => void;
  updateWorldStats: (s: GameState["worldStats"]) => void;
  resetKingdom: () => void;
  setIdentity: (i: KingdomIdentity) => void;
  setMonarchSpec: (s: CharacterSpec) => void;
  setPetSpec: (s: PetSpec) => void;
  setStreamerMode: (b: boolean) => void;
  setTwitchChannel: (s: string) => void;
  setShowPerfHud: (b: boolean) => void;
  setShowTutorial: (b: boolean) => void;
  setMusicEnabled: (b: boolean) => void;
  setPadEnabled: (b: boolean) => void;
  setCutawayMode: (b: boolean) => void;
  setRetro16bit: (b: boolean) => void;
  setUiScale: (n: number) => void;
  setColorblindMode: (b: boolean) => void;
  markSeenJournal: () => void;
  markSeenEvents: () => void;
}

const STORAGE_KEY = "kingdomos.settings.v1";

function loadSettings(): SettingsState {
  const fallback: SettingsState = {
    crt: false,
    audioVolume: 0.4,
    // Playtest signal: at 1× speed the early world feels dead because
    // events are minutes apart. Default new installs to 2× — visible
    // motion per real minute makes "your kingdom is alive" actually
    // read as true. Veterans keep their persisted setting; only the
    // brand-new install ever sees this default.
    simSpeed: 2,
    integrations: {
      narrative: true,
      system: true,
      fs: false,
      git: false,
      inbox: true,
      http: false,
    },
    watchedPaths: [],
    followRealSeasons: false,
    streamerMode: false,
    twitchChannel: "",
    showPerfHud: false,
    showTutorial: true,
    musicEnabled: true,
    padEnabled: true,
    cutawayMode: false,
    retro16bit: true,
    uiScale: 1,
    colorblindMode: false,
  };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function persistSettings(s: SettingsState) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Apply accessibility settings to the document on initial mount so the
 * scale + palette take effect before the user touches Settings. Called
 * once during store construction; safe in SSR (no-ops without document).
 *
 * Clamps `uiScale` on load too — without this a hand-edited or corrupt
 * persisted value (e.g. `uiScale: 99`) would be written verbatim to the
 * CSS var and explode the layout.
 */
function applyA11ySettings(s: SettingsState) {
  if (typeof document === "undefined") return;
  const raw = Number(s.uiScale ?? 1);
  const scale = Number.isFinite(raw) ? Math.max(0.7, Math.min(1.5, raw)) : 1;
  document.documentElement.style.setProperty("--ui-scale", String(scale));
  document.documentElement.classList.toggle("colorblind", Boolean(s.colorblindMode));
}
applyA11ySettings(loadSettings());

export const useGameStore = create<GameState>((set, get) => ({
  events: [],
  journal: [],
  achievements: {},
  achievementToast: null,
  identity: null,
  monarchSpec: DEFAULT_SPEC,
  petSpec: defaultPetSpec("dog"),
  seen: { journal: 0, events: 0 },
  settings: loadSettings(),
  worldStats: {
    hour: 7,
    day: 1,
    year: 1,
    season: "spring",
    dayOfWeek: "",
    weather: "clear",
    npcCount: 0,
    seed: 0,
    npcNames: {},
    factions: { merchants: 0, scholars: 0, guard: 0 },
    generation: 1,
  },
  pushEvent: (e) => {
    set((s) => {
      const next = [...s.events, e];
      if (next.length > 100) next.splice(0, next.length - 100);
      return { events: next };
    });
  },
  clearEvents: () => set({ events: [] }),
  pushJournalEntry: (entry) => {
    set((s) => {
      const next = [...s.journal, entry];
      if (next.length > 500) next.splice(0, next.length - 500);
      return { journal: next };
    });
  },
  setJournal: (entries) => set({ journal: entries }),
  clearJournal: () => set({ journal: [] }),
  setJournalNote: (entryId, note) => set((s) => ({
    journal: s.journal.map((e) =>
      e.id === entryId ? { ...e, note: note.trim().slice(0, 240) || undefined } : e
    ),
  })),
  unlockAchievement: (id, title, description) => {
    const state = get();
    if (state.achievements[id]) return; // already unlocked
    const now = new Date().toISOString();
    const ach = { ...state.achievements, [id]: now };
    set({
      achievements: ach,
      achievementToast: { id, title, description, unlockedAt: now },
    });
    // auto-dismiss toast after 5s
    setTimeout(() => {
      const cur = get();
      if (cur.achievementToast?.id === id) set({ achievementToast: null });
    }, 5000);
  },
  setAchievements: (a) => set({ achievements: a }),
  dismissAchievementToast: () => set({ achievementToast: null }),
  setFollowRealSeasons: (b) =>
    set((s) => {
      const next = { ...s.settings, followRealSeasons: b };
      persistSettings(next);
      return { settings: next };
    }),
  resetKingdom: () => {
    // Before wiping, archive a compact summary of the kingdom we're about to
    // discard. Players who pour weeks into a kingdom and then choose to
    // start fresh should still be able to look back at the chronicle of every
    // kingdom they've ruled. summarize/appendToArchive are pure + small;
    // failure here doesn't block the reset.
    try {
      const raw = localStorage.getItem("kingdomos.kingdom.v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.kingdomName) {
          const summary = summarize(parsed);
          appendToArchive(summary);
        }
      }
    } catch (err) {
      console.warn("[resetKingdom] archive failed (non-fatal):", err);
    }
    try {
      localStorage.removeItem("kingdomos.kingdom.v1");
    } catch {
      /* ignore */
    }
    // Mark a global "skip-save" sentinel so the beforeunload handler doesn't
    // re-persist the in-memory world before the reload completes.
    (window as unknown as { __kingdomos_skip_save?: boolean }).__kingdomos_skip_save = true;
    set({ events: [], journal: [], achievements: {}, achievementToast: null, identity: null });
    location.reload();
  },
  setIdentity: (i) =>
    set({
      identity: {
        ...i,
        // Sanitize the motto every time identity is written. Cheap, and it
        // means callers (onboarding, settings, save migrations) never need
        // to remember to strip control/bidi/HTML themselves.
        kingdomMotto:
          i.kingdomMotto !== undefined
            ? sanitizeName(i.kingdomMotto, KINGDOM_MOTTO_MAX)
            : undefined,
      },
    }),
  setMonarchSpec: (s) => set({ monarchSpec: s }),
  setPetSpec: (s) => set({ petSpec: s }),
  setStreamerMode: (b) =>
    set((s) => {
      const next = { ...s.settings, streamerMode: b };
      persistSettings(next);
      return { settings: next };
    }),
  setTwitchChannel: (str) =>
    set((s) => {
      const next = { ...s.settings, twitchChannel: str };
      persistSettings(next);
      return { settings: next };
    }),
  setShowPerfHud: (b) =>
    set((s) => {
      const next = { ...s.settings, showPerfHud: b };
      persistSettings(next);
      return { settings: next };
    }),
  setShowTutorial: (b) =>
    set((s) => {
      const next = { ...s.settings, showTutorial: b };
      persistSettings(next);
      return { settings: next };
    }),
  setMusicEnabled: (b) =>
    set((s) => {
      const next = { ...s.settings, musicEnabled: b };
      persistSettings(next);
      return { settings: next };
    }),
  setPadEnabled: (b) =>
    set((s) => {
      const next = { ...s.settings, padEnabled: b };
      persistSettings(next);
      return { settings: next };
    }),
  setCutawayMode: (b) =>
    set((s) => {
      const next = { ...s.settings, cutawayMode: b };
      persistSettings(next);
      return { settings: next };
    }),
  setRetro16bit: (b) =>
    set((s) => {
      const next = { ...s.settings, retro16bit: b };
      persistSettings(next);
      return { settings: next };
    }),
  setUiScale: (n) =>
    set((s) => {
      // Clamp to a sane band — bigger than 1.5× breaks panel layouts and
      // smaller than 0.7× makes everything illegible. Discrete steps so
      // the value always matches one of the picker buttons.
      const clamped = Math.max(0.7, Math.min(1.5, n));
      const next = { ...s.settings, uiScale: clamped };
      persistSettings(next);
      // Apply immediately to the document so the visual effect is live
      // without waiting for any consumer to subscribe to the change.
      if (typeof document !== "undefined") {
        document.documentElement.style.setProperty("--ui-scale", String(clamped));
      }
      return { settings: next };
    }),
  setColorblindMode: (b) =>
    set((s) => {
      const next = { ...s.settings, colorblindMode: b };
      persistSettings(next);
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("colorblind", b);
      }
      return { settings: next };
    }),
  markSeenJournal: () =>
    set((s) => ({ seen: { ...s.seen, journal: s.journal.length } })),
  markSeenEvents: () =>
    set((s) => ({ seen: { ...s.seen, events: s.events.length } })),
  setCrt: (b) => {
    set((s) => {
      const next = { ...s.settings, crt: b };
      persistSettings(next);
      return { settings: next };
    });
  },
  setIntegration: (k, v) =>
    set((s) => {
      const next = { ...s.settings, integrations: { ...s.settings.integrations, [k]: v } };
      persistSettings(next);
      return { settings: next };
    }),
  setSimSpeed: (n) =>
    set((s) => {
      const next = { ...s.settings, simSpeed: n };
      persistSettings(next);
      return { settings: next };
    }),
  setVolume: (n) =>
    set((s) => {
      const next = { ...s.settings, audioVolume: n };
      persistSettings(next);
      return { settings: next };
    }),
  addWatchedPath: (p) =>
    set((s) => {
      if (s.settings.watchedPaths.includes(p)) return s;
      const next = { ...s.settings, watchedPaths: [...s.settings.watchedPaths, p] };
      persistSettings(next);
      return { settings: next };
    }),
  removeWatchedPath: (p) =>
    set((s) => {
      const next = { ...s.settings, watchedPaths: s.settings.watchedPaths.filter((x) => x !== p) };
      persistSettings(next);
      return { settings: next };
    }),
  updateWorldStats: (stats) => set({ worldStats: stats }),
}));

export { persistSettings };
