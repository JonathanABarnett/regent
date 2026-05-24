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

  it("schedules the welcome petition for day +2", () => {
    const w = new World({ seed: 42 });
    w.spawnMonarch("Aldric");
    expect(w.consequences.pendingCount()).toBe(0);
    w.foundingDay.fire();
    expect(w.consequences.pendingCount()).toBe(1);
    const c = w.consequences.state.pending[0];
    expect(c.kind).toBe("welcome_petition");
    expect(c.fireDay).toBe(w.state.day + 2);
  });

  it("fires the welcome petition decision on day +2", () => {
    const w = new World({ seed: 7 });
    w.spawnMonarch("Aldric");
    w.foundingDay.fire();
    for (let i = 0; i < 2; i++) {
      w.state.day++;
      w.consequences.tickDay();
    }
    expect(w.decisions.current()?.title).toBe("A petition at the gate");
  });

  it("resolving the welcome petition schedules a +14-day echo", () => {
    const w = new World({ seed: 7 });
    w.spawnMonarch("Aldric");
    w.foundingDay.fire();
    for (let i = 0; i < 2; i++) {
      w.state.day++;
      w.consequences.tickDay();
    }
    const id = w.decisions.current()?.id;
    expect(id).toBeTruthy();
    w.decisions.resolve(id!, "attend");
    // Queue now holds the +14 echo.
    expect(w.consequences.pendingCount()).toBe(1);
    expect(w.consequences.state.pending[0].kind).toBe("welcome_petition_echo");
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
