import { describe, expect, it } from "vitest";
import { ExternalEvent, makeEvent } from "./EventSchema";

const VALID = {
  v: 1 as const,
  id: "evt-1",
  ts: 1_700_000_000,
  kind: "courier" as const,
  source: "internal" as const,
  intensity: 0.5,
  payload: { from: "rivermouth", to: "highkeep" },
};

describe("EventSchema — happy path", () => {
  it("accepts a well-formed event", () => {
    const r = ExternalEvent.safeParse(VALID);
    expect(r.success).toBe(true);
  });

  it("makeEvent returns a validated event", () => {
    const e = makeEvent("courier", { payload: { label: "PR #1" } });
    expect(e.v).toBe(1);
    expect(e.kind).toBe("courier");
    expect(e.intensity).toBe(0.5);
    expect(e.id.length).toBeGreaterThan(0);
  });
});

describe("EventSchema — adversarial inputs", () => {
  it("rejects non-finite intensity", () => {
    const r = ExternalEvent.safeParse({ ...VALID, intensity: NaN });
    expect(r.success).toBe(false);
  });

  it("clamps intensity above 1 and below 0", () => {
    const hi = ExternalEvent.safeParse({ ...VALID, intensity: 999 });
    expect(hi.success).toBe(true);
    expect(hi.success && hi.data.intensity).toBe(1);

    const lo = ExternalEvent.safeParse({ ...VALID, intensity: -7 });
    expect(lo.success).toBe(true);
    expect(lo.success && lo.data.intensity).toBe(0);
  });

  it("rejects negative ts", () => {
    const r = ExternalEvent.safeParse({ ...VALID, ts: -1 });
    expect(r.success).toBe(false);
  });

  it("rejects unknown kind", () => {
    const r = ExternalEvent.safeParse({ ...VALID, kind: "evil_kind" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown source", () => {
    const r = ExternalEvent.safeParse({ ...VALID, source: "phisher" });
    expect(r.success).toBe(false);
  });

  it("rejects duration_ms over 5 minutes", () => {
    const r = ExternalEvent.safeParse({ ...VALID, duration_ms: 6 * 60 * 1000 });
    expect(r.success).toBe(false);
  });

  it("rejects non-finite duration_ms", () => {
    const r = ExternalEvent.safeParse({ ...VALID, duration_ms: Infinity });
    expect(r.success).toBe(false);
  });

  it("rejects strings far over the per-field 4x raw cap", () => {
    // safeText(120) accepts up to 4x = 480 chars then trims; over that it
    // rejects to keep memory usage bounded.
    const bigLabel = "A".repeat(10_000);
    const r = ExternalEvent.safeParse({
      ...VALID,
      payload: { label: bigLabel },
    });
    expect(r.success).toBe(false);
  });

  it("truncates moderately long strings to 120 chars", () => {
    const moderate = "A".repeat(300);
    const r = ExternalEvent.safeParse({
      ...VALID,
      payload: { label: moderate },
    });
    expect(r.success).toBe(true);
    expect(r.success && (r.data.payload.label?.length ?? 0)).toBeLessThanOrEqual(120);
  });

  it("strips control characters from label", () => {
    const dirty = "hello" + String.fromCharCode(0x00, 0x07) + "world";
    const r = ExternalEvent.safeParse({ ...VALID, payload: { label: dirty } });
    expect(r.success).toBe(true);
    expect(r.success && r.data.payload.label).toBe("helloworld");
  });

  it("strips bidi override characters from label", () => {
    const dirty = "Roan" + String.fromCharCode(0x202e) + "drowsap";
    const r = ExternalEvent.safeParse({ ...VALID, payload: { label: dirty } });
    expect(r.success).toBe(true);
    expect(r.success && r.data.payload.label).toBe("Roandrowsap");
  });

  it("drops dangerous meta keys", () => {
    const r = ExternalEvent.safeParse({
      ...VALID,
      payload: {
        meta: { __proto__: { evil: true }, constructor: { evil: true }, ok: "fine" },
      },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      const m = r.data.payload.meta!;
      // hasOwnProperty (not `m.__proto__`, which would return Object.prototype)
      expect(Object.prototype.hasOwnProperty.call(m, "__proto__")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(m, "constructor")).toBe(false);
      expect(m.ok).toBe("fine");
    }
  });

  it("flattens deeply nested meta values to short strings", () => {
    const r = ExternalEvent.safeParse({
      ...VALID,
      payload: { meta: { nested: { a: { b: { c: "deep" } } } } },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      const v = r.data.payload.meta?.nested;
      expect(typeof v).toBe("string");
    }
  });

  it("coerces NaN meta numbers to 0", () => {
    const r = ExternalEvent.safeParse({
      ...VALID,
      payload: { meta: { bad: NaN, good: 42 } },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.payload.meta?.bad).toBe(0);
      expect(r.data.payload.meta?.good).toBe(42);
    }
  });

  it("rejects empty id", () => {
    const r = ExternalEvent.safeParse({ ...VALID, id: "" });
    expect(r.success).toBe(false);
  });

  it("rejects wrong v", () => {
    const r = ExternalEvent.safeParse({ ...VALID, v: 2 });
    expect(r.success).toBe(false);
  });
});
