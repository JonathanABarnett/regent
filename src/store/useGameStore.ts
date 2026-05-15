import { create } from "zustand";
import type { ExternalEvent } from "../sim/events/EventSchema";
import type { SavedJournalEntry } from "../sim/Persistence";
import { summarize, appendToArchive } from "../sim/KingdomArchive";
import type { CharacterSpec } from "../engine/CharacterSpec";
import { DEFAULT_SPEC } from "../engine/CharacterSpec";
import type { PetSpec } from "../engine/PetSpec";
import { defaultPetSpec } from "../engine/PetSpec";

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
  };
  pushEvent: (e: ExternalEvent) => void;
  clearEvents: () => void;
  pushJournalEntry: (e: SavedJournalEntry) => void;
  setJournal: (entries: SavedJournalEntry[]) => void;
  clearJournal: () => void;
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
  markSeenJournal: () => void;
  markSeenEvents: () => void;
}

const STORAGE_KEY = "kingdomos.settings.v1";

function loadSettings(): SettingsState {
  const fallback: SettingsState = {
    crt: false,
    audioVolume: 0.4,
    simSpeed: 1,
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
  setIdentity: (i) => set({ identity: i }),
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
