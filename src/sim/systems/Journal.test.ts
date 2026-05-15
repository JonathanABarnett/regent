import { describe, expect, it } from "vitest";
import { World } from "../World";
import { makeEvent } from "../events/EventSchema";
import type { SavedJournalEntry } from "../Persistence";

/**
 * Tests for the Journal narration layer. Mostly behavioral — does it write
 * the right number of entries, in the right kind, for a given event stream.
 */

function collectJournal(setup: (w: World) => void): SavedJournalEntry[] {
  const entries: SavedJournalEntry[] = [];
  const w = new World({ seed: 42 });
  w.onJournal = (e) => entries.push(e);
  setup(w);
  return entries;
}

describe("Journal", () => {
  it("writes nothing for fresh world without events", () => {
    const entries = collectJournal(() => {});
    expect(entries.length).toBe(0);
  });

  it("writes a courier entry when a courier fires", () => {
    const entries = collectJournal((w) => {
      w.publish(
        makeEvent("courier", {
          source: "internal",
          payload: { from: "rivermouth", to: "highkeep", label: "test scroll" },
        }),
      );
    });
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.some((e) => e.text.includes("Rivermouth") && e.text.includes("Highkeep"))).toBe(true);
  });

  it("coalesces multiple couriers on same route per day", () => {
    const entries = collectJournal((w) => {
      for (let i = 0; i < 5; i++) {
        w.publish(
          makeEvent("courier", {
            id: `c${i}`,
            source: "internal",
            payload: { from: "rivermouth", to: "highkeep", label: "spam" },
          }),
        );
      }
    });
    // Should be exactly 1 courier journal entry despite 5 events
    const courierEntries = entries.filter(
      (e) => e.kind === "event" && e.text.match(/courier|rode|rider|saddle/i),
    );
    expect(courierEntries.length).toBe(1);
  });

  it("writes weather-kind entry on storm", () => {
    const entries = collectJournal((w) => {
      w.publish(makeEvent("storm", { source: "internal" }));
    });
    const weatherEntries = entries.filter((e) => e.kind === "weather");
    expect(weatherEntries.length).toBeGreaterThanOrEqual(1);
  });

  it("writes milestone for celebration with a label", () => {
    const entries = collectJournal((w) => {
      w.publish(
        makeEvent("celebration", {
          source: "internal",
          intensity: 0.9,
          payload: { structure: "highkeep", label: "victory" },
        }),
      );
    });
    expect(entries.some((e) => e.kind === "milestone" && e.text.includes("victory"))).toBe(true);
  });

  it("writes milestone for festival", () => {
    const entries = collectJournal((w) => {
      w.publish(
        makeEvent("festival", {
          source: "internal",
          intensity: 0.9,
          duration_ms: 30_000,
          payload: { structure: "highkeep" },
        }),
      );
    });
    expect(entries.some((e) => e.kind === "milestone")).toBe(true);
  });

  it("writes entries tagged with the current in-world day/year/season", () => {
    const entries = collectJournal((w) => {
      w.publish(
        makeEvent("courier", {
          source: "internal",
          payload: { from: "rivermouth", to: "highkeep", label: "test" },
        }),
      );
    });
    const e = entries.find((x) => x.text.toLowerCase().includes("highkeep"));
    expect(e).toBeDefined();
    if (e) {
      expect(e.day).toBeGreaterThanOrEqual(1);
      expect(e.year).toBeGreaterThanOrEqual(1);
      expect(["spring", "summer", "autumn", "winter"]).toContain(e.season);
    }
  });

  it("free-form write() works with any kind", () => {
    const entries = collectJournal((w) => {
      w.journal.write("custom message", "milestone");
    });
    expect(entries.length).toBe(1);
    expect(entries[0].text).toBe("custom message");
    expect(entries[0].kind).toBe("milestone");
  });

  it("variant templates produce text that differs across many calls (not 100% locked)", () => {
    const texts: string[] = [];
    for (let i = 0; i < 20; i++) {
      const w = new World({ seed: 42 + i });
      w.onJournal = (e) => texts.push(e.text);
      w.publish(makeEvent("storm", { source: "internal" }));
    }
    // We expect to see at least 2 different storm phrases out of 20 rolls
    const unique = new Set(texts.map((t) => t.slice(0, 30)));
    expect(unique.size).toBeGreaterThan(1);
  });
});
