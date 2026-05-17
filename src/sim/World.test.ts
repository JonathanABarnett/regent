import { describe, expect, it } from "vitest";
import { World, WORLD_CAPS } from "./World";
import { makeEvent } from "./events/EventSchema";
import { mapTwitchSub, mapTwitchRaid } from "./events/EventMapper";

/**
 * World construction is heavy (procgen), so each test pays a one-time
 * generation cost. Suite is still fast (<1s in CI).
 */
describe("World — runtime caps", () => {
  it("respects npc cap on twitch_sub flood", () => {
    const w = new World({ seed: 42 });
    const start = w.npcs.length;
    // Try to spawn way more NPCs than the cap allows
    for (let i = 0; i < WORLD_CAPS.npcs + 50; i++) {
      w.publish(mapTwitchSub(`viewer_${i}`, 1));
    }
    expect(w.npcs.length).toBeLessThanOrEqual(WORLD_CAPS.npcs);
    // Cap should have been reached
    expect(w.npcs.length).toBeGreaterThan(start);
  });

  it("respects npc cap on twitch_raid bomb", () => {
    const w = new World({ seed: 42 });
    // One huge raid (viewers caps internally to 10k → companion count caps at 6)
    w.publish(mapTwitchRaid("RaidLord", 9_999_999));
    expect(w.npcs.length).toBeLessThanOrEqual(WORLD_CAPS.npcs);
  });

  it("caps effects at WORLD_CAPS.effects under spam", () => {
    const w = new World({ seed: 42 });
    for (let i = 0; i < WORLD_CAPS.effects * 3; i++) {
      w.publish(
        makeEvent("forge", {
          id: `spam_${i}`,
          source: "inbox",
          duration_ms: 60_000,
          payload: { structure: "ironhearth", label: "spam" },
        }),
      );
    }
    expect(w.effects.length).toBeLessThanOrEqual(WORLD_CAPS.effects);
  });

  it("caps couriers under spam", () => {
    const w = new World({ seed: 42 });
    for (let i = 0; i < WORLD_CAPS.couriers * 3; i++) {
      w.publish(
        makeEvent("courier", {
          id: `c_${i}`,
          source: "github",
          duration_ms: 60_000,
          payload: { from: "rivermouth", to: "highkeep", label: "spam" },
        }),
      );
    }
    expect(w.couriers.length).toBeLessThanOrEqual(WORLD_CAPS.couriers);
  });
});

describe("World — adversarial payloads", () => {
  it("publishRaw rejects malformed JSON-ish input", () => {
    const w = new World({ seed: 42 });
    expect(w.publishRaw(null).ok).toBe(false);
    expect(w.publishRaw(undefined).ok).toBe(false);
    expect(w.publishRaw({}).ok).toBe(false);
    expect(w.publishRaw("hello").ok).toBe(false);
    expect(w.publishRaw({ v: 1 }).ok).toBe(false);
  });

  it("publishRaw rejects oversized labels", () => {
    const w = new World({ seed: 42 });
    const r = w.publishRaw({
      v: 1,
      id: "x",
      ts: 0,
      kind: "courier",
      payload: { label: "A".repeat(50_000) },
    });
    expect(r.ok).toBe(false);
  });

  it("publishRaw accepts valid events and adds them to the bus", () => {
    const w = new World({ seed: 42 });
    const before = w.bus.recent().length;
    const r = w.publishRaw({
      v: 1,
      id: "good",
      ts: 0,
      kind: "courier",
      payload: { from: "rivermouth", to: "highkeep" },
    });
    expect(r.ok).toBe(true);
    expect(w.bus.recent().length).toBe(before + 1);
  });

  it("unknown 'from'/'to' landmarks don't crash courier spawn", () => {
    const w = new World({ seed: 42 });
    expect(() =>
      w.publish(
        makeEvent("courier", {
          payload: { from: "nowhere", to: "elsewhere" },
        }),
      ),
    ).not.toThrow();
  });

  it("storm events don't crash with absent duration_ms", () => {
    const w = new World({ seed: 42 });
    expect(() =>
      w.publish(makeEvent("storm", { intensity: 0.5 })),
    ).not.toThrow();
    // state.weather is synced from weather.current inside tick(), so we need
    // at least one tick after publish for the storm to be visible.
    w.tick(0.1);
    expect(w.state.weather).toBe("storm");
  });
});

describe("World — twitch event dedup", () => {
  it("a re-subscriber doesn't spawn a duplicate villager", () => {
    const w = new World({ seed: 42 });
    w.publish(mapTwitchSub("Alice", 1));
    const afterFirst = w.npcs.filter((n) => n.name === "Alice").length;
    w.publish(mapTwitchSub("Alice", 2));
    w.publish(mapTwitchSub("Alice", 3));
    const afterThird = w.npcs.filter((n) => n.name === "Alice").length;
    expect(afterFirst).toBe(1);
    expect(afterThird).toBe(1);
  });
});

describe("World — determinism", () => {
  it("same seed → same map dimensions and structure count", () => {
    const a = new World({ seed: 999 });
    const b = new World({ seed: 999 });
    expect(a.map.width).toBe(b.map.width);
    expect(a.map.height).toBe(b.map.height);
    expect(a.map.structures.length).toBe(b.map.structures.length);
    expect(a.map.structures.map((s) => s.id).sort()).toEqual(
      b.map.structures.map((s) => s.id).sort(),
    );
  });

  it("same seed → same initial NPC names", () => {
    const a = new World({ seed: 12345 });
    const b = new World({ seed: 12345 });
    expect(a.npcs.map((n) => n.name)).toEqual(b.npcs.map((n) => n.name));
  });
});

describe("World — sim tick stability", () => {
  it("tick advances time without throwing", () => {
    const w = new World({ seed: 42 });
    const t0 = w.state.time;
    for (let i = 0; i < 10; i++) w.tick(0.1);
    expect(w.state.time).toBeCloseTo(t0 + 1.0, 4);
  });

  it("tick with dt=0 is a no-op for time", () => {
    const w = new World({ seed: 42 });
    const t0 = w.state.time;
    w.tick(0);
    expect(w.state.time).toBe(t0);
  });

  it("survives a high-frequency event burst plus tick", () => {
    const w = new World({ seed: 42 });
    for (let i = 0; i < 200; i++) {
      w.publish(
        makeEvent("forge", { id: `b_${i}`, source: "inbox", duration_ms: 500 }),
      );
    }
    expect(() => w.tick(0.1)).not.toThrow();
    expect(w.effects.length).toBeLessThanOrEqual(WORLD_CAPS.effects);
  });
});

describe("World — quest/decision determinism", () => {
  it("same seed produces the same arc starts and decision IDs over many days", () => {
    function run() {
      const w = new World({ seed: 12345 });
      const arcStarts: string[] = [];
      const decisionIds: string[] = [];
      const origPropose = w.decisions.propose.bind(w.decisions);
      w.decisions.propose = ((d) => {
        decisionIds.push(d.id);
        return origPropose(d);
      }) as typeof w.decisions.propose;
      // Drive 30 days by repeatedly bumping state.day and ticking Quests
      for (let d = 1; d <= 30; d++) {
        w.state.day = d;
        const before = (w.quests as unknown as { active: { arcId: string } | null }).active;
        w.quests.tick();
        const after = (w.quests as unknown as { active: { arcId: string } | null }).active;
        if (after && after !== before) arcStarts.push(after.arcId);
      }
      return { arcStarts, decisionIds };
    }
    const a = run();
    const b = run();
    expect(a.arcStarts).toEqual(b.arcStarts);
    expect(a.decisionIds).toEqual(b.decisionIds);
  });

  it("different seeds produce at least one diverging quest beat (sanity check)", () => {
    function run(seed: number) {
      const w = new World({ seed });
      const arcStarts: string[] = [];
      for (let d = 1; d <= 50; d++) {
        w.state.day = d;
        const before = (w.quests as unknown as { active: { arcId: string } | null }).active;
        w.quests.tick();
        const after = (w.quests as unknown as { active: { arcId: string } | null }).active;
        if (after && after !== before) arcStarts.push(after.arcId);
      }
      return arcStarts;
    }
    // Two distinct seeds should not yield identical 50-day histories.
    // We can't strictly require difference at day 1, but over 50 days the
    // probability of identical sequences is vanishingly small.
    const a = run(1);
    const b = run(99999);
    expect(a).not.toEqual(b);
  });

  it("decision IDs across multiple proposals in one session are all unique", () => {
    const w = new World({ seed: 7 });
    const ids: string[] = [];
    const origPropose = w.decisions.propose.bind(w.decisions);
    w.decisions.propose = ((d) => {
      ids.push(d.id);
      return origPropose(d);
    }) as typeof w.decisions.propose;
    for (let d = 1; d <= 200; d++) {
      w.state.day = d;
      w.quests.tick();
    }
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
  });
});

describe("World — court effects", () => {
  it("setCourt with no ids leaves all seats vacant", () => {
    const w = new World({ seed: 42 });
    w.setCourt({});
    expect(w.courtEffects.advisorSeated).toBe(false);
    expect(w.courtEffects.captainSeated).toBe(false);
    expect(w.courtEffects.scholarSeated).toBe(false);
  });

  it("setCourt seats advisor when the appointee exists", () => {
    const w = new World({ seed: 42 });
    const someone = w.npcs.find((n) => n.role !== "monarch");
    expect(someone).toBeDefined();
    w.setCourt({ advisorId: someone!.id });
    expect(w.courtEffects.advisorSeated).toBe(true);
  });

  it("setCourt silently ignores an id that doesn't match any live NPC", () => {
    const w = new World({ seed: 42 });
    w.setCourt({ captainId: "npc_nonexistent" });
    expect(w.courtEffects.captainSeated).toBe(false);
  });

  it("advisor seat extends decision auto-expiry from 90s to 180s", () => {
    function expiresAtFor(advisorSeated: boolean): number {
      const w = new World({ seed: 42 });
      if (advisorSeated) {
        const npc = w.npcs[0];
        w.setCourt({ advisorId: npc.id });
      }
      let captured = 0;
      const orig = w.decisions.propose.bind(w.decisions);
      w.decisions.propose = ((d) => {
        captured = d.expiresAt;
        return orig(d);
      }) as typeof w.decisions.propose;
      // Force at least one decision to surface by hammering tick until one fires.
      for (let d = 1; d <= 400 && captured === 0; d++) {
        w.state.day = d;
        w.quests.tick();
      }
      return captured - Date.now();
    }
    const without = expiresAtFor(false);
    const withAdvisor = expiresAtFor(true);
    // Roughly: 90 000ms vs 180 000ms. Allow a few seconds of wall-clock slop
    // (this is wall-clock, not sim time).
    expect(without).toBeGreaterThan(60_000);
    expect(without).toBeLessThan(120_000);
    expect(withAdvisor).toBeGreaterThan(150_000);
    expect(withAdvisor).toBeLessThan(210_000);
  });

  it("captain seat dampens storm transitions in Weather", () => {
    // With the captain seated, transitions that would have produced "storm"
    // should still avoid it from rain/cloudy starts.
    function countStorms(captain: boolean): number {
      const w = new World({ seed: 7 });
      if (captain) {
        const npc = w.npcs[0];
        w.setCourt({ captainId: npc.id });
      }
      // Drive 500 weather rolls from a cloudy starting state.
      type WK = import("./types").WeatherKind;
      w.weather.current = "cloudy";
      let storms = 0;
      // Bypass the timer by calling next() directly via the internal method.
      const next = (w.weather as unknown as { next(c: WK): WK }).next.bind(w.weather);
      let cur: WK = w.weather.current;
      for (let i = 0; i < 500; i++) {
        cur = next(cur);
        if (cur === "storm") storms++;
      }
      return storms;
    }
    const without = countStorms(false);
    const withCaptain = countStorms(true);
    expect(withCaptain).toBeLessThan(without);
  });

  it("scholar seat boosts tome generation rate by 50%", () => {
    function tomesAfter(scholar: boolean): number {
      const w = new World({ seed: 42 });
      if (scholar) {
        const npc = w.npcs[0];
        w.setCourt({ scholarId: npc.id });
      }
      // Tick the economy directly with 4 scholars over 10 sim seconds.
      for (let i = 0; i < 100; i++) w.economy.tick(0.1, 0, 0, 4);
      return w.economy.state.tomes;
    }
    const baseline = tomesAfter(false);
    const boosted = tomesAfter(true);
    expect(boosted).toBeGreaterThan(baseline);
    // 50% boost ≈ 1.5×; allow some slop.
    expect(boosted / baseline).toBeGreaterThan(1.4);
    expect(boosted / baseline).toBeLessThan(1.6);
  });

  it("revalidateCourt clears a seat when the appointee dies", () => {
    const w = new World({ seed: 42 });
    const npc = w.npcs[0];
    w.setCourt({ advisorId: npc.id });
    expect(w.courtEffects.advisorSeated).toBe(true);
    // Remove the NPC (simulating death without driving LifeEvents)
    const idx = w.npcs.findIndex((n) => n.id === npc.id);
    w.npcs.splice(idx, 1);
    w.revalidateCourt();
    expect(w.courtEffects.advisorSeated).toBe(false);
  });

  it("day rollover auto-revalidates the court", () => {
    const w = new World({ seed: 42 });
    const npc = w.npcs[0];
    w.setCourt({ captainId: npc.id });
    expect(w.courtEffects.captainSeated).toBe(true);
    // Kill the captain
    const idx = w.npcs.findIndex((n) => n.id === npc.id);
    w.npcs.splice(idx, 1);
    // Force a day change by hijacking calendar snapshot
    const cal = w.calendar.snapshot();
    (w.calendar as unknown as { snapshot(): typeof cal }).snapshot = () => ({
      ...cal,
      day: cal.day + 1,
    });
    w.tick(0.1);
    expect(w.courtEffects.captainSeated).toBe(false);
  });
});

describe("World — kingdom anniversary", () => {
  it("fires an anniversary milestone when state.year rolls past 1", () => {
    const w = new World({ seed: 42 });
    const entries: string[] = [];
    w.onJournal = (e) => {
      if (e.kind === "milestone") entries.push(e.text);
    };
    // Force the year change by hijacking the calendar snapshot
    const cal = w.calendar.snapshot();
    (w.calendar as unknown as { snapshot(): typeof cal }).snapshot = () => ({
      ...cal,
      year: cal.year + 1,
    });
    w.tick(0.1);
    expect(entries.some((t) => t.includes("anniversary"))).toBe(true);
    expect(entries.some((t) => t.includes("1st"))).toBe(true);
  });

  it("does not fire an anniversary on year 1 (founding only)", () => {
    const w = new World({ seed: 42 });
    const entries: string[] = [];
    w.onJournal = (e) => {
      if (e.kind === "milestone") entries.push(e.text);
    };
    // Initial tick should not fire — year hasn't changed.
    w.tick(0.1);
    expect(entries.some((t) => t.toLowerCase().includes("anniversary"))).toBe(false);
  });

  it("anniversary fires exactly once per year change", () => {
    const w = new World({ seed: 42 });
    const entries: string[] = [];
    w.onJournal = (e) => {
      if (e.kind === "milestone" && e.text.includes("anniversary")) {
        entries.push(e.text);
      }
    };
    const cal0 = w.calendar.snapshot();
    let fakeYear = cal0.year;
    (w.calendar as unknown as { snapshot(): typeof cal0 }).snapshot = () => ({
      ...cal0,
      year: fakeYear,
    });
    // Bump year, tick a few times, bump again
    fakeYear = cal0.year + 1;
    w.tick(0.1);
    w.tick(0.1);
    w.tick(0.1);
    expect(entries.length).toBe(1);
    fakeYear = cal0.year + 2;
    w.tick(0.1);
    expect(entries.length).toBe(2);
    // Distinct ordinals (1st, 2nd)
    expect(entries[0]).toContain("1st");
    expect(entries[1]).toContain("2nd");
  });

  it("anniversary publishes a low-key festival event when a castle exists", () => {
    const w = new World({ seed: 42 });
    const cal = w.calendar.snapshot();
    (w.calendar as unknown as { snapshot(): typeof cal }).snapshot = () => ({
      ...cal,
      year: cal.year + 1,
    });
    w.tick(0.1);
    const fest = w.bus.recent().find(
      (ev) => ev.kind === "festival" && (ev.payload.label ?? "").includes("anniversary"),
    );
    expect(fest).toBeDefined();
  });

  it("anniversary lines cycle through the expanded 10-line pool over a decade", () => {
    // Across 10 anniversaries, every line in the pool should surface at
    // least once (the mod-cycle is deterministic by year, not by seed).
    const w = new World({ seed: 42 });
    const lines: string[] = [];
    w.onJournal = (e) => {
      if (e.kind === "milestone" && e.text.includes("anniversary of the kingdom")) {
        lines.push(e.text);
      }
    };
    const cal0 = w.calendar.snapshot();
    let fakeYear = cal0.year;
    (w.calendar as unknown as { snapshot(): typeof cal0 }).snapshot = () => ({
      ...cal0,
      year: fakeYear,
    });
    // Year 2 = 1st anniversary, ... Year 11 = 10th.
    for (let y = 2; y <= 11; y++) {
      fakeYear = y;
      w.tick(0.1);
    }
    // Years 6 and 11 in the test loop (5th and 10th anniversary) fire landmark
    // prose that doesn't include "anniversary of the kingdom", so the filter
    // above captures 8 of the 10 years. The remaining 8 should all be distinct
    // standard lines from the 10-entry mod-cycling pool.
    expect(lines.length).toBe(8);
    const flavors = lines.map((l) => l.split(" — ").slice(1).join(" — "));
    expect(new Set(flavors).size).toBe(8); // all 8 are distinct
  });
});

describe("World — season anchors", () => {
  it("season turn writes a 'weather' kind entry from the season's pool", () => {
    const w = new World({ seed: 42 });
    const entries: string[] = [];
    w.onJournal = (e) => {
      if (e.kind === "weather") entries.push(e.text);
    };
    // Force a season change to "winter" with day > 1.
    const cal = w.calendar.snapshot();
    (w.calendar as unknown as { snapshot(): typeof cal }).snapshot = () => ({
      ...cal,
      season: cal.season === "winter" ? "spring" : "winter",
      day: cal.day + 1,
    });
    w.tick(0.1);
    expect(entries.length).toBe(1);
    expect(entries[0].length).toBeGreaterThan(30);
  });

  it("season anchor pick is deterministic per (seed, season turn)", () => {
    const runOne = () => {
      const w = new World({ seed: 1234 });
      const cal0 = w.calendar.snapshot();
      // Force a winter turn.
      (w.calendar as unknown as { snapshot(): typeof cal0 }).snapshot = () => ({
        ...cal0,
        season: cal0.season === "winter" ? "spring" : "winter",
        day: cal0.day + 1,
      });
      let result = "";
      w.onJournal = (e) => {
        if (e.kind === "weather") result = e.text;
      };
      w.tick(0.1);
      return result;
    };
    expect(runOne()).toBe(runOne());
  });
});
