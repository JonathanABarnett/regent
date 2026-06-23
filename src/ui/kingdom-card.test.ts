import { describe, expect, it } from "vitest";
import type { SavedJournalEntry } from "../sim/Persistence";
import {
  pickCardMilestones,
  trimMilestoneLine,
  composeCardInput,
  composeReignCardInput,
  cardFilename,
  reignCardFilename,
  pickSparklineSeries,
  compactNumber,
} from "./kingdom-card-data";
import { drawKingdomCard, CARD_TEMPLATES } from "./kingdom-card-renderer";
import type { ReignChapter } from "../sim/systems/Chronicle";

function entry(
  text: string,
  kind: SavedJournalEntry["kind"],
  i: number,
): SavedJournalEntry {
  return {
    id: `j_${i}`,
    day: i,
    year: 1,
    season: "spring",
    text,
    kind,
  };
}

describe("pickCardMilestones", () => {
  it("returns empty array on empty journal", () => {
    expect(pickCardMilestones([])).toEqual([]);
  });

  it("filters out system + weather entries", () => {
    const j: SavedJournalEntry[] = [
      entry("dawn", "system", 0),
      entry("rain came", "weather", 1),
      entry("a wedding", "life", 2),
    ];
    expect(pickCardMilestones(j, 5)).toEqual(["a wedding"]);
  });

  it("prefers milestones over life over events", () => {
    const j: SavedJournalEntry[] = [
      entry("event-line", "event", 0),
      entry("life-line", "life", 1),
      entry("milestone-line", "milestone", 2),
    ];
    // Within the cap, all three appear; chronological order (oldest first).
    expect(pickCardMilestones(j, 3)).toEqual(["event-line", "life-line", "milestone-line"]);
  });

  it("caps to `max`, picking the highest-rank-and-most-recent entries", () => {
    const j: SavedJournalEntry[] = [
      entry("old-event", "event", 0),
      entry("old-life", "life", 1),
      entry("new-event", "event", 2),
      entry("milestone-A", "milestone", 3),
      entry("milestone-B", "milestone", 4),
      entry("milestone-C", "milestone", 5),
    ];
    // With max=3 we should keep the three milestones; chronological output.
    expect(pickCardMilestones(j, 3)).toEqual([
      "milestone-A",
      "milestone-B",
      "milestone-C",
    ]);
  });

  it("when milestones don't fill the cap, fills from life then event", () => {
    const j: SavedJournalEntry[] = [
      entry("event-1", "event", 0),
      entry("life-1", "life", 1),
      entry("milestone-1", "milestone", 2),
    ];
    // All three should appear, ordered chronologically.
    expect(pickCardMilestones(j, 5)).toEqual(["event-1", "life-1", "milestone-1"]);
  });

  it("does not blow up if `max` exceeds journal length", () => {
    const j: SavedJournalEntry[] = [entry("only-milestone", "milestone", 0)];
    expect(pickCardMilestones(j, 100)).toEqual(["only-milestone"]);
  });
});

describe("trimMilestoneLine", () => {
  it("returns the input unchanged when shorter than the budget", () => {
    expect(trimMilestoneLine("short line", 90)).toBe("short line");
  });

  it("truncates long lines at a word boundary and appends an ellipsis", () => {
    const long = "the brave courier rode all night through the mountains and arrived at dawn with both saddlebags full";
    const out = trimMilestoneLine(long, 50);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(50);
    // The body before "…" must be a prefix of the original (no cleaved words).
    const body = out.slice(0, -1);
    expect(long.startsWith(body)).toBe(true);
    // The character at the cut point in the original must be a word-boundary
    // (i.e. a space) — confirms we trimmed mid-gap, not mid-token.
    expect(long.charAt(body.length)).toBe(" ");
  });

  it("strips trailing punctuation before the ellipsis", () => {
    const long = "the third anniversary of the kingdom was marked with bells and—a quiet feast under banners.";
    const out = trimMilestoneLine(long, 60);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/[.,;:—–-]…$/);
  });

  it("handles a line one character over budget cleanly", () => {
    const text = "a".repeat(91);
    const out = trimMilestoneLine(text, 90);
    expect(out.length).toBeLessThanOrEqual(90);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("composeCardInput", () => {
  it("threads identity + state into the input record", () => {
    const j: SavedJournalEntry[] = [
      entry("the kingdom was founded", "milestone", 0),
    ];
    const input = composeCardInput({
      kingdomName: "Aurelia",
      monarchName: "Elara",
      petName: "Biscuit",
      bannerColor: "#b45309",
      day: 47,
      year: 2,
      generation: 1,
      journal: j,
    });
    expect(input.kingdomName).toBe("Aurelia");
    expect(input.monarchName).toBe("Elara");
    expect(input.petName).toBe("Biscuit");
    expect(input.day).toBe(47);
    expect(input.year).toBe(2);
    expect(input.generation).toBe(1);
    expect(input.milestones).toEqual(["the kingdom was founded"]);
  });

  it("applies maxLineChars to every milestone", () => {
    const longLine = "x".repeat(200);
    const j: SavedJournalEntry[] = [entry(longLine, "milestone", 0)];
    const input = composeCardInput({
      kingdomName: "K",
      monarchName: "M",
      bannerColor: "#000000",
      day: 1,
      year: 1,
      generation: 1,
      journal: j,
      maxLineChars: 60,
    });
    expect(input.milestones[0].length).toBeLessThanOrEqual(60);
    expect(input.milestones[0].endsWith("…")).toBe(true);
  });
});

describe("pickSparklineSeries", () => {
  it("returns empty on empty input", () => {
    expect(pickSparklineSeries([])).toEqual([]);
  });

  it("returns the input as-is when shorter than `max`", () => {
    expect(pickSparklineSeries([1, 2, 3], 60)).toEqual([1, 2, 3]);
  });

  it("returns the last `max` values when input is longer", () => {
    const big = Array.from({ length: 200 }, (_, i) => i);
    const out = pickSparklineSeries(big, 60);
    expect(out.length).toBe(60);
    expect(out[0]).toBe(140);
    expect(out[59]).toBe(199);
  });

  it("does not mutate the input array", () => {
    const big = [1, 2, 3, 4, 5];
    const before = big.slice();
    pickSparklineSeries(big, 3);
    expect(big).toEqual(before);
  });
});

describe("compactNumber", () => {
  it("renders small numbers without suffix", () => {
    expect(compactNumber(0)).toBe("0");
    expect(compactNumber(7)).toBe("7");
    expect(compactNumber(999)).toBe("999");
  });
  it("uses k for thousands", () => {
    expect(compactNumber(1000)).toBe("1k");
    expect(compactNumber(1234)).toBe("1.2k");
    expect(compactNumber(9999)).toBe("10k");
    expect(compactNumber(50000)).toBe("50k");
  });
  it("uses M for millions", () => {
    expect(compactNumber(1_000_000)).toBe("1M");
    expect(compactNumber(2_500_000)).toBe("2.5M");
  });
  it("guards against non-finite values", () => {
    expect(compactNumber(NaN)).toBe("0");
    expect(compactNumber(Infinity)).toBe("0");
  });
});

describe("composeCardInput — motto", () => {
  it("threads a motto through unchanged when it's already short and clean", () => {
    const input = composeCardInput({
      kingdomName: "K",
      monarchName: "M",
      bannerColor: "#000000",
      day: 1,
      year: 1,
      generation: 1,
      journal: [],
      motto: "By bread and starlight",
    });
    expect(input.motto).toBe("By bread and starlight");
  });

  it("collapses internal whitespace + clamps to 80 chars", () => {
    const long = "x".repeat(120);
    const input = composeCardInput({
      kingdomName: "K",
      monarchName: "M",
      bannerColor: "#000000",
      day: 1,
      year: 1,
      generation: 1,
      journal: [],
      motto: `   hello\t\tworld   ${long}`,
    });
    expect(input.motto!.length).toBeLessThanOrEqual(80);
    // Internal whitespace collapsed to single spaces.
    expect(input.motto).toMatch(/^hello world /);
  });

  it("treats an empty or whitespace-only motto as undefined", () => {
    const input = composeCardInput({
      kingdomName: "K",
      monarchName: "M",
      bannerColor: "#000000",
      day: 1,
      year: 1,
      generation: 1,
      journal: [],
      motto: "   ",
    });
    expect(input.motto).toBeUndefined();
  });

  it("omits motto when the caller didn't pass one", () => {
    const input = composeCardInput({
      kingdomName: "K",
      monarchName: "M",
      bannerColor: "#000000",
      day: 1,
      year: 1,
      generation: 1,
      journal: [],
    });
    expect(input.motto).toBeUndefined();
  });
});

const REIGN_CHAPTER: ReignChapter = {
  chapter: 3,
  title: "The War Years",
  name: "Aldric",
  epithet: "the Iron",
  context: "usurper",
  startYear: 5,
  endYear: 22,
  reignDays: 952,
  population: 18,
  reputation: "feared",
  vaultSize: 4,
  dynastyStreak: 0,
  headline: "The reign of Aldric ended by challenge.",
  highlights: ["A festival lit the keep.", "The harvest came in twofold."],
};

describe("composeReignCardInput", () => {
  it("foregrounds the monarch + era via the heading/subheading/footer overrides", () => {
    const input = composeReignCardInput({
      chapter: REIGN_CHAPTER,
      kingdomName: "Aurelia",
      bannerColor: "#b45309",
    });
    expect(input.heading).toBe("Aldric, the Iron");
    expect(input.subheading).toBe("Chapter III · The War Years");
    expect(input.footerLine).toContain("Aurelia");
    expect(input.footerLine).toContain("5–22");
    expect(input.monarchName).toBe("Aldric");
    expect(input.milestones[0]).toContain("ended by challenge");
    // The reign's highlights sit between the headline and the verdict line.
    expect(input.milestones).toContain("A festival lit the keep.");
    expect(input.milestones[input.milestones.length - 1]).toContain("Deposed by a usurper");
    expect(input.stats?.population).toBe(18);
    expect(input.stats?.vault).toBe(4);
  });
});

describe("reignCardFilename", () => {
  it("includes chapter + monarch and stays URL-safe", () => {
    expect(reignCardFilename("Aurelia", 3, "Aldric")).toBe("aurelia-ch3-aldric-card.png");
    expect(reignCardFilename("New Kingdom!!", 1, "Bob the Brief")).toBe(
      "new-kingdom-ch1-bob-the-brief-card.png",
    );
  });
});

describe("cardFilename", () => {
  it("produces a URL-safe filename", () => {
    expect(cardFilename("Aurelia", 47, 2)).toBe("aurelia-y2d47-card.png");
  });

  it("strips non-alphanumeric characters and collapses runs", () => {
    expect(cardFilename("New Kingdom!! @home", 1, 1)).toBe("new-kingdom-home-y1d1-card.png");
  });

  it("falls back to 'kingdom' when the name is purely punctuation", () => {
    expect(cardFilename("!!!", 1, 1)).toBe("kingdom-y1d1-card.png");
  });
});

// ── Renderer smoke test ────────────────────────────────────────────────
//
// The renderer is mostly mechanical Canvas2D drawing — we don't pixel-test
// it. We DO want to confirm it doesn't throw on any of the shapes the data
// layer produces, including degenerate ones (no milestones, weird hex, etc).

interface MockCtx {
  imageSmoothingEnabled: boolean;
  fillStyle: string;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  calls: Array<{ method: string; args: unknown[] }>;
}

function makeMockCtx(): MockCtx & CanvasRenderingContext2D {
  const mock: MockCtx = {
    imageSmoothingEnabled: true,
    fillStyle: "",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    calls: [],
  };
  const record = (method: string) => (...args: unknown[]) => {
    mock.calls.push({ method, args });
    if (method === "createLinearGradient" || method === "createRadialGradient") {
      // Return a fake gradient with addColorStop
      return { addColorStop: () => {} };
    }
    if (method === "measureText") return { width: 100 };
  };
  const handler: ProxyHandler<MockCtx> = {
    get(t, p: string) {
      if (p in t) return (t as unknown as Record<string, unknown>)[p];
      return record(p);
    },
    set(t, p: string, v) {
      (t as unknown as Record<string, unknown>)[p] = v;
      return true;
    },
  };
  return new Proxy(mock, handler) as unknown as MockCtx & CanvasRenderingContext2D;
}

describe("drawKingdomCard (smoke)", () => {
  it("draws without throwing on a complete input", () => {
    const ctx = makeMockCtx();
    expect(() => {
      drawKingdomCard(ctx, {
        kingdomName: "Aurelia",
        monarchName: "Elara",
        petName: "Biscuit",
        bannerColor: "#b45309",
        day: 47,
        year: 2,
        generation: 1,
        milestones: ["the kingdom was founded", "a wedding at Highkeep"],
      });
    }).not.toThrow();
    expect(ctx.calls.length).toBeGreaterThan(10);
    // Confirm some headline text actually went through fillText.
    const filled = ctx.calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
    expect(filled.some((t) => t.includes("Aurelia"))).toBe(true);
    expect(filled.some((t) => t.includes("Elara"))).toBe(true);
    expect(filled.some((t) => t.includes("Day 47"))).toBe(true);
  });

  it("renders a fallback line when milestones are empty", () => {
    const ctx = makeMockCtx();
    drawKingdomCard(ctx, {
      kingdomName: "New",
      monarchName: "X",
      bannerColor: "#b45309",
      day: 1,
      year: 1,
      generation: 1,
      milestones: [],
    });
    const filled = ctx.calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
    expect(filled.some((t) => t.toLowerCase().includes("chronicle is young"))).toBe(true);
  });

  it("falls back gracefully on an invalid banner color", () => {
    const ctx = makeMockCtx();
    expect(() => {
      drawKingdomCard(ctx, {
        kingdomName: "K",
        monarchName: "M",
        bannerColor: "not-a-hex",
        day: 1,
        year: 1,
        generation: 1,
        milestones: ["one"],
      });
    }).not.toThrow();
  });

  it("draws a portrait inset and caption when sprites are passed", () => {
    const ctx = makeMockCtx();
    // Pass any truthy value as the sprite — the renderer only uses it via
    // ctx.drawImage, which our mock just records.
    const fakeSprite = {} as CanvasImageSource;
    drawKingdomCard(
      ctx,
      {
        kingdomName: "Aurelia",
        monarchName: "Elara",
        petName: "Biscuit",
        bannerColor: "#b45309",
        day: 47,
        year: 2,
        generation: 1,
        milestones: ["a wedding"],
      },
      { monarchSprite: fakeSprite, petSprite: fakeSprite },
    );
    const drawImageCalls = ctx.calls.filter((c) => c.method === "drawImage");
    // Two drawImage calls — one monarch, one pet.
    expect(drawImageCalls.length).toBe(2);
    const filled = ctx.calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
    // The reign caption shows monarch & pet name together.
    expect(filled.some((t) => t.includes("Elara & Biscuit"))).toBe(true);
  });

  it("portrait caption falls back to '<monarch>, sovereign' when no pet is set", () => {
    const ctx = makeMockCtx();
    const fakeSprite = {} as CanvasImageSource;
    drawKingdomCard(
      ctx,
      {
        kingdomName: "K",
        monarchName: "Elara",
        bannerColor: "#b45309",
        day: 1,
        year: 1,
        generation: 1,
        milestones: [],
      },
      { monarchSprite: fakeSprite },
    );
    const filled = ctx.calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
    expect(filled.some((t) => t === "Elara, sovereign")).toBe(true);
  });

  it("portrait inset is skipped entirely when no sprites are provided", () => {
    const ctx = makeMockCtx();
    drawKingdomCard(ctx, {
      kingdomName: "K",
      monarchName: "M",
      bannerColor: "#b45309",
      day: 1,
      year: 1,
      generation: 1,
      milestones: ["x"],
    });
    expect(ctx.calls.filter((c) => c.method === "drawImage").length).toBe(0);
  });

  it("renders the stats badge row when stats are present", () => {
    const ctx = makeMockCtx();
    drawKingdomCard(ctx, {
      kingdomName: "K",
      monarchName: "M",
      bannerColor: "#b45309",
      day: 1,
      year: 1,
      generation: 1,
      milestones: [],
      stats: {
        population: 24,
        gold: 412,
        vault: 7,
        achievementsUnlocked: 14,
        achievementsTotal: 27,
      },
    });
    const filled = ctx.calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
    expect(filled.some((t) => t === "24")).toBe(true);
    expect(filled.some((t) => t === "villagers")).toBe(true);
    expect(filled.some((t) => t === "412")).toBe(true);
    expect(filled.some((t) => t === "14/27")).toBe(true);
  });

  it("stats row skips zero/missing badges (compact even on a new kingdom)", () => {
    const ctx = makeMockCtx();
    drawKingdomCard(ctx, {
      kingdomName: "K",
      monarchName: "M",
      bannerColor: "#b45309",
      day: 1,
      year: 1,
      generation: 1,
      milestones: [],
      stats: {
        population: 12,
        gold: 0,
        vault: 0,
      },
    });
    const filled = ctx.calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
    expect(filled.some((t) => t === "12")).toBe(true);
    expect(filled.filter((t) => t === "gold").length).toBe(0);
  });

  it("draws the sparkline polyline when a populationSeries is provided", () => {
    const ctx = makeMockCtx();
    const fakeSprite = {} as CanvasImageSource;
    drawKingdomCard(
      ctx,
      {
        kingdomName: "K",
        monarchName: "M",
        bannerColor: "#b45309",
        day: 30,
        year: 1,
        generation: 1,
        milestones: [],
        stats: {
          population: 18,
          populationSeries: [10, 11, 12, 13, 14, 15, 16, 17, 18],
        },
      },
      { monarchSprite: fakeSprite },
    );
    expect(ctx.calls.some((c) => c.method === "stroke")).toBe(true);
    expect(ctx.calls.some((c) => c.method === "lineTo")).toBe(true);
  });

  it("CARD_TEMPLATES exposes parchment + heraldic + modern, in that order", () => {
    const ids = CARD_TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(["parchment", "heraldic", "modern"]);
    for (const t of CARD_TEMPLATES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.blurb.length).toBeGreaterThan(0);
    }
  });

  it("renders the motto as a quoted italic line under the subtitle when present", () => {
    const ctx = makeMockCtx();
    drawKingdomCard(ctx, {
      kingdomName: "Aurelia",
      monarchName: "Elara",
      bannerColor: "#b45309",
      day: 1,
      year: 1,
      generation: 1,
      milestones: [],
      motto: "By bread and starlight",
    });
    const filled = ctx.calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
    expect(filled.some((t) => t === `"By bread and starlight"`)).toBe(true);
  });

  it("does not render a quoted motto line when motto is undefined", () => {
    const ctx = makeMockCtx();
    drawKingdomCard(ctx, {
      kingdomName: "Aurelia",
      monarchName: "Elara",
      bannerColor: "#b45309",
      day: 1,
      year: 1,
      generation: 1,
      milestones: [],
    });
    const filled = ctx.calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
    // No fillText call should be a bare-quoted line.
    expect(filled.some((t) => t.startsWith(`"`) && t.endsWith(`"`))).toBe(false);
  });

  it("renders all three templates without throwing", () => {
    const input = {
      kingdomName: "Aurelia",
      monarchName: "Elara",
      petName: "Biscuit",
      bannerColor: "#b45309",
      day: 47,
      year: 2,
      generation: 1,
      milestones: ["a wedding"],
      stats: { population: 12, gold: 100, vault: 3 },
    };
    for (const t of CARD_TEMPLATES) {
      const ctx = makeMockCtx();
      expect(() => {
        drawKingdomCard(ctx, input, { template: t.id });
      }).not.toThrow();
      // Every template should still surface the title.
      const filled = ctx.calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
      expect(filled.some((s) => s.includes("Aurelia"))).toBe(true);
    }
  });

  it("falls back to the parchment theme when an unknown template id is passed", () => {
    const ctx = makeMockCtx();
    expect(() => {
      drawKingdomCard(
        ctx,
        {
          kingdomName: "K",
          monarchName: "M",
          bannerColor: "#b45309",
          day: 1,
          year: 1,
          generation: 1,
          milestones: [],
        },
        // Cast: deliberately invalid id to exercise the fallback path.
        { template: "made-up-template" as unknown as "parchment" },
      );
    }).not.toThrow();
  });

  it("sparkline is skipped when fewer than 2 samples are available", () => {
    const ctx = makeMockCtx();
    const fakeSprite = {} as CanvasImageSource;
    drawKingdomCard(
      ctx,
      {
        kingdomName: "K",
        monarchName: "M",
        bannerColor: "#b45309",
        day: 1,
        year: 1,
        generation: 1,
        milestones: [],
        stats: { population: 1, populationSeries: [1] },
      },
      { monarchSprite: fakeSprite },
    );
    expect(ctx.calls.some((c) => c.method === "stroke")).toBe(false);
  });

  it("uses heading/subheading/footer overrides for a reign card", () => {
    const ctx = makeMockCtx();
    drawKingdomCard(ctx, {
      kingdomName: "Aurelia",
      monarchName: "Aldric",
      bannerColor: "#b45309",
      day: 0,
      year: 22,
      generation: 3,
      milestones: ["The reign of Aldric ended by challenge."],
      heading: "Aldric, the Iron",
      subheading: "Chapter III · The War Years",
      footerLine: "A reign in Aurelia · Years 5–22",
    });
    const filled = ctx.calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
    expect(filled.some((t) => t === "Aldric, the Iron")).toBe(true);
    expect(filled.some((t) => t === "Chapter III · The War Years")).toBe(true);
    expect(filled.some((t) => t === "A reign in Aurelia · Years 5–22")).toBe(true);
    // The default kingdom title + day-stamp must NOT appear when overridden.
    expect(filled.some((t) => t.startsWith("Kingdom of"))).toBe(false);
    expect(filled.some((t) => t.startsWith("Day "))).toBe(false);
  });

  it("renders the Regent wordmark (not the stale KingdomOS one)", () => {
    const ctx = makeMockCtx();
    drawKingdomCard(ctx, {
      kingdomName: "K", monarchName: "M", bannerColor: "#b45309",
      day: 1, year: 1, generation: 1, milestones: [],
    });
    const filled = ctx.calls.filter((c) => c.method === "fillText").map((c) => String(c.args[0]));
    expect(filled.some((t) => t.includes("Regent · jonathanabarnett.github.io/regent"))).toBe(true);
    expect(filled.some((t) => t.includes("KingdomOS"))).toBe(false);
  });
});
