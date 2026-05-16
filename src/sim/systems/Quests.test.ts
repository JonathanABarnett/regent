import { describe, expect, it } from "vitest";
import { World } from "../World";

/**
 * The quest system processes the active arc's current-day phase on every
 * `tick()` call. Since `World.tick()` runs at 10 Hz, an unguarded
 * implementation fires the same journal line 10×/second — which actually
 * happened (the journal filled with 500 identical "Tessa was seen at the
 * southern gate" entries within a minute). These tests pin the fix.
 */

describe("Quests — phase deduplication regression", () => {
  it("a phase fires AT MOST ONCE per arc per onDay value, even with many ticks per day", () => {
    const w = new World({ seed: 42 });

    // Set up an active arc by hand so we don't depend on RNG.
    const internal = w.quests as unknown as {
      active: {
        arcId: string;
        startDay: number;
        flavor: string;
        firedPhases: number[];
      } | null;
      lastRolledDay: number;
    };
    w.state.day = 1;
    internal.lastRolledDay = 1; // prevent a new arc from rolling this tick
    internal.active = {
      arcId: "traveler",
      startDay: 1,
      flavor: "Tessa",
      firedPhases: [],
    };

    const writes: string[] = [];
    w.onJournal = (e) => writes.push(e.text);

    // Hammer tick 50 times — simulates ~5 seconds of real game time.
    for (let i = 0; i < 50; i++) w.quests.tick();

    // Exactly one journal entry for phase 0 (the "Tessa arrived…" line)
    const tessaLines = writes.filter((t) => t.includes("Tessa"));
    expect(tessaLines.length).toBe(1);
  });

  it("phases at different onDay values each fire exactly once as days advance", () => {
    const w = new World({ seed: 42 });
    const internal = w.quests as unknown as {
      active: {
        arcId: string;
        startDay: number;
        flavor: string;
        firedPhases: number[];
      } | null;
      lastRolledDay: number;
    };
    internal.active = {
      arcId: "traveler", // 3-phase arc: day 0, 1, 2
      startDay: 1,
      flavor: "Tessa",
      firedPhases: [],
    };

    const writes: string[] = [];
    w.onJournal = (e) => writes.push(e.text);

    // Drive day 1 → 4 with 10 ticks per day (10 Hz over 4 in-world days)
    for (let d = 1; d <= 4; d++) {
      w.state.day = d;
      internal.lastRolledDay = d;
      for (let t = 0; t < 10; t++) w.quests.tick();
    }

    // Match only the phase opening sentences. Phase 2 also publishes a
    // courier event which the Journal subscriber renders with the label
    // "Tessa departs" embedded — that's a downstream consequence, not a
    // duplicate phase fire.
    const phaseOpenings = [
      "Tessa arrived",
      "Tessa stayed",
      "Tessa left",
    ];
    const phaseFires = writes.filter((t) =>
      phaseOpenings.some((opening) => t.startsWith(opening)),
    );
    expect(phaseFires.length).toBe(3);
    expect(new Set(phaseFires).size).toBe(3);
  });

  it("fence_dispute arc fires its 3 phases pinned to a town across days 0/2/4", () => {
    const w = new World({ seed: 42 });
    const entries: Array<{ text: string; targetStructureId?: string }> = [];
    w.onJournal = (e) =>
      entries.push({ text: e.text, targetStructureId: e.targetStructureId });
    const internal = w.quests as unknown as {
      active: {
        arcId: string;
        startDay: number;
        flavor: string;
        firedPhases: number[];
      } | null;
      lastRolledDay: number;
    };
    internal.active = { arcId: "fence_dispute", startDay: 1, flavor: "—", firedPhases: [] };
    for (let d = 1; d <= 6; d++) {
      w.state.day = d;
      internal.lastRolledDay = d;
      w.quests.tick();
    }
    const phaseEntries = entries.filter((e) =>
      /fence|elder visited|rosemary/.test(e.text),
    );
    expect(phaseEntries.length).toBe(3);
    // All three phases pin to the same town.
    expect(phaseEntries[0].targetStructureId).toBeTruthy();
    expect(phaseEntries[0].targetStructureId).toBe(phaseEntries[1].targetStructureId);
    expect(phaseEntries[1].targetStructureId).toBe(phaseEntries[2].targetStructureId);
  });

  it("letter_from_afar arc emits a courier event on day 0 and pins to the castle", () => {
    const w = new World({ seed: 42 });
    const journalEntries: Array<{ text: string; targetStructureId?: string }> = [];
    w.onJournal = (e) =>
      journalEntries.push({ text: e.text, targetStructureId: e.targetStructureId });
    const courierLabels: string[] = [];
    w.bus.subscribe((ev) => {
      if (ev.kind === "courier" && ev.payload.label) {
        courierLabels.push(ev.payload.label);
      }
    });
    const internal = w.quests as unknown as {
      active: {
        arcId: string;
        startDay: number;
        flavor: string;
        firedPhases: number[];
      } | null;
      lastRolledDay: number;
    };
    internal.active = { arcId: "letter_from_afar", startDay: 1, flavor: "—", firedPhases: [] };
    for (let d = 1; d <= 5; d++) {
      w.state.day = d;
      internal.lastRolledDay = d;
      w.quests.tick();
    }
    expect(courierLabels).toContain("a sealed letter");
    const castle = w.map.structures.find((s) => s.kind === "castle");
    const arcEntries = journalEntries.filter((e) =>
      /three seals|letter at noon|reply was sealed/.test(e.text),
    );
    expect(arcEntries.length).toBe(3);
    expect(arcEntries[0].targetStructureId).toBe(castle?.id);
  });

  it("after the last phase fires, the active arc is cleared and stops re-firing", () => {
    const w = new World({ seed: 42 });
    const internal = w.quests as unknown as {
      active: {
        arcId: string;
        startDay: number;
        flavor: string;
        firedPhases: number[];
      } | null;
      lastRolledDay: number;
    };
    internal.active = {
      arcId: "traveler",
      startDay: 1,
      flavor: "Tessa",
      firedPhases: [],
    };

    // Drive past the last phase (day 0, 1, 2)
    for (let d = 1; d <= 5; d++) {
      w.state.day = d;
      internal.lastRolledDay = d;
      w.quests.tick();
    }

    // Arc should be cleared
    expect(internal.active).toBeNull();
  });
});
