import { useEffect, useRef, useState } from "react";
import { World } from "./sim/World";
import { PixiApp } from "./engine/PixiApp";
import { useGameStore } from "./store/useGameStore";
import { HUD } from "./ui/HUD";
import { EventLog } from "./ui/EventLog";
import { SettingsPanel } from "./ui/SettingsPanel";
import { PhotoMode } from "./ui/PhotoMode";
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
import {
  mapTwitchFollow,
  mapTwitchSub,
  mapTwitchBits,
  mapTwitchRaid,
} from "./sim/events/EventMapper";
import type { Structure } from "./sim/types";
import { OnboardingModal } from "./ui/OnboardingModal";
import { TitleScreen } from "./ui/TitleScreen";
import { CharacterCreator } from "./ui/CharacterCreator";
import { PetCreator } from "./ui/PetCreator";
import { DEFAULT_SPEC, type CharacterSpec } from "./engine/CharacterSpec";
import type { PetSpec } from "./engine/PetSpec";
import { bindTrayMenu } from "./ui/TrayMenuBindings";
import { Achievements } from "./sim/systems/Achievements";
import { AudioEngine } from "./engine/Audio";
import type { ExternalEvent } from "./sim/events/EventSchema";
import { ExternalEvent as Schema } from "./sim/events/EventSchema";
import { readSave, writeSave, applySave, serialize } from "./sim/Persistence";

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

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World | null>(null);
  const pixiRef = useRef<PixiApp | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [petCreatorOpen, setPetCreatorOpen] = useState(false);
  const [inspected, setInspected] = useState<Structure | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  // Show the title screen on first paint. Dismissed by Continue / New / etc.
  const [titleOpen, setTitleOpen] = useState(true);
  // Detect "has a saved kingdom" once on mount.
  const hasSaveRef = useRef<boolean>(!!readSave());
  /** Pending identity choices from onboarding, applied once the creator commits. */
  const pendingIdentityRef = useRef<{
    kingdomName: string;
    monarchName: string;
    petName: string;
    petKind: "dog" | "cat";
  } | null>(null);
  const crt = useGameStore((s) => s.settings.crt);
  const integrations = useGameStore((s) => s.settings.integrations);
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

  // ── boot world + pixi ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    // Reuse the saved seed if a kingdom already exists — same map, same NPC
    // identities, persistent across launches.
    const existing = readSave();
    const world = new World(
      existing
        ? { seed: existing.seed, foundedAtMs: existing.foundedAtMs, followRealSeasons }
        : { followRealSeasons },
    );
    if (existing) {
      try {
        applySave(world, existing);
      } catch (err) {
        console.warn("[App] applySave failed; starting fresh", err);
      }
    }
    worldRef.current = world;

    // Wire journal entries from the sim into the Zustand store. Hydrate first
    // from save so the panel shows history before any new entries arrive.
    if (existing?.journal) {
      setJournal(existing.journal);
    } else {
      setJournal([]);
    }
    world.onJournal = (entry) => pushJournalEntry(entry);

    // Identity: hydrate from save if present.
    if (existing?.kingdomName && existing?.monarchName) {
      setIdentity({
        kingdomName: existing.kingdomName,
        monarchName: existing.monarchName,
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

    // Audio: programmatic ambient pad + event SFX. Unlocks on first interaction.
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
      // Read sim speed from the live store every frame so the HUD button works
      // immediately. Returns 0 (paused) while no `identity` is set so the world
      // doesn't tick during the title screen + onboarding + character creator
      // flow — otherwise LifeEvents can marry off random NPCs and the journal
      // accumulates beats from a kingdom that hasn't been founded yet.
      speedMultiplier: () => {
        const store = useGameStore.getState();
        if (!store.identity) return 0;
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
    };

    // periodic world stats mirror — light read; cheaper than re-rendering React on every frame
    const statsInterval = window.setInterval(() => {
      updateWorldStats({
        hour: world.state.hour,
        day: world.state.day,
        year: world.state.year,
        season: world.state.season,
        dayOfWeek: world.state.dayOfWeek,
        weather: world.state.weather,
        npcCount: world.npcs.length,
        seed: world.state.seed,
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
      .then((fn) => {
        trayCleanup = fn;
      })
      .catch(() => {});

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
                    s.kind === "watchtower" || s.kind === "mill" || s.kind === "shrine",
                )
                .map((s) => ({
                  id: s.id,
                  kind: s.kind as "watchtower" | "mill" | "shrine",
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
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", doSave);
      trayCleanup?.();
      audio.detach();
      audioRef.current = null;
      pixi.destroy();
      worldRef.current = null;
      pixiRef.current = null;
      delete window.kingdomos;
    };
  }, []);

  // ── Tauri ↔ frontend event bridge ────────────────────────────────────────
  useEffect(() => {
    if (!worldRef.current) return;
    if (!("__TAURI_INTERNALS__" in window)) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const off = await listen<ExternalEvent>("kingdom:event", (e) => {
        const result = Schema.safeParse(e.payload);
        if (!result.success || !worldRef.current) return;
        worldRef.current.publish(result.data);
      });
      if (cancelled) off();
      else unlisten = off;
    })().catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

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

  // Live music toggle → audio engine
  const musicEnabled = useGameStore((s) => s.settings.musicEnabled);
  useEffect(() => {
    audioRef.current?.setMelodyEnabled(musicEnabled);
  }, [musicEnabled]);

  // Live ambient drone-pad toggle → audio engine
  const padEnabled = useGameStore((s) => s.settings.padEnabled);
  useEffect(() => {
    audioRef.current?.setPadEnabled(padEnabled);
  }, [padEnabled]);

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

    // Drag state
    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let camStartX = 0;
    let camStartY = 0;
    let dragMoved = false; // tracks whether mouse moved meaningfully during press

    const onMouseDown = (ev: MouseEvent) => {
      const canvas = canvasParent.querySelector("canvas");
      const pixi = pixiRef.current;
      if (!canvas || !pixi?.camera) return;
      if (ev.target !== canvas) return;
      if (ev.button !== 0) return; // only LMB
      dragging = true;
      dragMoved = false;
      dragStartX = ev.clientX;
      dragStartY = ev.clientY;
      camStartX = pixi.camera.x;
      camStartY = pixi.camera.y;
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging) return;
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
    };

    const onMouseUp = () => {
      dragging = false;
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
    canvasParent.addEventListener("click", handler);
    canvasParent.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    canvasParent.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvasParent.removeEventListener("click", handler);
      canvasParent.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app-root">
      {!streamerMode && (
        <HUD
          onToggleLog={() => {
            const next = !logOpen;
            setLogOpen(next);
            if (next) useGameStore.getState().markSeenEvents();
          }}
          onToggleSettings={() => setSettingsOpen((b) => !b)}
          onToggleJournal={() => {
            const next = !journalOpen;
            setJournalOpen(next);
            if (next) useGameStore.getState().markSeenJournal();
          }}
          onToggleStats={() => setStatsOpen((b) => !b)}
        />
      )}
      <div ref={containerRef} className="pixi-host" />
      {/* In streamer mode every panel is force-closed so the OBS source stays clean */}
      <EventLog open={logOpen && !streamerMode} onClose={() => setLogOpen(false)} />
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
      />
      <JournalPanel
        open={journalOpen && !streamerMode}
        onClose={() => setJournalOpen(false)}
        eventLogOpen={logOpen && !streamerMode}
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
      {!streamerMode && (
        <MiniMap
          getWorld={() => worldRef.current}
          getCamera={() => {
            const c = pixiRef.current?.camera;
            return c ? { x: c.x, y: c.y, zoom: c.zoom } : null;
          }}
          onJumpTo={(x, y) => pixiRef.current?.camera?.snapTo(x, y)}
        />
      )}
      {!streamerMode && <DecisionPrompt getWorld={() => worldRef.current} />}
      {!streamerMode && <SpeedControl />}
      <PerformanceHUD getWorld={() => worldRef.current} />
      {!streamerMode && <TutorialHints />}
      <StreamerOverlay />
      <AchievementToast />
      {!streamerMode && (
        <NpcInspect
          getCanvas={() => containerRef.current?.querySelector("canvas") ?? null}
          getCamera={() => {
            const c = pixiRef.current?.camera;
            if (!c) return null;
            return { x: c.x, y: c.y, zoom: c.zoom };
          }}
          getWorld={() => worldRef.current}
        />
      )}
      {titleOpen && (
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
          onComplete={(result) => {
            // Stash the form result and open the character creator. The
            // creator's commit handler does the rest (founding journal,
            // monarch spawn, pet adopt, initial save).
            pendingIdentityRef.current = result;
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
              ? `Design ${pendingIdentityRef.current.monarchName}`
              : "Customize your monarch"
          }
          ctaLabel={pendingIdentityRef.current ? "Found the kingdom" : "Save"}
          cancelLabel={pendingIdentityRef.current ? "← Back" : "Cancel"}
          onCancel={() => {
            // In first-launch flow: close creator, keep pendingIdentity so the
            // OnboardingModal re-opens with the player's previous form values
            // visible (OnboardingModal manages its own state, but at least the
            // structural flow is reversible). Outside first launch: just close.
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
                      monarchSpec: spec,
                    }),
                  );
                }
              } catch {
                /* ignore */
              }
              pendingIdentityRef.current = null;
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
    </div>
  );
}
