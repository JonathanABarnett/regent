import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ARCHIVE_MAX_ENTRIES,
  ARCHIVE_STORAGE_KEY,
  appendToArchive,
  clearArchive,
  readArchive,
  summarize,
  type ArchivedKingdom,
} from "./KingdomArchive";
import { SAVE_VERSION, type SaveData } from "./Persistence";

// Vitest's default environment is `node` (per vitest.config.ts). The archive
// reads/writes localStorage — shim it for these tests only so we don't have
// to flip the whole suite to jsdom.
class LocalStorageShim {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(k: string) {
    return this.store.has(k) ? (this.store.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, String(v));
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  key(i: number): string | null {
    return Array.from(this.store.keys())[i] ?? null;
  }
}
(globalThis as unknown as { localStorage: LocalStorageShim }).localStorage = new LocalStorageShim();

function makeSave(over: Partial<SaveData> = {}): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    foundedAtMs: Date.UTC(2025, 0, 1),
    kingdomName: "Aurelia",
    monarchName: "King Elden",
    totalLifetimeSec: 100,
    seed: 42,
    simTime: 50,
    weather: "clear",
    loadFactor: 0.2,
    npcs: [],
    journal: [],
    ...over,
  };
}

describe("KingdomArchive", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("summarize extracts core identity from a save", () => {
    const save = makeSave();
    const s = summarize(save);
    expect(s.kingdomName).toBe("Aurelia");
    expect(s.monarchName).toBe("King Elden");
    expect(s.foundedAtMs).toBe(Date.UTC(2025, 0, 1));
    expect(s.generations).toBe(1); // default when succession is missing
  });

  it("summarize collects only milestone-kind journal entries", () => {
    const save = makeSave({
      journal: [
        { id: "j1", day: 1, year: 1, season: "spring", text: "Founding", kind: "milestone" },
        { id: "j2", day: 1, year: 1, season: "spring", text: "rain", kind: "weather" },
        { id: "j3", day: 2, year: 1, season: "spring", text: "Wedding", kind: "life" },
        { id: "j4", day: 5, year: 1, season: "spring", text: "Royal feast", kind: "milestone" },
      ],
    });
    const s = summarize(save);
    expect(s.milestones.length).toBe(2);
    expect(s.milestones.map((m) => m.text)).toEqual(["Founding", "Royal feast"]);
  });

  it("summarize caps milestones at ~12 entries", () => {
    const journal = Array.from({ length: 30 }, (_, i) => ({
      id: `j${i}`,
      day: i + 1,
      year: 1,
      season: "spring",
      text: `Milestone ${i}`,
      kind: "milestone" as const,
    }));
    const s = summarize(makeSave({ journal }));
    expect(s.milestones.length).toBeLessThanOrEqual(12);
    // Should keep the LATEST entries, not the earliest
    expect(s.milestones[s.milestones.length - 1].text).toBe("Milestone 29");
  });

  it("summarize handles succession data when present", () => {
    const save = makeSave({ succession: { generation: 4, reignStartDay: 50 } });
    const s = summarize(save);
    expect(s.generations).toBe(4);
  });

  it("appendToArchive stores newest-first", () => {
    const a: ArchivedKingdom = sampleArchive("Aurelia", "Elara");
    const b: ArchivedKingdom = sampleArchive("Brightmark", "Calla");
    appendToArchive(a);
    appendToArchive(b);
    const list = readArchive();
    expect(list[0].kingdomName).toBe("Brightmark");
    expect(list[1].kingdomName).toBe("Aurelia");
  });

  it("appendToArchive caps total entries at ARCHIVE_MAX_ENTRIES", () => {
    for (let i = 0; i < ARCHIVE_MAX_ENTRIES + 10; i++) {
      appendToArchive(sampleArchive(`K${i}`, `M${i}`));
    }
    expect(readArchive().length).toBe(ARCHIVE_MAX_ENTRIES);
    // The newest one (last appended) should be at the front
    expect(readArchive()[0].kingdomName).toBe(`K${ARCHIVE_MAX_ENTRIES + 10 - 1}`);
  });

  it("readArchive returns [] when storage is empty or malformed", () => {
    expect(readArchive()).toEqual([]);
    localStorage.setItem(ARCHIVE_STORAGE_KEY, "not valid json");
    expect(readArchive()).toEqual([]);
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify({ not: "an array" }));
    expect(readArchive()).toEqual([]);
  });

  it("readArchive drops malformed individual entries but keeps valid ones", () => {
    const valid = sampleArchive("Goodland", "Goodking");
    const bad = { not: "a valid entry" };
    localStorage.setItem(
      ARCHIVE_STORAGE_KEY,
      JSON.stringify([bad, valid, { kingdomName: "" }, null]),
    );
    const list = readArchive();
    expect(list.length).toBe(1);
    expect(list[0].kingdomName).toBe("Goodland");
  });

  it("readArchive strips control chars + bidi overrides from text fields", () => {
    const dirty: ArchivedKingdom = sampleArchive(
      "Aur" + String.fromCharCode(0x00) + "elia" + String.fromCharCode(0x202e) + "X",
      "Eld‮en",
    );
    appendToArchive(dirty);
    const list = readArchive();
    expect(list[0].kingdomName).toBe("AureliaX");
    expect(list[0].monarchName).toBe("Elden");
  });

  it("clearArchive empties storage", () => {
    appendToArchive(sampleArchive("ToClear", "Monarch"));
    expect(readArchive().length).toBe(1);
    clearArchive();
    expect(readArchive().length).toBe(0);
  });

  it("milestone text is also defanged against control chars", () => {
    const archive = sampleArchive("Aurelia", "Elden");
    archive.milestones = [
      { day: 1, year: 1, text: "Festival" + String.fromCharCode(0x07) },
    ];
    appendToArchive(archive);
    expect(readArchive()[0].milestones[0].text).toBe("Festival");
  });
});

function sampleArchive(kingdomName: string, monarchName: string): ArchivedKingdom {
  return {
    archivedAt: new Date().toISOString(),
    kingdomName,
    monarchName,
    foundedAtMs: Date.UTC(2025, 0, 1),
    totalDays: 42,
    yearsReigned: 1,
    generations: 1,
    population: 12,
    vault: 3,
    gold: 250,
    milestones: [{ day: 1, year: 1, text: "Founding" }],
  };
}
