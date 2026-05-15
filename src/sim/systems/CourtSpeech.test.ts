import { describe, expect, it } from "vitest";
import { World } from "../World";

/**
 * CourtSpeech writes one-line journal entries from seated court members.
 * Cadence is governed by lastFiredDay + cadenceDays + a 50% random gate.
 */

function makeWorld(seed = 42) {
  const w = new World({ seed });
  const journalLines: string[] = [];
  w.onJournal = (e) => journalLines.push(e.text);
  return { w, journalLines };
}

describe("CourtSpeech", () => {
  it("does not fire when no seats are filled", () => {
    const { w, journalLines } = makeWorld();
    for (let d = 1; d <= 20; d++) {
      w.state.day = d;
      w.courtSpeech.tick();
    }
    // Nothing should reference court roles by speech-line markers
    expect(journalLines.some((t) => /counseled patience|inspected every gate|finished translating/.test(t))).toBe(false);
  });

  it("fires advisor lines when advisor seat is filled (deterministic over many days)", () => {
    const { w, journalLines } = makeWorld(42);
    const npc = w.npcs[0];
    w.setCourt({ advisorId: npc.id });
    for (let d = 1; d <= 60; d++) {
      w.state.day = d;
      w.courtSpeech.tick();
    }
    // At least one advisor-flavor line should have surfaced over 60 days.
    expect(journalLines.some((t) => t.includes(npc.name ?? "—"))).toBe(true);
  });

  it("never fires more than once per role per day", () => {
    const { w } = makeWorld();
    const npc = w.npcs[0];
    w.setCourt({ advisorId: npc.id });
    let firedCount = 0;
    w.onJournal = () => firedCount++;
    w.state.day = 5;
    // Hammer tick 10 times on the same day — should still only fire at most once.
    for (let i = 0; i < 10; i++) w.courtSpeech.tick();
    expect(firedCount).toBeLessThanOrEqual(1);
  });

  it("falls silent if the appointee dies (seat treated as vacant)", () => {
    const { w, journalLines } = makeWorld();
    const npc = w.npcs[0];
    w.setCourt({ captainId: npc.id });
    // Kill the captain
    w.npcs.splice(w.npcs.indexOf(npc), 1);
    w.revalidateCourt();
    journalLines.length = 0;
    for (let d = 1; d <= 60; d++) {
      w.state.day = d;
      w.courtSpeech.tick();
    }
    expect(journalLines.length).toBe(0);
  });

  it("each role's pool surfaces at least 4 distinct lines over a long reign", () => {
    // Run a long simulation with a seated advisor and confirm we see real
    // variety rather than the same line over and over. The pool is 10 entries
    // and we'll likely hit ~20-30 fires over 600 days, so >=4 unique is a
    // conservative-but-meaningful floor.
    const w = new World({ seed: 31337 });
    const npc = w.npcs[0];
    const name = npc.name ?? "—";
    w.setCourt({ advisorId: npc.id });
    const seen = new Set<string>();
    w.onJournal = (e) => {
      if (e.text.includes(name)) {
        // Strip the leading name to compare just the line template.
        seen.add(e.text.replace(name, "{name}"));
      }
    };
    for (let d = 1; d <= 600; d++) {
      w.state.day = d;
      w.courtSpeech.tick();
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it("respects cadenceDays — advisor fires roughly every N days max", () => {
    const w = new World({ seed: 999 });
    const npc = w.npcs[0];
    w.setCourt({ advisorId: npc.id });
    const firedDays: number[] = [];
    w.onJournal = (e) => {
      if (e.text.includes(npc.name ?? "—")) firedDays.push(w.state.day);
    };
    for (let d = 1; d <= 200; d++) {
      w.state.day = d;
      w.courtSpeech.tick();
    }
    // Consecutive fires should be at least cadenceDays (=3) apart.
    for (let i = 1; i < firedDays.length; i++) {
      expect(firedDays[i] - firedDays[i - 1]).toBeGreaterThanOrEqual(3);
    }
  });
});
