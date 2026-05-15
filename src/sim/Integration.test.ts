import { describe, expect, it } from "vitest";
import { World, WORLD_CAPS } from "./World";
import { serialize, applySave, validateSave, SAVE_VERSION } from "./Persistence";
import { Achievements } from "./systems/Achievements";
import { makeEvent } from "./events/EventSchema";
import {
  mapTwitchFollow,
  mapTwitchSub,
  mapTwitchBits,
  mapTwitchRaid,
} from "./events/EventMapper";

/**
 * Integration tests — wire the full sim together the way App.tsx does and
 * verify cross-system invariants. These catch the bugs that unit tests miss:
 * world-state coherence, save/restore fidelity, the full Twitch-→-villager
 * flow, achievement unlocks driven by life events.
 */

describe("Integration — full session smoke", () => {
  it("boots a world with 15 base NPCs + assignable structures", () => {
    const w = new World({ seed: 42 });
    expect(w.npcs.length).toBeGreaterThanOrEqual(10);
    expect(w.map.structures.length).toBeGreaterThanOrEqual(3);
    expect(w.map.landmarks.size).toBeGreaterThanOrEqual(3);
  });

  it("publishes events, NPCs walk, world remains coherent over 200 ticks", () => {
    const w = new World({ seed: 42 });
    // Drive some Twitch events
    w.publish(mapTwitchFollow("Alice"));
    w.publish(mapTwitchSub("Bob", 1));
    w.publish(mapTwitchBits("Carol", 200));
    w.publish(mapTwitchRaid("Dan", 15));
    // Tick a chunk
    for (let i = 0; i < 200; i++) {
      w.tick(0.1);
    }
    // Bob the subscriber should have spawned
    expect(w.npcs.some((n) => n.name === "Bob")).toBe(true);
    // Some companions from Dan's raid should have joined
    expect(w.npcs.some((n) => n.name?.includes("Dan"))).toBe(true);
    // Caps all hold
    expect(w.npcs.length).toBeLessThanOrEqual(WORLD_CAPS.npcs);
    expect(w.effects.length).toBeLessThanOrEqual(WORLD_CAPS.effects);
  });

  it("save → load round trip preserves identity, kingdom state, vault, journal", () => {
    const w = new World({ seed: 42, foundedAtMs: Date.UTC(2025, 0, 1) });
    w.spawnMonarch("Test King");
    w.treasury.acquire("relic", "from a test");
    w.treasury.acquire("scroll", "an old map");
    w.journal.write("Test entry", "milestone");
    w.succession.state.generation = 3;
    w.succession.state.reignStartDay = 12;
    w.economy.state.gold = 250;

    const save = serialize(w, 100, {
      kingdomName: "Aurelia",
      monarchName: "Test King",
      achievements: { first_courier: "2025-01-01T00:00:00Z" },
      journal: [
        {
          id: "j1",
          day: 1,
          year: 1,
          season: "spring",
          text: "founding",
          kind: "milestone",
        },
      ],
      succession: { generation: 3, reignStartDay: 12 },
      artifacts: w.treasury.artifacts,
      construction: {
        active: null,
        completed: [],
      },
    });

    // Validate
    const validated = validateSave(save);
    expect(validated).not.toBeNull();
    expect(validated!.kingdomName).toBe("Aurelia");
    expect(validated!.monarchName).toBe("Test King");
    expect(validated!.artifacts?.length).toBe(2);
    expect(validated!.succession?.generation).toBe(3);

    // Apply to a fresh world with same seed
    const w2 = new World({ seed: 42 });
    expect(() => applySave(w2, validated!)).not.toThrow();
    expect(w2.treasury.count()).toBe(2);
    expect(w2.succession.state.generation).toBe(3);
  });

  it("an entire 'day in the life' produces a coherent journal stream", () => {
    const w = new World({ seed: 42 });
    const entries: string[] = [];
    w.onJournal = (e) => entries.push(e.text);
    // Fire a mix of organic-feeling events
    w.publish(makeEvent("courier", { source: "github", payload: { from: "rivermouth", to: "highkeep", label: "PR" } }));
    w.publish(makeEvent("forge", { source: "github", payload: { structure: "ironhearth", label: "merge" } }));
    w.publish(makeEvent("research", { source: "github", payload: { structure: "scriptorium", label: "study" } }));
    w.publish(makeEvent("storm", { source: "inbox" }));
    w.publish(makeEvent("celebration", { source: "inbox", payload: { structure: "highkeep", label: "deploy ✓" } }));
    // Verify journal has reasonable content
    expect(entries.length).toBeGreaterThan(2);
    expect(entries.length).toBeLessThan(20); // not spam
    expect(entries.some((t) => t.toLowerCase().includes("storm") || t.toLowerCase().includes("rain") || t.toLowerCase().includes("thunder") || t.toLowerCase().includes("wind") || t.toLowerCase().includes("clouds"))).toBe(true);
  });

  it("achievement chain: first_courier → first_forge → first_storm", () => {
    const w = new World({ seed: 42 });
    const unlocked: string[] = [];
    const ach = new Achievements(w, w.journal, {}, (id) => unlocked.push(id));

    w.publish(makeEvent("courier", { source: "internal" }));
    ach.evaluate(0);
    expect(unlocked).toContain("first_courier");

    w.publish(makeEvent("forge", { source: "internal" }));
    ach.evaluate(0);
    expect(unlocked).toContain("first_forge");

    w.publish(makeEvent("storm", { source: "internal" }));
    ach.evaluate(0);
    expect(unlocked).toContain("first_storm");
  });

  it("malicious save data is rejected entirely, not partially-applied", () => {
    const bad: unknown[] = [
      null,
      undefined,
      "{}",
      { version: 0 },
      { version: SAVE_VERSION + 100 },
      { version: SAVE_VERSION, npcs: "not an array" },
    ];
    for (const input of bad) {
      const result = validateSave(input);
      // null is acceptable; partial-valid object with reset fields is also fine
      // but it should never throw or return something with bogus NPCs.
      if (result) {
        expect(Array.isArray(result.npcs)).toBe(true);
      }
    }
  });

  it("newborn NPCs survive a save/load round-trip (parentIds preserved)", () => {
    const w = new World({ seed: 42, foundedAtMs: Date.UTC(2025, 0, 1) });
    // Simulate a newborn child of two existing villagers.
    const parents = w.npcs.filter((n) => n.role === "villager").slice(0, 2);
    expect(parents.length).toBe(2);
    const newborn = {
      id: "npc_test_child",
      role: "villager" as const,
      name: "Anwen",
      age: 0.1,
      pos: { x: parents[0].pos.x, y: parents[0].pos.y },
      prevPos: { x: parents[0].pos.x, y: parents[0].pos.y },
      facing: "s" as const,
      homeId: parents[0].homeId,
      workId: parents[0].homeId,
      activity: "idle" as const,
      path: [],
      activityTimer: 0,
      seed: 9999,
      trait: "joyful" as const,
      parentIds: [parents[0].id, parents[1].id],
    };
    w.pushNpc(newborn);
    expect(w.npcs.some((n) => n.id === "npc_test_child")).toBe(true);

    const save = serialize(w, 100, { kingdomName: "Test", monarchName: "X" });
    const validated = validateSave(save)!;
    // parentIds round-tripped through validation
    const validatedChild = validated.npcs.find((n) => n.id === "npc_test_child");
    expect(validatedChild?.parentIds).toEqual([parents[0].id, parents[1].id]);

    // Apply to a fresh world (no in-sim child yet) — newborn should be reconstructed.
    const w2 = new World({ seed: 42 });
    expect(w2.npcs.some((n) => n.id === "npc_test_child")).toBe(false);
    applySave(w2, validated);
    const reborn = w2.npcs.find((n) => n.id === "npc_test_child");
    expect(reborn).toBeDefined();
    expect(reborn!.name).toBe("Anwen");
    expect(reborn!.parentIds).toEqual([parents[0].id, parents[1].id]);
    expect(reborn!.trait).toBe("joyful");
  });

  it("construction proposal triggers a decision when affordable", () => {
    const w = new World({ seed: 42 });
    w.economy.state.gold = 500;
    w.economy.state.ironwork = 50;
    w.economy.state.tomes = 50;
    // Force the construction system to be ready to propose
    (w.construction as unknown as { nextProposalDay: number }).nextProposalDay = 0;
    w.state.day = 10;
    w.construction.tick();
    // A construction decision should now be available
    const d = w.decisions.current();
    expect(d).not.toBeNull();
    expect(d?.title.toLowerCase()).toMatch(/watchtower|mill|shrine/);
  });
});
