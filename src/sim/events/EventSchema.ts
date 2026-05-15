import { z } from "zod";

/**
 * External event schema.
 *
 * Hardened against:
 *   - oversized strings (label/from/to caps prevent DoS-by-text)
 *   - non-finite numbers (NaN, Infinity)
 *   - excessive durations (cap at 5 min so events can't pin in the world forever)
 *   - dangerous meta keys (`__proto__`, `constructor`, `prototype`)
 *   - control characters / unbalanced unicode in displayable text
 *
 * Any malformed event is rejected at the `World.publishRaw` boundary; no
 * partial pass-through.
 */

// Plain string-literal unions; we keep the Zod enums internal for validation.
export type EventKind =
  | "courier"
  | "forge"
  | "research"
  | "mining"
  | "storm"
  | "celebration"
  | "airship"
  | "monster"
  | "festival"
  | "custom"
  | "twitch_follow"
  | "twitch_sub"
  | "twitch_bits"
  | "twitch_raid";

export type EventSource =
  | "github"
  | "fs"
  | "system"
  | "http"
  | "ws"
  | "inbox"
  | "internal"
  | "narrative"
  | "twitch";

const EventKindEnum = z.enum([
  "courier",
  "forge",
  "research",
  "mining",
  "storm",
  "celebration",
  "airship",
  "monster",
  "festival",
  "custom",
  "twitch_follow",
  "twitch_sub",
  "twitch_bits",
  "twitch_raid",
]);

const EventSourceEnum = z.enum([
  "github",
  "fs",
  "system",
  "http",
  "ws",
  "inbox",
  "internal",
  "narrative",
  "twitch",
]);

// ── Sanitizers ─────────────────────────────────────────────────────────────

const MAX_LABEL_LEN = 120;
const MAX_ID_LEN = 64;
const MAX_LANDMARK_LEN = 64;
const MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const DANGEROUS_META_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// Build regexes at runtime so the source stays pure ASCII.
const CTRL_RE = (() => {
  let cls = "";
  for (let i = 0; i <= 0x1f; i++) cls += String.fromCharCode(i);
  cls += String.fromCharCode(0x7f);
  return new RegExp("[" + cls + "]", "g");
})();
const BIDI_RE = (() => {
  const codes = [
    0x200b, 0x200c, 0x200d, 0x200e, 0x200f,
    0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0xfeff,
  ];
  return new RegExp("[" + codes.map((c) => String.fromCharCode(c)).join("") + "]", "g");
})();

/** Strip control chars, RTL/LTR override markers, BOM, and zero-width chars. */
function cleanText(s: string): string {
  return s.replace(CTRL_RE, "").replace(BIDI_RE, "").trim();
}

const safeText = (max: number) =>
  z
    .string()
    .max(max * 4, "string too long")
    .transform((s) => cleanText(s).slice(0, max));

const safeFiniteNumber = z
  .number()
  .refine((n) => Number.isFinite(n), "must be finite");

const safeMeta = z
  .record(z.unknown())
  .transform((obj) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (DANGEROUS_META_KEYS.has(k)) continue;
      if (k.length > 64) continue;
      out[k] = sanitizeMetaValue(v);
    }
    return out;
  });

function sanitizeMetaValue(v: unknown): unknown {
  if (typeof v === "string") return cleanText(v).slice(0, 200);
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "boolean") return v;
  if (v === null) return null;
  // arrays/objects deeper than this are flattened to JSON.stringify-trimmed strings
  if (typeof v === "object") {
    try {
      return JSON.stringify(v).slice(0, 200);
    } catch {
      return null;
    }
  }
  return null;
}

// ── Schema ─────────────────────────────────────────────────────────────────

/**
 * Explicit output type. We don't use `z.infer` here because our heavy use of
 * `.transform()` + `.default()` confuses TypeScript's inference into unknown
 * for some fields. The schema's runtime validation is still the source of
 * truth — this interface just describes the post-validation shape.
 */
export interface ExternalEventPayload {
  from?: string;
  to?: string;
  label?: string;
  structure?: string;
  meta?: Record<string, unknown>;
}

export interface ExternalEvent {
  v: 1;
  id: string;
  ts: number;
  kind: EventKind;
  source: EventSource;
  intensity: number;
  duration_ms?: number;
  payload: ExternalEventPayload;
}

const ExternalEventSchema = z.object({
  v: z.literal(1),
  id: safeText(MAX_ID_LEN).pipe(z.string().min(1, "id required")),
  ts: z.number().int().nonnegative().max(2_000_000_000),
  kind: EventKindEnum,
  source: EventSourceEnum.default("internal"),
  intensity: safeFiniteNumber.transform((n) => Math.max(0, Math.min(1, n))).default(0.5),
  duration_ms: z
    .number()
    .int()
    .positive()
    .max(MAX_DURATION_MS, "duration_ms too large")
    .refine((n) => Number.isFinite(n), "must be finite")
    .optional(),
  payload: z
    .object({
      from: safeText(MAX_LANDMARK_LEN).optional(),
      to: safeText(MAX_LANDMARK_LEN).optional(),
      label: safeText(MAX_LABEL_LEN).optional(),
      structure: safeText(MAX_LANDMARK_LEN).optional(),
      meta: safeMeta.optional(),
    })
    .default({}),
});

/** Compat: parse() returns a typed ExternalEvent. */
export const ExternalEvent = {
  parse: (raw: unknown): ExternalEvent => ExternalEventSchema.parse(raw) as ExternalEvent,
  safeParse: (
    raw: unknown,
  ): { success: true; data: ExternalEvent } | { success: false; error: z.ZodError } => {
    const r = ExternalEventSchema.safeParse(raw);
    if (r.success) return { success: true, data: r.data as ExternalEvent };
    return { success: false, error: r.error };
  },
};

export function makeEvent(
  kind: EventKind,
  partial: Partial<ExternalEvent> = {},
): ExternalEvent {
  return ExternalEvent.parse({
    v: 1,
    id: partial.id ?? cryptoRandomId(),
    ts: partial.ts ?? Math.floor(Date.now() / 1000),
    kind,
    source: partial.source ?? "internal",
    intensity: partial.intensity ?? 0.5,
    duration_ms: partial.duration_ms,
    payload: partial.payload ?? {},
  });
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
