import { describe, expect, it } from "vitest";
import { World } from "./World";

/**
 * Royal favor (bless a villager) + pet-the-pet — the lightest verbs of
 * rule. Both mutate transient presentation state and tiny mood, never
 * persisted structure.
 */

describe("World.blessNpc", () => {
  it("blesses a villager: heart window, gratitude speech, mood bump", () => {
    const w = new World({ seed: 42 });
    const npc = w.npcs.find((n) => n.role !== "monarch")!;
    const moodBefore = w.mood.state.score;
    const r = w.blessNpc(npc.id);
    expect(r.ok).toBe(true);
    expect(npc.blessedUntil).toBeGreaterThan(w.state.time);
    expect(npc.speech).toBeTruthy();
    expect(w.mood.state.score).toBeGreaterThan(moodBefore);
  });

  it("refuses a second blessing for the same NPC on the same day", () => {
    const w = new World({ seed: 42 });
    const npc = w.npcs.find((n) => n.role !== "monarch")!;
    expect(w.blessNpc(npc.id).ok).toBe(true);
    const again = w.blessNpc(npc.id);
    expect(again.ok).toBe(false);
    expect(again.reason).toBe("already");
    expect(w.isBlessedToday(npc.id)).toBe(true);
  });

  it("caps favors per day and reports remaining", () => {
    const w = new World({ seed: 42 });
    const villagers = w.npcs.filter((n) => n.role !== "monarch");
    expect(w.favorsRemainingToday()).toBe(World.ROYAL_FAVORS_PER_DAY);
    for (let i = 0; i < World.ROYAL_FAVORS_PER_DAY; i++) {
      expect(w.blessNpc(villagers[i].id).ok).toBe(true);
    }
    expect(w.favorsRemainingToday()).toBe(0);
    const overflow = w.blessNpc(villagers[World.ROYAL_FAVORS_PER_DAY].id);
    expect(overflow.ok).toBe(false);
    expect(overflow.reason).toBe("spent");
  });

  it("returns gone for an unknown NPC id", () => {
    const w = new World({ seed: 42 });
    expect(w.blessNpc("nobody").reason).toBe("gone");
  });
});

describe("World.petThePet", () => {
  it("sets the delight window and publishes a pet_delight event", () => {
    const w = new World({ seed: 42 });
    const pet = w.adoptPet("Mochi", "dog", { silent: true });
    let delightLabel = "";
    w.bus.subscribe((ev) => {
      if (
        ev.kind === "custom" &&
        typeof ev.payload.label === "string" &&
        ev.payload.label.startsWith("pet_delight:")
      ) {
        delightLabel = ev.payload.label;
      }
    });
    expect(w.petThePet(pet.id)).toBe(true);
    expect(pet.heartUntil).toBeGreaterThan(w.state.time);
    expect(delightLabel).toBe("pet_delight:Mochi");
  });

  it("returns false for an unknown pet", () => {
    const w = new World({ seed: 42 });
    expect(w.petThePet("ghost")).toBe(false);
  });

  it("journals the very good dog only once per day", () => {
    const w = new World({ seed: 42 });
    const pet = w.adoptPet("Mochi", "dog", { silent: true });
    let lines = 0;
    w.onJournal = (e) => {
      if (e.text.includes("very good")) lines++;
    };
    w.petThePet(pet.id);
    w.petThePet(pet.id);
    w.petThePet(pet.id);
    expect(lines).toBe(1);
  });
});

describe("World.decisionAppetite", () => {
  it("defaults to balanced (1)", () => {
    const w = new World({ seed: 42 });
    expect(w.decisionAppetite).toBe(1);
  });
});
