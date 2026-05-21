import { describe, it, expect } from "vitest";
import { World } from "../World";
import { INITIAL_REVEAL_RADIUS } from "./Exploration";
import type { SavedJournalEntry } from "../Persistence";

/**
 * Advance `nDays` in-world days by directly mutating state.day (same pattern
 * as Usurper.test.ts and Uprising.test.ts — avoids calendar wall-clock math).
 * Returns any journal entries fired during the advancement.
 */
function advanceDays(world: World, nDays: number): SavedJournalEntry[] {
  const entries: SavedJournalEntry[] = [];
  world.onJournal = (e) => entries.push(e);
  const start = world.state.day;
  for (let d = 1; d <= nDays; d++) {
    (world.state as { day: number }).day = start + d;
    world.exploration.tick();
  }
  return entries;
}

describe("Exploration", () => {
  it("initial radius marks castle-area tiles as explored", () => {
    const w = new World({ seed: 42 });
    const castle = w.map.structures.find((s) => s.kind === "castle")!;
    const cx = castle.pos.x + Math.floor(castle.size.x / 2);
    const cy = castle.pos.y + Math.floor(castle.size.y / 2);
    // Tile at castle center must be explored.
    expect(w.map.tiles[cy * w.map.width + cx].explored).toBe(true);
    // Tile one step away must also be explored.
    expect(w.map.tiles[cy * w.map.width + (cx + 1)].explored).toBe(true);
  });

  it("tiles far beyond the initial radius start unexplored", () => {
    const w = new World({ seed: 42 });
    const castle = w.map.structures.find((s) => s.kind === "castle")!;
    const cx = castle.pos.x + Math.floor(castle.size.x / 2);
    const cy = castle.pos.y + Math.floor(castle.size.y / 2);
    // Go INITIAL_REVEAL_RADIUS + 10 tiles east (clamped to map edge).
    const farX = Math.min(w.map.width - 1, cx + INITIAL_REVEAL_RADIUS + 10);
    expect(w.map.tiles[cy * w.map.width + farX].explored).toBe(false);
  });

  it("snapshot() returns the initial radius before any ticks", () => {
    const w = new World({ seed: 42 });
    expect(w.exploration.snapshot()).toBe(INITIAL_REVEAL_RADIUS);
  });

  it("radius grows after EXPAND_EVERY_DAYS (7) in-world days", () => {
    const w = new World({ seed: 42 });
    const before = w.exploration.snapshot();
    advanceDays(w, 8); // 8 days > 7-day cadence
    expect(w.exploration.snapshot()).toBeGreaterThan(before);
  });

  it("newly revealed tiles become explored after expansion", () => {
    const w = new World({ seed: 42 });
    const castle = w.map.structures.find((s) => s.kind === "castle")!;
    const cx = castle.pos.x + Math.floor(castle.size.x / 2);
    const cy = castle.pos.y + Math.floor(castle.size.y / 2);

    // Pick a tile at INITIAL + 1 — just outside the starting bubble.
    const checkX = Math.min(w.map.width - 1, cx + INITIAL_REVEAL_RADIUS + 1);
    const tile = w.map.tiles[cy * w.map.width + checkX];
    expect(tile.explored).toBe(false); // starts dark

    // Advance 2 × 7-day expansions so the radius grows past INITIAL + 1.
    advanceDays(w, 16);
    expect(tile.explored).toBe(true); // now lit
  });

  it("restore() silently applies a saved radius and marks tiles explored", () => {
    const w = new World({ seed: 42 });
    const bigRadius = INITIAL_REVEAL_RADIUS + 15;
    w.exploration.restore(bigRadius);
    expect(w.exploration.snapshot()).toBe(bigRadius);

    const castle = w.map.structures.find((s) => s.kind === "castle")!;
    const cx = castle.pos.x + Math.floor(castle.size.x / 2);
    const cy = castle.pos.y + Math.floor(castle.size.y / 2);
    const checkX = Math.min(w.map.width - 1, cx + INITIAL_REVEAL_RADIUS + 5);
    expect(w.map.tiles[cy * w.map.width + checkX].explored).toBe(true);
  });

  it("restore() clamps below INITIAL_REVEAL_RADIUS back up to minimum", () => {
    const w = new World({ seed: 42 });
    w.exploration.restore(1); // bogus tiny radius
    expect(w.exploration.snapshot()).toBe(INITIAL_REVEAL_RADIUS);
  });

  it("radius never exceeds map bounds", () => {
    const w = new World({ seed: 42 });
    w.exploration.restore(9999);
    const maxRadius = Math.floor(Math.min(w.map.width, w.map.height) / 2) - 2;
    expect(w.exploration.snapshot()).toBeGreaterThanOrEqual(maxRadius);
    // No tiles should be undefined.
    expect(w.map.tiles.every((t) => t !== undefined)).toBe(true);
  });

  it("expansion fires a journal entry within 8 days", () => {
    const w = new World({ seed: 42 });
    const entries = advanceDays(w, 8);
    const hasExpansion = entries.some(
      (e) => e.kind === "event" &&
        (e.text.includes("Scouts") || e.text.includes("frontier") ||
         e.text.includes("charted") || e.text.includes("kingdom") ||
         e.text.includes("scouts") || e.text.includes("land")),
    );
    expect(hasExpansion).toBe(true);
  });
});
