import { describe, expect, it } from "vitest";
import { World } from "../World";

describe("Decisions", () => {
  it("starts empty", () => {
    const w = new World({ seed: 42 });
    expect(w.decisions.current()).toBeNull();
  });

  it("propose makes a decision available", () => {
    const w = new World({ seed: 42 });
    w.decisions.propose({
      id: "test",
      title: "Test",
      body: "body",
      expiresAt: Date.now() + 60_000,
      options: [
        { id: "yes", label: "Yes", onChoose: () => {} },
        { id: "no", label: "No", onChoose: () => {} },
      ],
    });
    expect(w.decisions.current()?.id).toBe("test");
  });

  it("resolve fires the chosen option's callback and removes the decision", () => {
    const w = new World({ seed: 42 });
    let chose = "";
    w.decisions.propose({
      id: "test",
      title: "Test",
      body: "body",
      expiresAt: Date.now() + 60_000,
      options: [
        { id: "yes", label: "Yes", onChoose: () => (chose = "yes") },
        { id: "no", label: "No", onChoose: () => (chose = "no") },
      ],
    });
    w.decisions.resolve("test", "yes");
    expect(chose).toBe("yes");
    expect(w.decisions.current()).toBeNull();
  });

  it("resolve with unknown decision id is a no-op", () => {
    const w = new World({ seed: 42 });
    expect(() => w.decisions.resolve("nonexistent", "yes")).not.toThrow();
  });

  it("resolve with unknown option id removes decision without firing", () => {
    const w = new World({ seed: 42 });
    let fired = false;
    w.decisions.propose({
      id: "t",
      title: "T",
      body: "b",
      expiresAt: Date.now() + 60_000,
      options: [{ id: "a", label: "A", onChoose: () => (fired = true) }],
    });
    w.decisions.resolve("t", "bogus");
    expect(fired).toBe(false);
    expect(w.decisions.current()).toBeNull();
  });

  it("tick expires past-due decisions", () => {
    const w = new World({ seed: 42 });
    w.decisions.propose({
      id: "old",
      title: "Old",
      body: "expired",
      expiresAt: Date.now() - 1000,
      options: [{ id: "a", label: "A", onChoose: () => {} }],
    });
    expect(w.decisions.current()?.id).toBe("old");
    w.decisions.tick(Date.now());
    expect(w.decisions.current()).toBeNull();
  });

  it("defaultOnExpire fires the first option's onChoose on expiry", () => {
    const w = new World({ seed: 42 });
    let fired = false;
    w.decisions.propose({
      id: "exp",
      title: "Exp",
      body: "x",
      expiresAt: Date.now() - 1,
      defaultOnExpire: true,
      options: [{ id: "default", label: "D", onChoose: () => (fired = true) }],
    });
    w.decisions.tick(Date.now());
    expect(fired).toBe(true);
  });

  it("expiry without defaultOnExpire silently drops", () => {
    const w = new World({ seed: 42 });
    let fired = false;
    w.decisions.propose({
      id: "exp",
      title: "Exp",
      body: "x",
      expiresAt: Date.now() - 1,
      options: [{ id: "a", label: "A", onChoose: () => (fired = true) }],
    });
    w.decisions.tick(Date.now());
    expect(fired).toBe(false);
    expect(w.decisions.current()).toBeNull();
  });

  it("subscribe fires immediately with current state, then on changes", () => {
    const w = new World({ seed: 42 });
    const seen: (string | null)[] = [];
    const off = w.decisions.subscribe((d) => seen.push(d?.id ?? null));
    expect(seen).toEqual([null]);
    w.decisions.propose({
      id: "x",
      title: "X",
      body: "b",
      expiresAt: Date.now() + 60_000,
      options: [{ id: "a", label: "A", onChoose: () => {} }],
    });
    expect(seen).toEqual([null, "x"]);
    w.decisions.resolve("x", "a");
    expect(seen).toEqual([null, "x", null]);
    off();
  });

  it("multiple decisions queue; resolving exposes the next", () => {
    const w = new World({ seed: 42 });
    w.decisions.propose({
      id: "first",
      title: "First",
      body: "",
      expiresAt: Date.now() + 60_000,
      options: [{ id: "a", label: "A", onChoose: () => {} }],
    });
    w.decisions.propose({
      id: "second",
      title: "Second",
      body: "",
      expiresAt: Date.now() + 60_000,
      options: [{ id: "a", label: "A", onChoose: () => {} }],
    });
    expect(w.decisions.current()?.id).toBe("first");
    w.decisions.resolve("first", "a");
    expect(w.decisions.current()?.id).toBe("second");
  });

  it("freeze pins effectiveNow; unfreeze releases it", () => {
    const w = new World({ seed: 42 });
    expect(w.decisions.isFrozen()).toBe(false);
    w.decisions.freeze();
    expect(w.decisions.isFrozen()).toBe(true);
    const pinned = w.decisions.effectiveNow();
    // effectiveNow is stable while frozen (same value on repeat reads).
    expect(w.decisions.effectiveNow()).toBe(pinned);
    w.decisions.unfreeze();
    expect(w.decisions.isFrozen()).toBe(false);
  });

  it("freeze is idempotent — second freeze doesn't re-pin the clock", () => {
    const w = new World({ seed: 42 });
    w.decisions.freeze();
    const first = w.decisions.effectiveNow();
    w.decisions.freeze();
    expect(w.decisions.effectiveNow()).toBe(first);
  });

  it("unfreeze shifts queued windows forward by the paused duration", () => {
    const w = new World({ seed: 42 });
    const before = Date.now() + 60_000;
    w.decisions.propose({
      id: "p",
      title: "P",
      body: "",
      expiresAt: before,
      defaultOnExpire: true,
      options: [{ id: "a", label: "A", onChoose: () => {} }],
    });
    w.decisions.freeze();
    // While frozen, a tick must NOT expire anything even if the wall clock
    // has nominally passed expiresAt.
    w.decisions.tick(before + 5000);
    expect(w.decisions.current()?.id).toBe("p");
    w.decisions.unfreeze();
    // The window was credited the paused time, so it's still in the future.
    expect(w.decisions.current()!.expiresAt).toBeGreaterThanOrEqual(before);
  });

  it("unfreeze without a prior freeze is a no-op", () => {
    const w = new World({ seed: 42 });
    const exp = Date.now() + 60_000;
    w.decisions.propose({
      id: "p",
      title: "P",
      body: "",
      expiresAt: exp,
      options: [{ id: "a", label: "A", onChoose: () => {} }],
    });
    w.decisions.unfreeze();
    expect(w.decisions.current()!.expiresAt).toBe(exp);
  });

  it("throwing onChoose doesn't break the queue", () => {
    const w = new World({ seed: 42 });
    w.decisions.propose({
      id: "boom",
      title: "Boom",
      body: "",
      expiresAt: Date.now() + 60_000,
      options: [
        {
          id: "a",
          label: "A",
          onChoose: () => {
            throw new Error("intentional");
          },
        },
      ],
    });
    expect(() => w.decisions.resolve("boom", "a")).not.toThrow();
    expect(w.decisions.current()).toBeNull();
  });
});
