import { describe, expect, it, beforeEach } from "vitest";
import { World } from "../World";
import { ARCHIVE_STORAGE_KEY } from "../KingdomArchive";

// Tiny localStorage shim shared with these tests (the suite runs in node).
class LocalStorageShim {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(k: string) { return this.store.has(k) ? (this.store.get(k) as string) : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  key(i: number): string | null { return Array.from(this.store.keys())[i] ?? null; }
}
if (typeof globalThis.localStorage === "undefined") {
  (globalThis as unknown as { localStorage: LocalStorageShim }).localStorage =
    new LocalStorageShim();
}

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

  it("boundary dispute never names the same villager on both sides (live-demo regression)", () => {
    // The naive pick of `other` from FLAVOR_NAMES collided ~11% of the time,
    // producing decision text reading "Two villagers, Tessa and Tessa,
    // argue over the line" with two identical "Side with Tessa" buttons.
    // Drive a lot of boundary-dispute proposals and assert the antagonists
    // are always distinct.
    const w = new World({ seed: 42 });
    const seen: Array<{ body: string; labels: string[] }> = [];
    const origPropose = w.decisions.propose.bind(w.decisions);
    w.decisions.propose = ((d) => {
      if (d.title === "A boundary dispute") {
        seen.push({ body: d.body, labels: d.options.map((o) => o.label) });
      }
      origPropose(d);
    }) as typeof w.decisions.propose;

    // Drive many days; the proposeRandomDecision branch fires ~25% per new
    // day, and ~6% of those (roll in [0.75, 0.80)) are boundary disputes.
    // Resolve each as it appears so the queue doesn't backlog.
    for (let d = 1; d <= 800; d++) {
      w.state.day = d;
      const internal = w.quests as unknown as { lastRolledDay: number };
      internal.lastRolledDay = d - 1;
      w.quests.tick();
      const cur = w.decisions.current();
      if (cur) w.decisions.resolve(cur.id, cur.options[0].id);
    }

    // We should have seen plenty of disputes over 800 days.
    expect(seen.length).toBeGreaterThan(5);
    for (const s of seen) {
      // Body never has "X and X"
      expect(s.body).not.toMatch(/Two villagers, (\w+) and \1,/);
      // Buttons "Side with X" / "Side with Y" / "Split the difference" — the
      // two "Side with" labels must reference different names.
      const sideWith = s.labels.filter((l) => l.startsWith("Side with "));
      expect(sideWith.length).toBe(2);
      expect(sideWith[0]).not.toBe(sideWith[1]);
    }
  });

  it("tournament arc fires 5 phases over 5 days, awards a relic, and pins to the castle", () => {
    const w = new World({ seed: 1234 });
    const entries: Array<{ text: string; kind: string; targetStructureId?: string }> = [];
    w.onJournal = (e) =>
      entries.push({ text: e.text, kind: e.kind, targetStructureId: e.targetStructureId });
    const internal = w.quests as unknown as {
      active: {
        arcId: string;
        startDay: number;
        flavor: string;
        firedPhases: number[];
      } | null;
      lastRolledDay: number;
    };
    internal.active = { arcId: "tournament", startDay: 1, flavor: "—", firedPhases: [] };
    const vaultBefore = w.treasury.count();
    for (let d = 1; d <= 6; d++) {
      w.state.day = d;
      internal.lastRolledDay = d;
      w.quests.tick();
    }
    // All 5 phase lines should have surfaced. Match each phase by an opener
    // that is unique to the arc body (avoids matching the Treasury entry the
    // final phase's acquire() also writes for the cup).
    const arcLines = entries.filter((e) =>
      /^Heralds proclaimed|^Champions were named|^The forge ran late|^The lists opened|^The champion's cup was placed/.test(e.text),
    );
    expect(arcLines.length).toBe(5);
    const castle = w.map.structures.find((s) => s.kind === "castle");
    // First phase + final phase pin to the castle.
    expect(arcLines[0].targetStructureId).toBe(castle?.id);
    expect(arcLines[arcLines.length - 1].targetStructureId).toBe(castle?.id);
    // Vault gains exactly one relic from the arc's final phase.
    expect(w.treasury.count()).toBe(vaultBefore + 1);
  });

  it("tournament arc is deterministic against the seed (same seed → same champion line)", () => {
    function runOnce(): string {
      const w = new World({ seed: 9876 });
      const lines: string[] = [];
      w.onJournal = (e) => {
        if (/unhorsed every challenger/.test(e.text)) lines.push(e.text);
      };
      const internal = w.quests as unknown as {
        active: {
          arcId: string;
          startDay: number;
          flavor: string;
          firedPhases: number[];
        } | null;
        lastRolledDay: number;
      };
      internal.active = { arcId: "tournament", startDay: 1, flavor: "—", firedPhases: [] };
      for (let d = 1; d <= 6; d++) {
        w.state.day = d;
        internal.lastRolledDay = d;
        w.quests.tick();
      }
      return lines[0] ?? "";
    }
    expect(runOnce()).toBe(runOnce());
  });

  describe("returning_bloodline arc", () => {
    beforeEach(() => {
      // Seed an archive with a known past kingdom so the arc's guard passes
      // and we can verify the spawned NPC inherits the monarch's surname.
      const past = [
        {
          archivedAt: new Date().toISOString(),
          kingdomName: "Eastmarch",
          monarchName: "King Halford",
          foundedAtMs: Date.now() - 1_000_000,
          totalDays: 80,
          yearsReigned: 1,
          generations: 2,
          population: 12,
          vault: 4,
          gold: 0,
          milestones: [],
        },
      ];
      localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(past));
    });

    it("spawns a new villager whose surname matches the past monarch's last name", () => {
      const w = new World({ seed: 17 });
      const npcsBefore = w.npcs.length;
      const internal = w.quests as unknown as {
        active: {
          arcId: string;
          startDay: number;
          flavor: string;
          firedPhases: number[];
        } | null;
        lastRolledDay: number;
      };
      // Pre-set the arc with its bloodline flavor packing (mirrors what
      // pickFlavor() produces when invoked by the picker).
      internal.active = {
        arcId: "returning_bloodline",
        startDay: 1,
        flavor: "Eastmarch||King Halford",
        firedPhases: [],
      };
      for (let d = 1; d <= 5; d++) {
        w.state.day = d;
        internal.lastRolledDay = d;
        w.quests.tick();
      }
      expect(w.npcs.length).toBe(npcsBefore + 1);
      const newcomer = w.npcs[w.npcs.length - 1];
      expect(newcomer.name?.endsWith("Halford")).toBe(true);
      expect(newcomer.role).toBe("villager");
    });

    it("guard skips the arc when the archive is empty", () => {
      localStorage.removeItem(ARCHIVE_STORAGE_KEY);
      const w = new World({ seed: 17 });
      // Force the picker to roll deterministically and observe that the
      // bloodline arc is never selected. (We can't pin it down exactly
      // without instrumenting the picker, so we just confirm 300 drives
      // produce no entry that mentions "of the line of".)
      const seen: string[] = [];
      w.onJournal = (e) => seen.push(e.text);
      const internal = w.quests as unknown as { lastRolledDay: number };
      for (let d = 1; d <= 300; d++) {
        w.state.day = d;
        internal.lastRolledDay = d - 1;
        w.quests.tick();
      }
      expect(seen.some((t) => t.includes("of the line of"))).toBe(false);
    });

    it("phases 0 and 3 pin to the castle; phase 2 pins to the newcomer's town", () => {
      const w = new World({ seed: 17 });
      const journal: Array<{ text: string; targetStructureId?: string }> = [];
      w.onJournal = (e) => journal.push({ text: e.text, targetStructureId: e.targetStructureId });
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
        arcId: "returning_bloodline",
        startDay: 1,
        flavor: "Eastmarch||King Halford",
        firedPhases: [],
      };
      for (let d = 1; d <= 5; d++) {
        w.state.day = d;
        internal.lastRolledDay = d;
        w.quests.tick();
      }
      const castle = w.map.structures.find((s) => s.kind === "castle");
      const town =
        w.map.structures.find((s) => s.kind === "town") ?? castle;
      const opener = journal.find((e) => /carrying a battered seal/.test(e.text));
      const settler = journal.find((e) => /took a room near the keep/.test(e.text));
      const closer = journal.find((e) => /thread of the old kingdom/.test(e.text));
      expect(opener?.targetStructureId).toBe(castle?.id);
      expect(settler?.targetStructureId).toBe(town?.id);
      expect(closer?.targetStructureId).toBe(castle?.id);
    });
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
