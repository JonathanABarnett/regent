import { describe, expect, it } from "vitest";
import { World } from "../World";
import { pickStarSuggestions, proposeNameAStar } from "./NameAStar";

describe("pickStarSuggestions", () => {
  it("returns distinct entries", () => {
    const rand = () => 0.5;
    const out = pickStarSuggestions(rand, 3);
    expect(out.length).toBe(3);
    expect(new Set(out).size).toBe(3);
  });

  it("is deterministic for the same rand sequence", () => {
    // mulberry-style sequence so the second call replays identically.
    const make = (seed: number) => {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    expect(pickStarSuggestions(make(1234), 3)).toEqual(pickStarSuggestions(make(1234), 3));
  });

  it("never exceeds the pool size", () => {
    const out = pickStarSuggestions(() => 0.1, 999);
    // Pool size is 25 in the source — we should top out there.
    expect(out.length).toBeLessThanOrEqual(25);
    expect(new Set(out).size).toBe(out.length);
  });
});

describe("proposeNameAStar", () => {
  it("is a no-op when no Astronomer's Tower exists on the map", () => {
    const w = new World({ seed: 1 });
    // Strip towers (shouldn't be present in a fresh kingdom anyway).
    w.map.structures = w.map.structures.filter((s) => s.kind !== "astronomers_tower");
    proposeNameAStar(w, w.journal, () => 0.5);
    expect(w.decisions.current()).toBeNull();
  });

  it("proposes a decision with three name options + a decline option", () => {
    const w = new World({ seed: 1 });
    // Inject a tower so the guard passes.
    w.map.structures.push({
      id: "tower_test",
      kind: "astronomers_tower",
      name: "The Tower",
      pos: { x: 5, y: 5 },
      size: { x: 2, y: 3 },
    });
    proposeNameAStar(w, w.journal, () => 0.2);
    const cur = w.decisions.current();
    expect(cur).not.toBeNull();
    expect(cur!.title).toBe("A new star");
    // 3 name options + decline = 4 (no past monarch in this test).
    expect(cur!.options.length).toBe(4);
    const labels = cur!.options.map((o) => o.label);
    expect(labels.filter((l) => l.startsWith("Name it")).length).toBe(3);
    expect(labels.some((l) => l.startsWith("Let the astronomers"))).toBe(true);
  });

  it("choosing a name writes a milestone and adds a scroll to the vault", () => {
    const w = new World({ seed: 1 });
    w.map.structures.push({
      id: "tower_test",
      kind: "astronomers_tower",
      name: "The Tower",
      pos: { x: 5, y: 5 },
      size: { x: 2, y: 3 },
    });
    const milestones: string[] = [];
    w.onJournal = (e) => {
      if (e.kind === "milestone") milestones.push(e.text);
    };
    const vaultBefore = w.treasury.count();
    proposeNameAStar(w, w.journal, () => 0.2);
    const cur = w.decisions.current()!;
    // Pick the first naming option.
    w.decisions.resolve(cur.id, cur.options[0].id);
    expect(milestones.some((t) => /chart at the Tower/.test(t))).toBe(true);
    expect(w.treasury.count()).toBe(vaultBefore + 1);
  });

  it("decline option writes an event-kind entry, not a milestone", () => {
    const w = new World({ seed: 1 });
    w.map.structures.push({
      id: "tower_test",
      kind: "astronomers_tower",
      name: "The Tower",
      pos: { x: 5, y: 5 },
      size: { x: 2, y: 3 },
    });
    const journalKinds: string[] = [];
    w.onJournal = (e) => journalKinds.push(e.kind);
    const vaultBefore = w.treasury.count();
    proposeNameAStar(w, w.journal, () => 0.2);
    const cur = w.decisions.current()!;
    // Decline option is the last one (after the 3 names).
    const decline = cur.options.find((o) => o.id === "decline")!;
    w.decisions.resolve(cur.id, decline.id);
    // No milestone fired by the decline branch.
    expect(journalKinds.filter((k) => k === "milestone").length).toBe(0);
    // Vault didn't gain anything.
    expect(w.treasury.count()).toBe(vaultBefore);
  });
});
