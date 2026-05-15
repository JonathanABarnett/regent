import { makeEvent, type ExternalEvent } from "./EventSchema";
import { sanitizeTwitchUser } from "../../lib/sanitize";

/**
 * Translates ambient signals (from the Rust side) into world events.
 *
 * Each function is a pure mapping; toggle them on/off in settings to control
 * how much real-world activity bleeds into the kingdom.
 */

export function mapGitCommit(branch: string, message: string, repo: string): ExternalEvent {
  return makeEvent("research", {
    source: "github",
    intensity: 0.4,
    payload: {
      structure: "scriptorium",
      label: `${repo}: ${truncate(message, 40)}`,
      meta: { branch },
    },
  });
}

export function mapGitPush(branch: string, repo: string): ExternalEvent {
  return makeEvent("courier", {
    source: "github",
    intensity: 0.6,
    payload: {
      from: "scriptorium",
      to: "highkeep",
      label: `${repo} → ${branch}`,
    },
  });
}

export function mapMergeToMain(repo: string): ExternalEvent {
  return makeEvent("forge", {
    source: "github",
    intensity: 0.8,
    duration_ms: 15_000,
    payload: { structure: "ironhearth", label: `${repo} merged` },
  });
}

export function mapFsCreated(filePath: string): ExternalEvent {
  return makeEvent("courier", {
    source: "fs",
    intensity: 0.3,
    payload: {
      from: "rivermouth",
      to: "highkeep",
      label: shortFile(filePath),
    },
  });
}

export function mapCpuLoad(load: number): ExternalEvent {
  // load 0..1
  return makeEvent("mining", {
    source: "system",
    intensity: clamp01(load),
    duration_ms: 20_000,
    payload: { structure: "deeprock", label: `cpu ${(load * 100).toFixed(0)}%` },
  });
}

export function mapNetworkBurst(): ExternalEvent {
  return makeEvent("airship", {
    source: "system",
    intensity: 0.7,
    duration_ms: 25_000,
    payload: { label: "network burst" },
  });
}

export function mapIdle(): ExternalEvent {
  return makeEvent("celebration", {
    source: "system",
    intensity: 0.3,
    duration_ms: 30_000,
    payload: { structure: "rivermouth", label: "tavern fills" },
  });
}

export function mapBuildSuccess(label: string): ExternalEvent {
  return makeEvent("celebration", {
    source: "inbox",
    intensity: 0.9,
    duration_ms: 8_000,
    payload: { structure: "highkeep", label: `✓ ${label}` },
  });
}

export function mapBuildFailure(label: string): ExternalEvent {
  return makeEvent("storm", {
    source: "inbox",
    intensity: 0.8,
    duration_ms: 30_000,
    payload: { label: `✗ ${label}` },
  });
}

// ── Twitch mappers ────────────────────────────────────────────────────────

export function mapTwitchFollow(username: string): ExternalEvent {
  const u = sanitizeTwitchUser(username);
  return makeEvent("twitch_follow", {
    source: "twitch",
    intensity: 0.4,
    duration_ms: 6000,
    payload: { label: `+${u}`, meta: { user: u } },
  });
}

export function mapTwitchSub(username: string, tier: 1 | 2 | 3 = 1): ExternalEvent {
  const u = sanitizeTwitchUser(username);
  const t = ([1, 2, 3].includes(tier) ? tier : 1) as 1 | 2 | 3;
  return makeEvent("twitch_sub", {
    source: "twitch",
    intensity: 0.6 + (t - 1) * 0.15,
    duration_ms: 10_000,
    payload: { label: `subscribed: ${u}`, meta: { user: u, tier: t } },
  });
}

export function mapTwitchBits(username: string, bits: number): ExternalEvent {
  const u = sanitizeTwitchUser(username);
  // Clamp bits to a sensible range — Twitch caps at ~10k per cheer
  const b = Number.isFinite(bits) ? Math.max(1, Math.min(50_000, Math.floor(bits))) : 1;
  return makeEvent("twitch_bits", {
    source: "twitch",
    intensity: Math.min(1, b / 5000),
    duration_ms: 8_000,
    payload: { label: `${u} cheered ${b}`, meta: { user: u, bits: b } },
  });
}

export function mapTwitchRaid(username: string, viewers: number): ExternalEvent {
  const u = sanitizeTwitchUser(username);
  // Cap viewers — even huge real raids cap somewhere; 10k is plenty.
  const v = Number.isFinite(viewers) ? Math.max(1, Math.min(10_000, Math.floor(viewers))) : 1;
  return makeEvent("twitch_raid", {
    source: "twitch",
    intensity: Math.min(1, v / 100),
    duration_ms: 18_000,
    payload: {
      label: `${u} raided with ${v}`,
      meta: { user: u, viewers: v },
    },
  });
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function shortFile(p: string) {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts.slice(-2).join("/");
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
