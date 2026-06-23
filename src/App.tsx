import { useEffect, useRef, useState } from "react";
import { World } from "./sim/World";
import { PixiApp } from "./engine/PixiApp";
import { useGameStore } from "./store/useGameStore";
import { HUD } from "./ui/HUD";
import { EventLog } from "./ui/EventLog";
import { FamilyTreePanel } from "./ui/FamilyTreePanel";
import { DiplomacyPanel } from "./ui/DiplomacyPanel";
import { SettingsPanel } from "./ui/SettingsPanel";
import { PhotoMode } from "./ui/PhotoMode";
import { UpdateToast } from "./ui/UpdateToast";
import { UiSound } from "./ui/UiSound";
import { VideoCapture } from "./ui/VideoCapture";
import { FoundingMoment } from "./ui/FoundingMoment";
import { FeedbackPanel } from "./ui/FeedbackPanel";
import { FeedbackMoments } from "./ui/FeedbackMoments";
import { IntroCarousel } from "./ui/IntroCarousel";
import { RoyalActions } from "./ui/RoyalActions";
import { KingdomCard } from "./ui/KingdomCard";
import { JournalPanel } from "./ui/JournalPanel";
import { AchievementToast } from "./ui/AchievementToast";
import { NpcInspect } from "./ui/NpcInspect";
import { StructureInspector } from "./ui/StructureInspector";
import { StatsDashboard } from "./ui/StatsDashboard";
import { HelpOverlay } from "./ui/HelpOverlay";
import { StreamerOverlay } from "./ui/StreamerOverlay";
import { MiniMap } from "./ui/MiniMap";
import { DecisionPrompt } from "./ui/DecisionPrompt";
import { SpeedControl } from "./ui/SpeedControl";
import { PerformanceHUD } from "./ui/PerformanceHUD";
import { TutorialHints } from "./ui/TutorialHints";
import { DripHints } from "./ui/DripHints";
import { CaughtUp } from "./ui/CaughtUp";
import {
  mapTwitchFollow,
  mapTwitchSub,
  mapTwitchBits,
  mapTwitchRaid,
} from "./sim/events/EventMapper";
import type { Structure } from "./sim/types";
import { NPCProfilePanel } from "./ui/NPCProfilePanel";
import { KingdomChronicle } from "./ui/KingdomChronicle";
import { VaultPanel } from "./ui/VaultPanel";
import { OnboardingModal } from "./ui/OnboardingModal";
import { TitleScreen } from "./ui/TitleScreen";
import { CharacterCreator } from "./ui/CharacterCreator";
import { PetCreator } from "./ui/PetCreator";
import { DEFAULT_SPEC, type CharacterSpec } from "./engine/CharacterSpec";
import type { PetSpec } from "./engine/PetSpec";
import { bindTrayMenu } from "./ui/TrayMenuBindings";
import { Achievements } from "./sim/systems/Achievements";
import { quoteOfDay } from "./sim/systems/Quotes";
import { Aspirations } from "./sim/systems/Aspirations";
import { AudioEngine } from "./engine/Audio";
import type { ExternalEvent } from "./sim/events/EventSchema";
import { ExternalEvent as Schema } from "./sim/events/EventSchema";
import {
  readSave,
  writeSave,
  applySave,
  serialize,
  readPendingNewGame,
  clearPendingNewGame,
  runAwayProgression,
} from "./sim/Persistence";
import { StewardReport } from "./ui/StewardReport";
import { TabTitle } from "./ui/TabTitle";
import { ShareMoments } from "./ui/ShareMoments";
import { InstallPrompt } from "./ui/InstallPrompt";

declare global {
  interface Window {
    /** dev hook so external scripts (or the console) can publish events */
    kingdomos?: {
      publish: (e: unknown) => void;
      world: () => World;
      twitch: {
        follow: (user: string) => void;
        sub: (user: string, tier?: 1 | 2 | 3) => void;
        bits: (user: string, bits: number) => void;
        raid: (user: string, viewers: number) => void;
      };
      openFeedback: () => void;
    };
  }
}

/**
 * Map an achievement id to an audio category so unlocks of different kinds
 * get distinct musical fingerprints. Centralized here so the audio engine
 * stays category-agnostic and additions to the achievement pool are easy.
 */
function categorizeAchievement(
  id: string,
): "life" | "time" | "construction" | "vault" | "mystery" | "default" {
  if (id.startsWith("hidden_")) return "mystery";
  if (id === "first_marriage" || id === "first_birth" || id === "first_death" || id === "population_25") return "life";
  if (id === "day_7" || id === "day_30" || id === "year_1" || id === "succession_2" || id === "succession_5") return "time";
  if (id === "first_building") return "construction";
  if (id === "vault_3" || id === "vault_10") return "vault";
  return "default";
}

/**
 * "Away-from" timestamp, captured ONCE at module load — before React mounts
 * and before any autosave can refresh the save's savedAt. runAwayProgression
 * measures the absence against this stable value, so the offline replay is
 * immune to StrictMode's double-mount (where mount #1's autosave would
 * otherwise bump savedAt to "now" before mount #2 reads it) and to any other
 * mid-boot save. Re-evaluated naturally on a real page reload.
 */
const BOOT_LAST_SEEN_AT = (() => {
  try {
    const s = readSave();
    return s?.savedAt ? new Date(s.savedAt).getTime() : 0;
  } catch {
    return 0;
  }
})();

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World | null>(null);
  const pixiRef = useRef<PixiApp | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  // Right-rail panels all occupy the same screen real estate (top:36px,
  // right:8px). One slot, one open panel at a time. We store the active
  // panel as a discriminated string and derive the per-panel booleans, so
  // opening Family auto-closes Stats, opening Journal auto-closes Family, etc.
  // The legacy `setXOpen(bool | (b) => !b)` shape is preserved via a setter
  // factory so existing call sites don't need to change.
  type RightPanel = "log" | "journal" | "family" | "diplomacy" | "stats" | null;
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const logOpen = rightPanel === "log";
  const journalOpen = rightPanel === "journal";
  const familyTreeOpen = rightPanel === "family";
  const diplomacyOpen = rightPanel === "diplomacy";
  const statsOpen = rightPanel === "stats";
  const makeRightPanelSetter = (panel: Exclude<RightPanel, null>) =>
    (v: boolean | ((prev: boolean) => boolean)) => {
      setRightPanel((cur) => {
        const wasOpen = cur === panel;
        const next = typeof v === "function" ? v(wasOpen) : v;
        if (next) return panel;
        return wasOpen ? null : cur;
      });
    };
  const setLogOpen = makeRightPanelSetter("log");
  const setJournalOpen = makeRightPanelSetter("journal");
  const setFamilyTreeOpen = makeRightPanelSetter("family");
  const setDiplomacyOpen = makeRightPanelSetter("diplomacy");
  const setStatsOpen = makeRightPanelSetter("stats");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [royalOpen, setRoyalOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [petCreatorOpen, setPetCreatorOpen] = useState(false);
  const [inspected, setInspected] = useState<Structure | null>(null);
  const [profileNpcId, setProfileNpcId] = useState<string | null>(null);
  const [kingdomCardOpen, setKingdomCardOpen] = useState(false);
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  // Ambient mode: the kingdom canvas floats in an always-on-top Document
  // Picture-in-Picture window (Chrome 116+, Firefox 151+) while the player
  // works. The Rusty's-Retirement loop, in a browser.
  const [ambientActive, setAmbientActive] = useState(false);
  const ambientCleanupRef = useRef<(() => void) | null>(null);
  // Show the title screen on first paint. Dismissed by Continue / New / etc.
  // Exception: if the "How to Play" walkthrough wiped + reloaded to start a
  // fresh kingdom, skip straight past the title into the creation flow.
  // Read-only here (StrictMode double-invokes initializers); the flag is
  // cleared in an effect below so it can't leak into a later boot.
  const [titleOpen, setTitleOpen] = useState(() => !readPendingNewGame());
  // Intro carousel gates the title screen on a brand-new install. The
  // carousel itself reads its own seen-flag from localStorage in an
  // effect and calls onDone immediately if the player has already seen
  // it — so existing players never see the title screen blocked. New
  // players see 3 cards explaining the genre BEFORE clicking BEGIN.
  const [introOpen, setIntroOpen] = useState(true);
  // Detect "has a saved kingdom" once on mount.
  const hasSaveRef = useRef<boolean>(!!readSave());
  /** Pending identity choices from onboarding, applied once the creator commits. */
  const pendingIdentityRef = useRef<{
    kingdomName: string;
    monarchName: string;
    petName: string;
    petKind: "dog" | "cat";
  } | null>(null);
  /**
   * Last submitted onboarding draft. Survives the round-trip through the
   * character creator so when the player clicks "← Back" we can re-mount
   * the OnboardingModal pre-filled with the names they actually typed,
   * not a fresh batch of random picks.
   */
  const [onboardingDraft, setOnboardingDraft] = useState<{
    kingdomName: string;
    monarchName: string;
    petName: string;
    petKind: "dog" | "cat";
  } | null>(null);
  // Consume the one-shot "start fresh" flag after the initial render has
  // already read it. Idempotent, so StrictMode's double-effect is harmless.
  useEffect(() => {
    clearPendingNewGame();
  }, []);
  const crt = useGameStore((s) => s.settings.crt);
  const reignStyle = useGameStore((s) => s.settings.reignStyle);
  const integrations = useGameStore((s) => s.settings.integrations);
  const watchedPaths = useGameStore((s) => s.settings.watchedPaths);
  const audioVolume = useGameStore((s) => s.settings.audioVolume);
  const followRealSeasons = useGameStore((s) => s.settings.followRealSeasons);
  const streamerMode = useGameStore((s) => s.settings.streamerMode);
  const pushEvent = useGameStore((s) => s.pushEvent);
  const updateWorldStats = useGameStore((s) => s.updateWorldStats);
  const pushJournalEntry = useGameStore((s) => s.pushJournalEntry);
  const setJournal = useGameStore((s) => s.setJournal);
  const setAchievementsStore = useGameStore((s) => s.setAchievements);
  const unlockAchievement = useGameStore((s) => s.unlockAchievement);
  const setIdentity = useGameStore((s) => s.setIdentity);
  const identity = useGameStore((s) => s.identity);
  const monarchSpec = useGameStore((s) => s.monarchSpec);
  const setMonarchSpec = useGameStore((s) => s.setMonarchSpec);
  const petSpec = useGameStore((s) => s.petSpec);
  const setPetSpec = useGameStore((s) => s.setPetSpec);

  // Reign style → the sim's decision appetite. Lives as a plain field on
  // World so the sim never imports the store; this effect keeps it synced
  // (the boot effect also applies it at world creation).
  useEffect(() => {
    const w = worldRef.current;
    if (!w) return;
    w.decisionAppetite =
      reignStyle === "handsOff" ? 0.45 : reignStyle === "handsOn" ? 1.8 : 1;
  }, [reignStyle]);

  // ── Tauri settings sync ───────────────────────────────────────────────────
  // Push integration toggles and watched paths to the Rust backend whenever
  // they change. The git watcher, fs watcher, and system monitor all read
  // these at runtime; without this sync they use their empty defaults.
  // Runs as a no-op in browser preview (no __TAURI_INTERNALS__).
  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("set_integrations", {
        integrations: {
          narrative: integrations.narrative,
          system:    integrations.system,
          fs:        integrations.fs,
          git:       integrations.git,
          inbox:     integrations.inbox,
          http:      integrations.http,
        },
      }).catch((e: unknown) => console.warn("[Tauri] set_integrations:", e));

      invoke("set_watched_paths", { paths: watchedPaths })
        .catch((e: unknown) => console.warn("[Tauri] set_watched_paths:", e));
    }).catch(() => {});
  }, [integrations, watchedPaths]);

  // ── boot world + pixi ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    // Reuse the saved seed if a kingdom already exists — same map, same NPC
    // identities, persistent across launches.
    const existing = readSave();
    const world = new World(
      existing
        ? {
            seed: existing.seed,
            // Preserve map dimensions — old saves fall back to original 96×64.
            width: existing.mapWidth ?? 96,
            height: existing.mapHeight ?? 64,
            // Preserve day speed — old saves fall back to original 24 min/day.
            minutesPerDay: existing.minutesPerDay ?? 24,
            foundedAtMs: existing.foundedAtMs,
            followRealSeasons,
          }
        : {
            // New games: 320×200 overworld, 48 min/day (1 year ≈ 38 real hours).
            width: 320,
            height: 200,
            minutesPerDay: 48,
            followRealSeasons,
          },
    );
    if (existing) {
      try {
        applySave(world, existing);
      } catch (err) {
        console.warn("[App] applySave failed; starting fresh", err);
      }
    }
    worldRef.current = world;
    // Apply the persisted reign style now — the sync effect may have run
    // before the world existed.
    {
      const style = useGameStore.getState().settings.reignStyle;
      world.decisionAppetite =
        style === "handsOff" ? 0.45 : style === "handsOn" ? 1.8 : 1;
    }

    // Wire journal entries from the sim into the Zustand store. Hydrate first
    // from save so the panel shows history before any new entries arrive.
    if (existing?.journal) {
      setJournal(existing.journal);
    } else {
      setJournal([]);
    }
    world.onJournal = (entry) => {
      pushJournalEntry(entry);
      // Subtle audio cue tied to journal kind. Skip system entries (they're
      // engine chatter, not narrative beats).
      const audio = audioRef.current;
      if (audio && entry.kind !== "system") {
        if (entry.kind === "milestone") {
          // Brighter chime — coming-of-age, retirement, victory etc.
          audio.chimeFor("default");
        } else if (entry.kind === "life") {
          // Soft warm chord for life events.
          audio.chimeFor("life");
        }
        // event/weather entries already get SFX from bus subscriptions; no
        // double cue needed.
      }
    };

    // ── Away progression: make the missed days actually happen ─────────────
    // The wall-clock calendar already aged the kingdom while the app was
    // closed; this replays the missed days (births, caravans, consequences,
    // gold) and queues the Steward's Report modal with the outcome. Runs
    // AFTER onJournal is wired so the replayed entries land in the store.
    if (existing?.kingdomName) {
      try {
        const report = runAwayProgression(world, existing, BOOT_LAST_SEEN_AT);
        if (report) useGameStore.getState().setStewardReport(report);
      } catch (err) {
        console.warn("[App] away progression failed (non-fatal)", err);
      }
    }

    // Mirror the decision-queue size into the store so the HUD council
    // chip, tab-title badge, and "all caught up" closure can react. Fires
    // immediately with the current count, then on every queue change.
    const setPending = useGameStore.getState().setPendingDecisions;
    world.decisions.subscribe(() => setPending(world.decisions.count()));

    // Death bell + lightning flash: listen on the world bus for special signals.
    world.bus.subscribe((ev) => {
      const el = containerRef.current;
      if (!el) return;

      if (
        ev.kind === "custom" &&
        typeof ev.payload.label === "string" &&
        ev.payload.label.startsWith("death_bell:")
      ) {
        el.classList.add("death-bell-pulse");
        setTimeout(() => el.classList.remove("death-bell-pulse"), 2200);
      }

      // Storm event → brief lightning white flash
      if (ev.kind === "storm" || (ev.kind === "custom" && ev.payload.label === "lightning")) {
        el.classList.add("lightning-flash");
        setTimeout(() => el.classList.remove("lightning-flash"), 180);
      }

      // Pet delight (player petted the pet) → happy chirp + achievement.
      if (
        ev.kind === "custom" &&
        typeof ev.payload.label === "string" &&
        ev.payload.label.startsWith("pet_delight:")
      ) {
        audioRef.current?.chimeFor("life");
        const petName = ev.payload.label.slice("pet_delight:".length) || "the pet";
        useGameStore.getState().unlockAchievement(
          "pet_the_pet",
          "A Very Good Steward",
          `Petted ${petName}. The kingdom's affairs waited, as they should.`,
        );
      }
    });

    // Trigger occasional lightning during active storms via the world weather state.
    const lightningInterval = window.setInterval(() => {
      if (worldRef.current?.state.weather === "storm" && Math.random() < 0.08) {
        const el = containerRef.current;
        if (!el) return;
        el.classList.add("lightning-flash");
        setTimeout(() => el.classList.remove("lightning-flash"), 160);
      }
    }, 3000);

    // Identity: hydrate from save if present.
    if (existing?.kingdomName && existing?.monarchName) {
      setIdentity({
        kingdomName: existing.kingdomName,
        monarchName: existing.monarchName,
        kingdomMotto: existing.kingdomMotto,
      });
    }
    // Monarch spec: hydrate from save (or keep default).
    const savedSpec =
      existing?.monarchSpec && typeof existing.monarchSpec === "object"
        ? (existing.monarchSpec as CharacterSpec)
        : null;
    if (savedSpec) setMonarchSpec(savedSpec);
    // Pet spec: hydrate too.
    const savedPetSpec =
      existing?.petSpec && typeof existing.petSpec === "object"
        ? (existing.petSpec as PetSpec)
        : null;
    if (savedPetSpec) setPetSpec(savedPetSpec);

    // Achievements: reload from save, then wire counters from the bus
    const achievementsMap = existing?.achievements ?? {};
    setAchievementsStore(achievementsMap);
    const achievements = new Achievements(
      world,
      world.journal,
      { ...achievementsMap },
      (id, title, description) => {
        unlockAchievement(id, title, description);
        // Audio cue, categorized by achievement id so different categories
        // get distinctive musical fingerprints.
        try {
          const category = categorizeAchievement(id);
          audioRef.current?.chimeFor(category);
        } catch {
          /* ignore — AudioEngine may not be initialized yet */
        }
      },
    );

    // Succession: when the monarch dies and an heir ascends, update identity
    // + force an immediate save so the new monarchName persists.
    const offSuccession = world.succession.subscribe((ev) => {
      const current = useGameStore.getState().identity;
      if (current) {
        setIdentity({ ...current, monarchName: ev.newName });
      }
      // Rebuild the monarch sprite — same spec but the NPC has changed.
      try {
        pixiRef.current?.factory?.setSpecCharacter(
          "monarch",
          useGameStore.getState().monarchSpec,
        );
      } catch {
        /* ignore */
      }
    });

    // Audio: programmatic sparse melody + event SFX. Unlocks on first interaction.
    const audio = new AudioEngine();
    audioRef.current = audio;
    audio.attach(world);
    audio.setVolume(audioVolume);

    // Pet picks a follow target. The monarch is preferred 40% of the time
    // (so the pet is often *your* character's companion), villagers/guards
    // fill the rest. Re-picked every ~20s for variety.
    let petTargetRecheck = 0;
    const pickPetTarget = () => {
      if (!world.pets.length) return;
      const monarch = world.npcs.find((n) => n.role === "monarch");
      if (monarch && Math.random() < 0.4) {
        world.setPetFollowing(monarch.id);
        return;
      }
      const candidates = world.npcs.filter((n) => n.role === "villager" || n.role === "guard");
      if (!candidates.length) {
        if (monarch) world.setPetFollowing(monarch.id);
        return;
      }
      const npc = candidates[Math.floor(Math.random() * candidates.length)];
      world.setPetFollowing(npc.id);
    };
    const pixi = new PixiApp({
      world,
      parent: containerRef.current,
      crtEnabled: crt,
      // Low-res (retro 16-bit) mode: read from settings at boot time.
      // Changing it requires a reload — we read once here intentionally.
      lowResMode: useGameStore.getState().settings.retro16bit,
      // Read sim speed from the live store every frame so the HUD button works
      // immediately. Returns 0 (paused) while no `identity` is set so the world
      // doesn't tick during the title screen + onboarding + character creator
      // flow — otherwise LifeEvents can marry off random NPCs and the journal
      // accumulates beats from a kingdom that hasn't been founded yet.
      speedMultiplier: () => {
        const store = useGameStore.getState();
        if (!store.identity) return 0;
        // Freeze the world while the guided tour is up so a new player
        // can read + click through without things moving or vanishing.
        if (store.tourActive) return 0;
        // Hold still while the Steward's Report is on screen — the player
        // is reading what happened; the world shouldn't move on without them.
        if (store.stewardReport) return 0;
        return store.settings.simSpeed;
      },
    });
    pixiRef.current = pixi;
    pixi.init().then(() => {
      // Apply the (possibly-restored) monarch spec to the sprite factory so
      // the in-world king/queen looks right immediately.
      try {
        const specToApply = savedSpec ?? useGameStore.getState().monarchSpec;
        pixi.factory.setSpecCharacter("monarch", specToApply);
      } catch (err) {
        console.warn("[App] failed to apply monarch spec to factory", err);
      }
      // Pet sprite from saved/default spec.
      try {
        const ps = savedPetSpec ?? useGameStore.getState().petSpec;
        pixi.factory.setSpecPet("pet_custom", ps);
        // Re-point each pet at the custom sprite key.
        for (const pet of world.pets) {
          pet.spriteKey = "pet_custom";
          pet.kind = ps.kind; // keep kind in sync (affects tail/ears in sprite)
        }
      } catch (err) {
        console.warn("[App] failed to apply pet spec to factory", err);
      }
      // If save included an identity but no monarch NPC has been spawned yet,
      // spawn one now (handles upgrade path from before this feature).
      if (existing?.monarchName && !world.npcs.some((n) => n.role === "monarch")) {
        world.spawnMonarch(existing.monarchName);
      }
    });

    // mirror events into the UI store, gated by the `narrative` toggle for
    // narrative-source events specifically; everything else passes through.
    const off = world.bus.subscribe((ev) => {
      if (ev.source === "narrative" && !useGameStore.getState().settings.integrations.narrative) {
        return;
      }
      pushEvent(ev);
    });

    // dev hook so users can drive the world from the browser/devtools console
    window.kingdomos = {
      world: () => world,
      publish: (raw: unknown) => world.publishRaw(raw),
      twitch: {
        follow: (user: string) => world.publish(mapTwitchFollow(user)),
        sub: (user: string, tier: 1 | 2 | 3 = 1) =>
          world.publish(mapTwitchSub(user, tier)),
        bits: (user: string, bits: number) =>
          world.publish(mapTwitchBits(user, bits)),
        raid: (user: string, viewers: number) =>
          world.publish(mapTwitchRaid(user, viewers)),
      },
      // Open the feedback modal from any surface (HelpOverlay,
      // future deep links, etc.) without prop-drilling a setter.
      openFeedback: () => setFeedbackOpen(true),
    };

    // periodic world stats mirror — light read; cheaper than re-rendering React on every frame
    const statsInterval = window.setInterval(() => {
      // Build name→id map for journal linkification (only named NPCs).
      const npcNames: Record<string, string> = {};
      for (const n of world.npcs) {
        if (n.name) npcNames[n.name] = n.id;
      }
      updateWorldStats({
        hour: world.state.hour,
        day: world.state.day,
        year: world.state.year,
        season: world.state.season,
        dayOfWeek: world.state.dayOfWeek,
        weather: world.state.weather,
        npcCount: world.npcs.length,
        seed: world.state.seed,
        npcNames,
        factions: world.factions.snapshot(),
        quoteOfDay: quoteOfDay(world),
        moodLabel: world.mood.label(),
        moodTier: world.mood.tier(),
        generation: world.succession.state.generation,
        // Featured advisor — the oldest living named non-monarch NPC.
        // No schema change required: just a derived view of the roster
        // that auto-promotes when the current advisor dies.
        advisor: (() => {
          const candidates = world.npcs.filter(
            (n) => n.role !== "monarch" && !!n.name,
          );
          if (candidates.length === 0) return undefined;
          // Highest age wins; ties broken by lowest id for stability
          // across renders (no jitter if two NPCs share an age).
          let best = candidates[0];
          for (const n of candidates) {
            const a = n.age ?? 0;
            const b = best.age ?? 0;
            if (a > b || (a === b && n.id < best.id)) best = n;
          }
          return {
            id: best.id,
            name: best.name!,
            role: best.role,
            trait: best.trait,
          };
        })(),
        // Current goal — pick the active aspiration with the lowest
        // progress so the player always sees something CLOSE to
        // completion as the "what do I do" answer. If all are
        // unevenly distributed, the closest-to-done feels best to
        // chase. Falls through silently if no aspirations are seeded.
        goal: (() => {
          const active = world.aspirations.active;
          if (!active || active.length === 0) return undefined;
          const defs = Aspirations.definitions();
          let pick: { title: string; description: string; progress: number } | undefined;
          let bestProgress = -Infinity;
          for (const id of active) {
            const def = defs.find((d) => d.id === id);
            if (!def) continue;
            const p = Math.min(1, Math.max(0, def.progress(world)));
            // Prefer aspirations with at least some progress; tie-break
            // by which is closest to 1.0 (more satisfying to nudge).
            if (p > bestProgress) {
              bestProgress = p;
              pick = { title: def.title, description: def.description, progress: p };
            }
          }
          return pick;
        })(),
      });
    }, 500);

    // Evaluate achievements on a low-cadence tick — these are fast checks.
    const achievementInterval = window.setInterval(() => {
      achievements.evaluate((performance.now() - sessionStart) / 1000);
    }, 2000);

    // Audio context refresh (season/time-of-day pad shifts) on slow tick.
    const audioInterval = window.setInterval(() => {
      audio.updateContext(world.state.season, world.dayNight.bandAt(world.state.time));
    }, 1000);

    // Re-pick pet target periodically so they don't trail one NPC forever.
    const petTargetInterval = window.setInterval(() => {
      petTargetRecheck++;
      if (world.pets.length > 0) pickPetTarget();
    }, 20_000);
    // Pick initial target shortly after boot so the pet has someone to follow.
    setTimeout(pickPetTarget, 1500);

    let trayCleanup: (() => void) | null = null;
    bindTrayMenu()
      .then((fn) => { trayCleanup = fn; })
      .catch(() => {});

    // Git integration: the Rust side polls watched .git dirs and emits
    // `kingdom:event` payloads that the world can consume directly.
    // We only wire this when running inside Tauri.
    let gitUnlisten: (() => void) | null = null;
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      import("@tauri-apps/api/event").then(({ listen }) => {
        listen<unknown>("kingdom:event", (ev) => {
          const integrations = useGameStore.getState().settings.integrations;
          if (!integrations.git) return;
          const result = world.publishRaw(ev.payload);
          if (!result.ok) {
            console.warn("[git integration] invalid event from Rust:", result.error);
          }
        }).then((unlisten) => {
          gitUnlisten = unlisten;
        }).catch(() => {});
      }).catch(() => {});
    }

    // Autosave every 30 seconds; also on tab-hide and window-unload.
    const sessionStart = performance.now();
    const lifetimeSeconds = () =>
      (existing?.totalLifetimeSec ?? 0) +
      (performance.now() - sessionStart) / 1000;
    const doSave = () => {
      if ((window as unknown as { __kingdomos_skip_save?: boolean }).__kingdomos_skip_save) {
        return;
      }
      try {
        const store = useGameStore.getState();
        writeSave(
          serialize(world, lifetimeSeconds(), {
            achievements: store.achievements,
            journal: store.journal,
            kingdomName: store.identity?.kingdomName,
            monarchName: store.identity?.monarchName,
            kingdomMotto: store.identity?.kingdomMotto,
            monarchSpec: store.monarchSpec,
            petSpec: store.petSpec,
            succession: {
              generation: world.succession.state.generation,
              reignStartDay: world.succession.state.reignStartDay,
            },
            artifacts: world.treasury.artifacts,
            construction: {
              active: world.construction.active,
              completed: world.map.structures
                .filter(
                  (s) =>
                    s.kind === "watchtower" ||
                    s.kind === "mill" ||
                    s.kind === "shrine" ||
                    s.kind === "astronomers_tower",
                )
                .map((s) => ({
                  id: s.id,
                  kind: s.kind as "watchtower" | "mill" | "shrine" | "astronomers_tower",
                  name: s.name,
                  pos: { x: s.pos.x, y: s.pos.y },
                  size: { x: s.size.x, y: s.size.y },
                })),
            },
          }),
        );
      } catch (err) {
        console.warn("[App] save failed", err);
      }
    };
    const saveInterval = window.setInterval(doSave, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") doSave();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", doSave);

    return () => {
      doSave(); // final save before teardown
      off();
      offSuccession();
      clearInterval(statsInterval);
      clearInterval(achievementInterval);
      clearInterval(audioInterval);
      clearInterval(petTargetInterval);
      clearInterval(saveInterval);
      clearInterval(lightningInterval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", doSave);
      trayCleanup?.();
      gitUnlisten?.();
      audio.detach();
      audioRef.current = null;
      pixi.destroy();
      worldRef.current = null;
      pixiRef.current = null;
      delete window.kingdomos;
    };
  }, []);

  // NOTE: the Tauri kingdom:event listener lives in the boot useEffect above
  // alongside the git watcher. A second listener here was a duplicate that
  // caused every external event to fire twice (publishRaw + publish).

  // ── apply settings to engine ─────────────────────────────────────────────
  useEffect(() => {
    pixiRef.current?.setCrt(crt);
  }, [crt]);

  // ── push enabled-integration list to backend ─────────────────────────────
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("set_integrations", { integrations }).catch(() => {});
    });
  }, [integrations]);

  // Live volume slider → audio engine
  useEffect(() => {
    audioRef.current?.setVolume(audioVolume);
  }, [audioVolume]);

  // Live music toggle → audio engine (the sparse melody layer)
  const musicEnabled = useGameStore((s) => s.settings.musicEnabled);
  useEffect(() => {
    audioRef.current?.setMelodyEnabled(musicEnabled);
  }, [musicEnabled]);

  // Live cutaway / dollhouse mode toggle → rendering pipeline
  const cutawayMode = useGameStore((s) => s.settings.cutawayMode);
  useEffect(() => {
    pixiRef.current?.cutawayLayer?.setEnabled(cutawayMode);
  }, [cutawayMode]);

  // Live monarch spec → SpriteFactory (re-renders the in-world sprite).
  useEffect(() => {
    const pixi = pixiRef.current;
    if (!pixi?.factory) return;
    try {
      pixi.factory.setSpecCharacter("monarch", monarchSpec);
    } catch {
      /* ignore — factory may not be ready on the very first render pass */
    }
  }, [monarchSpec]);

  // Live pet spec → SpriteFactory + sync world.pets[].kind.
  useEffect(() => {
    const pixi = pixiRef.current;
    const world = worldRef.current;
    if (!pixi?.factory) return;
    try {
      pixi.factory.setSpecPet("pet_custom", petSpec);
      if (world) {
        for (const pet of world.pets) {
          pet.spriteKey = "pet_custom";
          pet.kind = petSpec.kind;
        }
      }
    } catch {
      /* ignore */
    }
  }, [petSpec]);

  // Live banner color → castle sprite.
  useEffect(() => {
    const color = identity?.bannerColor;
    if (!color) return;
    const pixi = pixiRef.current;
    if (!pixi?.factory) return;
    try {
      pixi.factory.rebuildCastle(color);
      pixi.structureLayer.refresh("castle");
    } catch {
      /* ignore */
    }
  }, [identity?.bannerColor]);

  // Live court appointments → World.setCourt.
  // The sim systems (Quests, Weather, Economy) read world.courtEffects each
  // tick, so this effect just needs to keep them in sync when the player
  // appoints or dismisses a court member.
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    world.setCourt({
      advisorId: identity?.court?.advisor,
      captainId: identity?.court?.captain,
      scholarId: identity?.court?.scholar,
    });
  }, [identity?.court?.advisor, identity?.court?.captain, identity?.court?.scholar]);

  // Canvas mouse: click → NPC follow / structure inspect;
  //               drag → pan; wheel → zoom.
  useEffect(() => {
    const canvasParent = containerRef.current;
    if (!canvasParent) return;

    // Drag state. Pointer events instead of mouse events so this works for
    // touch + pen + middle-click. We track the last few samples of recent
    // pointer motion so we can compute a release velocity and apply
    // momentum (camera glide) after the user lifts.
    let dragging = false;
    let dragPointerId: number | null = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let camStartX = 0;
    let camStartY = 0;
    let dragMoved = false;
    interface Sample { x: number; y: number; t: number }
    let samples: Sample[] = [];
    // Inertia animation handle (set on release, cleared if user grabs again)
    let inertiaRaf: number | null = null;

    const cancelInertia = () => {
      if (inertiaRaf !== null) {
        cancelAnimationFrame(inertiaRaf);
        inertiaRaf = null;
      }
    };

    const onPointerDown = (ev: PointerEvent) => {
      const canvas = canvasParent.querySelector("canvas");
      const pixi = pixiRef.current;
      if (!canvas || !pixi?.camera) return;
      if (ev.target !== canvas) return;
      // Accept LMB (button 0), middle (1), and touch / pen (button === 0 too).
      // Right-click (2) we leave alone so the browser context menu still works.
      if (ev.button === 2) return;
      // Stop any in-flight inertia glide; the user is taking over.
      cancelInertia();
      // Stop autopilot + any active follow target so the drag isn't fought
      // by the camera trying to glide elsewhere.
      pixi.camera.stopFollowing();
      dragging = true;
      dragPointerId = ev.pointerId;
      dragMoved = false;
      dragStartX = ev.clientX;
      dragStartY = ev.clientY;
      camStartX = pixi.camera.x;
      camStartY = pixi.camera.y;
      samples = [{ x: ev.clientX, y: ev.clientY, t: performance.now() }];
      // Capture so we still get move/up events if the pointer leaves the canvas.
      try {
        (ev.target as Element).setPointerCapture(ev.pointerId);
      } catch {
        /* ignore — older browsers without pointer capture */
      }
      canvasParent.classList.add("dragging");
      ev.preventDefault();
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!dragging || ev.pointerId !== dragPointerId) return;
      const pixi = pixiRef.current;
      if (!pixi?.camera) return;
      const dx = ev.clientX - dragStartX;
      const dy = ev.clientY - dragStartY;
      if (Math.hypot(dx, dy) > 3) dragMoved = true;
      const T = 32;
      pixi.camera.setManual(
        camStartX - dx / (T * pixi.camera.zoom),
        camStartY - dy / (T * pixi.camera.zoom),
      );
      // Record sample for inertia velocity calculation. Trim to last ~100ms
      // so a long drag with a pause at the end doesn't produce phantom
      // momentum from the start of the gesture.
      const now = performance.now();
      samples.push({ x: ev.clientX, y: ev.clientY, t: now });
      while (samples.length > 0 && now - samples[0].t > 100) samples.shift();
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (!dragging || ev.pointerId !== dragPointerId) return;
      dragging = false;
      dragPointerId = null;
      canvasParent.classList.remove("dragging");
      try {
        (ev.target as Element).releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      // Apply inertia if the user was still moving at release time. Compute
      // velocity in screen-pixels-per-ms from the last 100ms of samples,
      // convert to tiles-per-frame, then decay at ~0.92x per frame so the
      // glide tapers over ~400ms (≈0.92^25 = 0.12 of starting velocity).
      const pixi = pixiRef.current;
      if (!pixi?.camera || samples.length < 2 || !dragMoved) return;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dtMs = Math.max(1, last.t - first.t);
      const vxPxPerMs = (last.x - first.x) / dtMs;
      const vyPxPerMs = (last.y - first.y) / dtMs;
      // Convert to tiles per render frame (≈16.7ms at 60fps)
      const T = 32;
      const zoom = pixi.camera.zoom;
      let vx = -(vxPxPerMs * 16.7) / (T * zoom);
      let vy = -(vyPxPerMs * 16.7) / (T * zoom);
      // Skip if the gesture ended at a near-stop
      if (Math.hypot(vx, vy) < 0.02) return;
      const step = () => {
        if (!pixi.camera) return;
        pixi.camera.setManual(
          pixi.camera.x + vx,
          pixi.camera.y + vy,
        );
        vx *= 0.92;
        vy *= 0.92;
        if (Math.hypot(vx, vy) < 0.01) {
          inertiaRaf = null;
          return;
        }
        inertiaRaf = requestAnimationFrame(step);
      };
      inertiaRaf = requestAnimationFrame(step);
    };

    const onPointerCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== dragPointerId) return;
      dragging = false;
      dragPointerId = null;
      canvasParent.classList.remove("dragging");
    };

    const onWheel = (ev: WheelEvent) => {
      const canvas = canvasParent.querySelector("canvas");
      const pixi = pixiRef.current;
      if (!canvas || !pixi?.camera) return;
      if (ev.target !== canvas) return;
      ev.preventDefault();
      const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
      pixi.camera.zoomBy(factor);
    };

    const handler = (ev: MouseEvent) => {
      const canvas = canvasParent.querySelector("canvas");
      const pixi = pixiRef.current;
      const world = worldRef.current;
      if (!canvas || !pixi?.camera || !world) return;
      if (ev.target !== canvas) return; // ignore clicks on HUD/overlays
      if (dragMoved) {
        // suppress click after a drag
        dragMoved = false;
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const T = 32;
      const tileX = (ev.clientX - rect.left - rect.width / 2) / (T * pixi.camera.zoom) + pixi.camera.x;
      const tileY = (ev.clientY - rect.top - rect.height / 2) / (T * pixi.camera.zoom) + pixi.camera.y;

      // 1) Look for a nearby NPC (within ~1.2 tile)
      let bestNpc: typeof world.npcs[number] | null = null;
      let bestDist = 1.2;
      for (const n of world.npcs) {
        const dx = n.pos.x - tileX;
        const dy = n.pos.y - tileY;
        const d = Math.hypot(dx, dy);
        if (d < bestDist) {
          bestNpc = n;
          bestDist = d;
        }
      }
      if (bestNpc) {
        const id = bestNpc.id;
        pixi.camera.followTarget(() => {
          const live = worldRef.current?.npcs.find((m) => m.id === id);
          return live ? { x: live.pos.x, y: live.pos.y } : null;
        });
        return;
      }

      // 2) Look for a structure footprint
      for (const s of world.map.structures) {
        if (
          tileX >= s.pos.x &&
          tileX <= s.pos.x + s.size.x &&
          tileY >= s.pos.y - 2 && // structures extend up above their footprint
          tileY <= s.pos.y + s.size.y
        ) {
          setInspected(s);
          return;
        }
      }

      // 3) Empty click → resume autopilot drift
      pixi.camera.enableAutopilot();
    };
    // ── Pinch-to-zoom (touch) ─────────────────────────────────────────────
    // Tracks two active touch points; when both are down we compute pinch
    // distance and map it to camera zoom, bypassing the single-finger drag.
    const activeTouches = new Map<number, { x: number; y: number }>();
    let pinchBaseDist = 0;
    let pinchBaseZoom = 1;

    const onTouchStart = (ev: TouchEvent) => {
      for (const t of Array.from(ev.changedTouches)) {
        activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (activeTouches.size === 2) {
        const [a, b] = [...activeTouches.values()];
        pinchBaseDist = Math.hypot(b.x - a.x, b.y - a.y);
        pinchBaseZoom = pixiRef.current?.camera.zoom ?? 2;
        // Suppress pointer drag while pinching.
        dragging = false;
      }
    };

    const onTouchMove = (ev: TouchEvent) => {
      for (const t of Array.from(ev.changedTouches)) {
        activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (activeTouches.size === 2) {
        ev.preventDefault();
        const [a, b] = [...activeTouches.values()];
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const factor = dist / Math.max(1, pinchBaseDist);
        const cam = pixiRef.current?.camera;
        if (cam) {
          cam.zoom = Math.max(cam.minZoom, Math.min(cam.maxZoom, pinchBaseZoom * factor));
        }
      }
    };

    const onTouchEnd = (ev: TouchEvent) => {
      for (const t of Array.from(ev.changedTouches)) {
        activeTouches.delete(t.identifier);
      }
    };

    canvasParent.addEventListener("touchstart", onTouchStart, { passive: false });
    canvasParent.addEventListener("touchmove", onTouchMove, { passive: false });
    canvasParent.addEventListener("touchend", onTouchEnd);
    canvasParent.addEventListener("touchcancel", onTouchEnd);

    canvasParent.addEventListener("click", handler);
    canvasParent.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    canvasParent.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelInertia();
      canvasParent.removeEventListener("touchstart", onTouchStart);
      canvasParent.removeEventListener("touchmove", onTouchMove);
      canvasParent.removeEventListener("touchend", onTouchEnd);
      canvasParent.removeEventListener("touchcancel", onTouchEnd);
      canvasParent.removeEventListener("click", handler);
      canvasParent.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      canvasParent.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Keyboard camera controls: arrows / WASD pan, space follows a random NPC,
  // F refocuses on the castle, R re-enables autopilot drift.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Skip when typing in an input/textarea/contenteditable
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      const pixi = pixiRef.current;
      const world = worldRef.current;
      if (!pixi?.camera || !world) return;
      const step = e.shiftKey ? 6 : 2;
      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          pixi.camera.pan(-step, 0);
          e.preventDefault();
          break;
        case "ArrowRight":
        case "d":
        case "D":
          pixi.camera.pan(step, 0);
          e.preventDefault();
          break;
        case "ArrowUp":
        case "w":
        case "W":
          pixi.camera.pan(0, -step);
          e.preventDefault();
          break;
        case "ArrowDown":
        case "s":
        case "S":
          pixi.camera.pan(0, step);
          e.preventDefault();
          break;
        case " ": {
          // Space: follow a random NPC
          if (world.npcs.length) {
            const npc = world.npcs[Math.floor(Math.random() * world.npcs.length)];
            pixi.camera.snapTo(npc.pos.x, npc.pos.y);
          }
          e.preventDefault();
          break;
        }
        case "f":
        case "F": {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          if (castle) {
            pixi.camera.snapTo(
              castle.pos.x + castle.size.x / 2,
              castle.pos.y + castle.size.y / 2,
            );
          }
          break;
        }
        case "r":
        case "R":
          pixi.camera.enableAutopilot();
          break;
        case "x":
        case "X": {
          // Toggle cutaway / dollhouse mode — see roofs fade and NPCs
          // relocate to their stations inside their associated building.
          const store = useGameStore.getState();
          store.setCutawayMode(!store.settings.cutawayMode);
          e.preventDefault();
          break;
        }
        case "F12": {
          // Screenshot: capture the Pixi canvas and download it as a PNG.
          // Temporarily disables the HUD, waits one frame for render, then
          // restores it. This gives a clean world-only capture.
          e.preventDefault();
          const canvas = containerRef.current?.querySelector("canvas");
          if (!canvas) break;
          try {
            const dataUrl = canvas.toDataURL("image/png");
            const a = document.createElement("a");
            const identity = useGameStore.getState().identity;
            const safeName = (identity?.kingdomName ?? "kingdom").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 20);
            const ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
            a.href = dataUrl;
            a.download = `${safeName}-${ts}.png`;
            a.click();
          } catch {
            console.warn("[Screenshot] canvas capture failed (cross-origin?)");
          }
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The HUD is the always-on top bar (kingdom name + day + buttons). It
  // should NOT show during the title screen, the onboarding modal, or
  // the founding character creator — those are pre-kingdom moments and
  // having the HUD bleed through ruins the "I'm about to design my
  // kingdom" focus. Found in browser playtest: at the title screen the
  // player could see the previous kingdom's quote-of-day + mood meter.
  const preKingdomFlow = titleOpen || !identity || creatorOpen;

  // ── Ambient mode (Document Picture-in-Picture) ────────────────────────────
  // Pops the kingdom canvas into a small always-on-top window so the world
  // lives beside the player's work. The PiP window drives the render loop
  // with its own rAF — the main tab's rAF throttles to zero once hidden,
  // which would otherwise freeze the floating kingdom. Watch-only: HUD and
  // decisions stay in the main window.
  const ambientSupported =
    typeof window !== "undefined" && "documentPictureInPicture" in window;

  async function toggleAmbientMode() {
    if (ambientActive) {
      ambientCleanupRef.current?.();
      return;
    }
    const host = containerRef.current;
    const pixi = pixiRef.current;
    const dpp = (window as unknown as {
      documentPictureInPicture?: {
        requestWindow(opts?: { width?: number; height?: number }): Promise<Window>;
      };
    }).documentPictureInPicture;
    if (!host || !pixi || !dpp) return;
    try {
      const pipWin = await dpp.requestWindow({ width: 480, height: 300 });
      const parent = host.parentElement;
      const next = host.nextSibling;
      pipWin.document.title = "KingdomOS — ambient";
      pipWin.document.body.style.margin = "0";
      pipWin.document.body.style.background = "#0d0d2b";
      pipWin.document.body.style.overflow = "hidden";
      // The .pixi-host class doesn't exist in the PiP document — size inline.
      host.style.width = "100vw";
      host.style.height = "100vh";
      pipWin.document.body.append(host);
      // Hand the render loop to the PiP window's rAF.
      pixi.app.ticker.stop();
      let rafId = 0;
      const loop = (t: number) => {
        pixi.app.ticker.update(t);
        rafId = pipWin.requestAnimationFrame(loop);
      };
      rafId = pipWin.requestAnimationFrame(loop);
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        pipWin.cancelAnimationFrame(rafId);
        pixi.app.ticker.start();
        host.style.width = "";
        host.style.height = "";
        if (parent) {
          if (next) parent.insertBefore(host, next);
          else parent.appendChild(host);
        }
        setAmbientActive(false);
        ambientCleanupRef.current = null;
        try {
          pipWin.close();
        } catch {
          /* already closing */
        }
      };
      pipWin.addEventListener("pagehide", cleanup, { once: true });
      ambientCleanupRef.current = cleanup;
      setAmbientActive(true);
    } catch (err) {
      console.warn("[Ambient] picture-in-picture failed", err);
    }
  }

  return (
    <div className="app-root">
      {!streamerMode && !preKingdomFlow && (
        <HUD
          onToggleLog={() => {
            // Functional updater so rapid double-clicks within one render
            // commit can't both compute next=true from the same stale
            // `logOpen` closure. The shim accepts (prev)=>next.
            setLogOpen((b) => {
              const next = !b;
              if (next) useGameStore.getState().markSeenEvents();
              return next;
            });
          }}
          onToggleSettings={() => setSettingsOpen((b) => !b)}
          onToggleJournal={() => {
            setJournalOpen((b) => {
              const next = !b;
              if (next) useGameStore.getState().markSeenJournal();
              return next;
            });
          }}
          onToggleStats={() => setStatsOpen((b) => !b)}
          onToggleFamilyTree={() => setFamilyTreeOpen((b) => !b)}
          onToggleDiplomacy={() => setDiplomacyOpen((b) => !b)}
          onToggleCutaway={() => {
            const store = useGameStore.getState();
            store.setCutawayMode(!store.settings.cutawayMode);
          }}
          onTakePhoto={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }))}
          onToggleAmbient={ambientSupported ? toggleAmbientMode : undefined}
          ambientActive={ambientActive}
          onToggleChronicle={() => setChronicleOpen((b) => !b)}
          onSelectAdvisor={(npcId) => setProfileNpcId(npcId)}
          onOpenRule={() => setRoyalOpen((b) => !b)}
          cutawayActive={cutawayMode}
        />
      )}
      <div ref={containerRef} className="pixi-host" />
      {/* While the canvas floats in the PiP window, the main tab shows a
          calm placeholder with the way home. */}
      {ambientActive && (
        <div className="ambient-placeholder">
          <div className="ambient-placeholder-icon" aria-hidden="true">🪟</div>
          <p>The kingdom floats above your work.</p>
          <button type="button" className="primary" onClick={() => ambientCleanupRef.current?.()}>
            Bring it home
          </button>
        </div>
      )}
      {/* In streamer mode every panel is force-closed so the OBS source stays clean */}
      <EventLog
        open={logOpen && !streamerMode}
        onClose={() => setLogOpen(false)}
        onLocate={(structureId) => {
          const w = worldRef.current;
          const cam = pixiRef.current?.camera;
          if (!w || !cam) return;
          // Try structure list first, then landmarks map (covers towns etc.)
          const s = w.map.structures.find((x) => x.id === structureId);
          if (s) {
            cam.snapTo(s.pos.x + s.size.x / 2, s.pos.y + s.size.y / 2);
          } else {
            const lm = w.map.landmarks.get(structureId);
            if (lm) cam.snapTo(lm.x, lm.y);
          }
        }}
      />
      <SettingsPanel
        open={settingsOpen && !streamerMode}
        onClose={() => setSettingsOpen(false)}
        onOpenCreator={() => {
          setSettingsOpen(false);
          setCreatorOpen(true);
        }}
        onOpenPetCreator={() => {
          setSettingsOpen(false);
          setPetCreatorOpen(true);
        }}
        onOpenKingdomCard={() => {
          setSettingsOpen(false);
          setKingdomCardOpen(true);
        }}
        onOpenChronicle={() => {
          setSettingsOpen(false);
          setChronicleOpen(true);
        }}
        onOpenVault={() => {
          setSettingsOpen(false);
          setVaultOpen(true);
        }}
        onOpenFeedback={() => {
          setSettingsOpen(false);
          setFeedbackOpen(true);
        }}
      />
      <FeedbackPanel
        open={feedbackOpen && !streamerMode}
        onClose={() => setFeedbackOpen(false)}
        getWorld={() => worldRef.current}
      />
      <RoyalActions
        open={royalOpen && !streamerMode}
        onClose={() => setRoyalOpen(false)}
        getWorld={() => worldRef.current}
      />
      {/* Opportunistic feedback prompts at 10-min session mark + first
          year-1 rollover. Hidden in streamer mode and pre-kingdom. */}
      {!preKingdomFlow && !streamerMode && (
        <FeedbackMoments getOpenFeedback={() => setFeedbackOpen(true)} />
      )}
      {/* Milestone share nudges — Kingdom Card prompts at proud moments. */}
      {!preKingdomFlow && !streamerMode && (
        <ShareMoments onOpenKingdomCard={() => setKingdomCardOpen(true)} />
      )}
      <KingdomCard
        world={worldRef.current}
        open={kingdomCardOpen && !streamerMode}
        onClose={() => setKingdomCardOpen(false)}
      />
      <KingdomChronicle
        open={chronicleOpen && !streamerMode}
        onClose={() => setChronicleOpen(false)}
        getWorld={() => worldRef.current}
      />
      <VaultPanel
        open={vaultOpen && !streamerMode}
        onClose={() => setVaultOpen(false)}
        getWorld={() => worldRef.current}
      />
      <JournalPanel
        open={journalOpen && !streamerMode}
        onClose={() => setJournalOpen(false)}
        onNavigateToStructure={(structureId) => {
          // Resolve the structure on the live map and snap the camera to its
          // center. Falls back to a noop if the structure was renamed/removed
          // (e.g. an old save referencing something that no longer exists).
          const w = worldRef.current;
          const cam = pixiRef.current?.camera;
          if (!w || !cam) return;
          const s = w.map.structures.find((x) => x.id === structureId);
          if (!s) return;
          cam.snapTo(
            s.pos.x + s.size.x / 2,
            s.pos.y + s.size.y / 2,
          );
        }}
        onSelectNpc={(npcId) => setProfileNpcId(npcId)}
      />
      {inspected && worldRef.current && !streamerMode && (
        <StructureInspector
          structure={inspected}
          world={worldRef.current}
          onClose={() => setInspected(null)}
        />
      )}
      <StatsDashboard
        world={worldRef.current}
        open={statsOpen && !streamerMode}
        onClose={() => setStatsOpen(false)}
      />
      <HelpOverlay />
      {!streamerMode && !preKingdomFlow && (
        <MiniMap
          getWorld={() => worldRef.current}
          getCamera={() => {
            const pixi = pixiRef.current;
            const c = pixi?.camera;
            if (!c || !pixi) return null;
            // Use actual renderer dimensions so the viewport box is accurate
            // at every zoom level and in both retro and high-res modes.
            const T = 32;
            const rw = pixi.app.renderer.width;
            const rh = pixi.app.renderer.height;
            return {
              x: c.x, y: c.y, zoom: c.zoom,
              viewW: rw / (T * c.zoom),
              viewH: rh / (T * c.zoom),
            };
          }}
          onJumpTo={(x, y) => pixiRef.current?.camera?.snapTo(x, y)}
        />
      )}
      {!streamerMode && !preKingdomFlow && <DecisionPrompt getWorld={() => worldRef.current} />}
      {/* Steward's Report — "while you were away" outcome card. Hidden during
          pre-kingdom flow (the title screen sits above it anyway at z-300,
          but no point mounting it under there). */}
      {!streamerMode && !preKingdomFlow && <StewardReport />}
      {!streamerMode && !preKingdomFlow && <CaughtUp />}
      {!streamerMode && !preKingdomFlow && <SpeedControl />}
      <PerformanceHUD getWorld={() => worldRef.current} />
      {!streamerMode && <TutorialHints />}
      {/* Post-tour contextual teaching — one small hint at a time, minutes
          apart, only when the screen is calm. */}
      {!streamerMode && !preKingdomFlow && <DripHints getWorld={() => worldRef.current} />}
      <StreamerOverlay />
      <AchievementToast onOpenJournal={() => setJournalOpen(true)} />
      <FamilyTreePanel
        open={familyTreeOpen && !streamerMode}
        onClose={() => setFamilyTreeOpen(false)}
        getWorld={() => worldRef.current}
        onSelectNpc={(id) => setProfileNpcId(id)}
      />
      <DiplomacyPanel
        open={diplomacyOpen && !streamerMode}
        onClose={() => setDiplomacyOpen(false)}
        getWorld={() => worldRef.current}
      />
      {!streamerMode && (
        <NpcInspect
          getCanvas={() => containerRef.current?.querySelector("canvas") ?? null}
          getCamera={() => {
            const c = pixiRef.current?.camera;
            if (!c) return null;
            return { x: c.x, y: c.y, zoom: c.zoom };
          }}
          getWorld={() => worldRef.current}
          onClickNpc={(id) => setProfileNpcId(id)}
        />
      )}
      <NPCProfilePanel
        npcId={profileNpcId}
        getWorld={() => worldRef.current}
        onClose={() => setProfileNpcId(null)}
        onSelectNpc={(id) => setProfileNpcId(id)}
        onNavigateToNpc={(npc) => {
          setProfileNpcId(null);
          pixiRef.current?.camera.snapTo(npc.pos.x, npc.pos.y);
        }}
      />
      {introOpen && (
        <IntroCarousel onDone={() => setIntroOpen(false)} />
      )}
      {titleOpen && !introOpen && (
        <TitleScreen
          hasSave={hasSaveRef.current}
          onContinue={() => setTitleOpen(false)}
          onNew={() => {
            // Two paths:
            //   1. There's an existing save → user is abandoning a kingdom.
            //      Run resetKingdom which archives + wipes + reloads.
            //   2. No save yet → user is starting their first kingdom.
            //      Just close the title; OnboardingModal renders next tick
            //      (gated on !titleOpen && !identity). Calling resetKingdom
            //      here would `location.reload()` and trap the user in a
            //      title-screen loop because the post-reload state has no
            //      save *either*, so they'd see the same title again.
            if (hasSaveRef.current) {
              useGameStore.getState().resetKingdom();
            } else {
              setTitleOpen(false);
            }
          }}
          onSettings={() => {
            setTitleOpen(false);
            setSettingsOpen(true);
          }}
          onQuit={async () => {
            try {
              if ("__TAURI_INTERNALS__" in window) {
                const { invoke } = await import("@tauri-apps/api/core");
                await invoke("quit_app");
              } else {
                // Browser-only: close the tab if user allows.
                window.close();
              }
            } catch {
              /* ignore */
            }
          }}
        />
      )}
      {!titleOpen && !identity && !creatorOpen && (
        <OnboardingModal
          initial={onboardingDraft ?? undefined}
          onComplete={(result) => {
            // Stash the form result and open the character creator. The
            // creator's commit handler does the rest (founding journal,
            // monarch spawn, pet adopt, initial save). We ALSO keep a
            // copy in `onboardingDraft` so "← Back" from the creator
            // returns the player to their typed names, not random ones.
            pendingIdentityRef.current = result;
            setOnboardingDraft(result);
            setCreatorOpen(true);
          }}
        />
      )}
      {petCreatorOpen && (
        <PetCreator
          initialSpec={petSpec}
          title="Style your companion"
          ctaLabel="Save"
          onCancel={() => setPetCreatorOpen(false)}
          onCommit={(spec) => {
            setPetSpec(spec);
            // Apply live + propagate to world pets.
            try {
              pixiRef.current?.factory?.setSpecPet("pet_custom", spec);
              const w = worldRef.current;
              if (w) {
                for (const pet of w.pets) {
                  pet.spriteKey = "pet_custom";
                  pet.kind = spec.kind;
                }
              }
            } catch {
              /* ignore */
            }
            setPetCreatorOpen(false);
          }}
        />
      )}
      {creatorOpen && (
        <CharacterCreator
          initialSpec={monarchSpec}
          title={
            pendingIdentityRef.current
              ? `Step 2 of 2 — Design ${pendingIdentityRef.current.monarchName}`
              : "Customize your monarch"
          }
          ctaLabel={pendingIdentityRef.current ? "Found the kingdom" : "Save"}
          cancelLabel={pendingIdentityRef.current ? "← Back to names" : "Cancel"}
          onCancel={() => {
            // First-launch flow: close creator and clear pendingIdentity
            // so the OnboardingModal re-mounts. The modal re-reads
            // `onboardingDraft` for its initial values, so the names the
            // player just typed (and any pet kind choice) come right back
            // — no silent reroll.
            if (pendingIdentityRef.current) {
              pendingIdentityRef.current = null;
            }
            setCreatorOpen(false);
          }}
          onCommit={(spec) => {
            setMonarchSpec(spec);
            // Apply immediately to the in-world sprite if Pixi is ready.
            try {
              pixiRef.current?.factory?.setSpecCharacter("monarch", spec);
            } catch {
              /* ignore */
            }
            const pending = pendingIdentityRef.current;
            if (pending) {
              // First-launch path: complete the founding now.
              const id = {
                kingdomName: pending.kingdomName,
                monarchName: pending.monarchName,
              };
              setIdentity(id);
              const w = worldRef.current;
              if (w) {
                w.spawnMonarch(pending.monarchName);
                // Founding chronicle — three lines that anchor the journal so
                // the very first thing the player scrolls to feels like the
                // start of a story rather than a flat log line. All three
                // entries pin to the castle so clicking the pin in the
                // journal snaps the camera there.
                const castle = w.map.structures.find((s) => s.kind === "castle");
                const castleId = castle?.id;
                w.journal.write(
                  `The kingdom of ${id.kingdomName} was founded under the rule of ${id.monarchName}.`,
                  "milestone",
                  castleId,
                );
                w.journal.write(
                  `On this day the banner was raised over the keep, and the first villagers gathered to swear allegiance.`,
                  "system",
                  castleId,
                );
                w.journal.write(
                  `${pending.petName} the ${pending.petKind} sat at the foot of the throne and refused to leave.`,
                  "life",
                  castleId,
                );
                // silent: true — the founding chronicle just wrote a richer
                // line ("Mochi sat at the foot of the throne and refused to
                // leave"). Don't double-up with adoptPet's flat fallback.
                w.adoptPet(pending.petName, pending.petKind, { silent: true });
                // Pet starts by following the monarch — meaningful for the
                // "this is MY character" moment.
                w.setPetFollowing("npc_monarch");
                // Fire the FoundingDay sequence — fireworks over the
                // castle, a courier delivering the seal of office, an
                // anchoring journal flourish, AND a Welcome Petition
                // scheduled for day +2 so the player sees their first
                // real choice within the first couple of in-world
                // minutes. The whole point: a 99¢ buyer who founds a
                // kingdom and sees nothing happen for two minutes
                // refunds. This makes sure something happens.
                w.foundingDay.fire();
                // Snap the camera onto the castle so the founding
                // fireworks land in the center of the screen, not
                // somewhere offscreen the autopilot happened to be
                // pointing. Playtest signal was "nothing happens" —
                // the fireworks DID happen, just off-camera.
                try {
                  const castle = w.map.structures.find((s) => s.kind === "castle");
                  const cam = pixiRef.current?.camera;
                  if (castle && cam) {
                    cam.snapTo(
                      castle.pos.x + castle.size.x / 2,
                      castle.pos.y + castle.size.y / 2,
                    );
                  }
                } catch {
                  /* ignore — camera will autopilot to castle anyway */
                }
              }
              // Immediate save.
              try {
                const store = useGameStore.getState();
                if (worldRef.current) {
                  writeSave(
                    serialize(worldRef.current, 0, {
                      achievements: store.achievements,
                      journal: store.journal,
                      kingdomName: id.kingdomName,
                      monarchName: id.monarchName,
                      // Motto is set later via Settings, not at founding —
                      // pull from the store at autosave time instead.
                      monarchSpec: spec,
                    }),
                  );
                }
              } catch {
                /* ignore */
              }
              pendingIdentityRef.current = null;
              // Founding committed — discard the saved draft so a later
              // succession or "new kingdom" path starts clean.
              setOnboardingDraft(null);
            }
            setCreatorOpen(false);
          }}
        />
      )}
      <PhotoMode
        getCanvas={() => containerRef.current?.querySelector("canvas") ?? null}
        getCaption={() => {
          const w = worldRef.current;
          if (!w) return "KingdomOS";
          const day = Math.floor(w.state.time / (24 * 60)) + 1;
          return `Day ${day} · ${w.state.weather} · Hour ${w.state.hour.toFixed(0)}`;
        }}
      />
      {/* Tauri-only; no-ops on the web demo. Hides itself if no
          updater endpoint is configured. */}
      <UpdateToast />
      <TabTitle />
      {!streamerMode && !preKingdomFlow && <InstallPrompt />}
      {/* FF6-style menu blip/confirm on button hover + click. Reads
          live volume from the store, so muting in Settings disables
          UI sound too. */}
      <UiSound getAudio={() => audioRef.current} />
      {/* Bottom-left floating recorder. Captures live Pixi canvas
          via MediaRecorder → downloads .webm. Used for itch.io / social
          launch material; hidden in streamer mode + pre-kingdom flow. */}
      {!preKingdomFlow && (
        <VideoCapture getCanvas={() => containerRef.current?.querySelector("canvas") ?? null} />
      )}
      {/* One-time orientation toast 5s after founding. Self-dismisses
          and persists "seen" per kingdom in localStorage so a returning
          player doesn't see it again. Only meaningful pre-streamer-mode. */}
      {!preKingdomFlow && !streamerMode && (
        <FoundingMoment
          onOpenJournal={() => {
            setJournalOpen((b) => {
              if (!b) useGameStore.getState().markSeenJournal();
              return true;
            });
          }}
        />
      )}
    </div>
  );
}
