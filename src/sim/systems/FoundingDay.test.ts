import { describe, expect, it } from "vitest";
import { World } from "../World";

describe("FoundingDay", () => {
  it("is idempotent — second fire is a no-op", () => {
    const w = new World({ seed: 42 });
    w.spawnMonarch("Aldric");
    const entries: unknown[] = [];
    w.onJournal = (e) => entries.push(e);
    w.foundingDay.fire();
    const afterFirst = entries.length;
    expect(w.foundingDay.state.fired).toBe(true);
    w.foundingDay.fire();
    expect(entries.length).toBe(afterFirst);
  });

  it("proposes the welcome petition IMMEDIATELY on founding (not day +2)", () => {
    // Playtest signal — three players quit before the original +2-day
    // schedule fired. Now the first thing the player touches is a
    // choice, in the same beat as the fireworks. Verify the decision
    // is in the queue with zero day-advancement.
    const w = new World({ seed: 42 });
    w.spawnMonarch("Aldric");
    expect(w.decisions.current()).toBeNull();
    w.foundingDay.fire();
    expect(w.decisions.current()?.title).toBe("A family at the gate");
  });

  it("falls back to scheduling for +1 day if a decision is already up", () => {
    // Defensive path: if some other system somehow proposed first,
    // reschedule rather than drop.
    const w = new World({ seed: 42 });
    w.spawnMonarch("Aldric");
    w.decisions.propose({
      id: "test_blocker",
      title: "Test",
      body: "",
      expiresAt: Date.now() + 60_000,
      options: [{ id: "ok", label: "OK", onChoose: () => {} }],
    });
    w.foundingDay.fire();
    // Original blocker still on top.
    expect(w.decisions.current()?.id).toBe("test_blocker");
    // Founding schedules two consequences: the rescheduled welcome petition
    // (blocked, so +1 day) and the first-reign fever (+4 days).
    expect(w.consequences.pendingCount()).toBe(2);
    const kinds = w.consequences.state.pending.map((c) => c.kind);
    expect(kinds).toContain("welcome_petition");
    expect(kinds).toContain("first_fever");
  });

  it("resolving the welcome petition schedules a +14-day echo", () => {
    const w = new World({ seed: 7 });
    w.spawnMonarch("Aldric");
    w.foundingDay.fire();
    const id = w.decisions.current()?.id;
    expect(id).toBeTruthy();
    // The "home" option raises a cottage AND schedules the +14 echo.
    w.decisions.resolve(id!, "home");
    // Queue now holds the founding fever (scheduled at fire) + the echo.
    const kinds = w.consequences.state.pending.map((c) => c.kind);
    expect(kinds).toContain("welcome_petition_echo");
    expect(kinds).toContain("first_fever");
    // The cottage is on the map.
    expect(w.map.structures.some((s) => s.kind === "homestead")).toBe(true);
  });

  it("snapshot/restore preserves the fired flag", () => {
    const a = new World({ seed: 42 });
    a.spawnMonarch("Aldric");
    a.foundingDay.fire();
    const snap = a.foundingDay.snapshot();
    const b = new World({ seed: 42 });
    b.foundingDay.restore(snap);
    expect(b.foundingDay.state.fired).toBe(true);
    // Firing again on the restored world is a no-op.
    const entries: unknown[] = [];
    b.onJournal = (e) => entries.push(e);
    b.foundingDay.fire();
    expect(entries.length).toBe(0);
  });
});
