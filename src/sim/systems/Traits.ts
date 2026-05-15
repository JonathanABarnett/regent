/**
 * NPC personality traits — small flavor data attached to every NPC at spawn.
 * Deterministic given the NPC's seed, so a kingdom regenerated from the same
 * seed always produces the same personalities.
 *
 * Traits are used by:
 *   - Journal (when narrating an NPC's life event, vary the verb)
 *   - NpcInspect tooltip ("Berta · the Smith · joyful")
 *   - Future: speech bubble content, decision dialog flavor
 */

import type { NPCTrait } from "../types";

const ALL_TRAITS: NPCTrait[] = [
  "joyful",
  "grim",
  "curious",
  "stoic",
  "kind",
  "ambitious",
  "anxious",
  "wise",
];

export function traitFor(seed: number): NPCTrait {
  // Mulberry-style hash → bucket
  let s = seed >>> 0;
  s = (s + 0x6d2b79f5) >>> 0;
  s = Math.imul(s ^ (s >>> 15), s | 1);
  s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
  const idx = ((s ^ (s >>> 14)) >>> 0) % ALL_TRAITS.length;
  return ALL_TRAITS[idx];
}

/** Short flavor verb pattern for "[trait] adjective" insertion into journal narration. */
export const TRAIT_EPITHET: Record<NPCTrait, string> = {
  joyful: "ever-cheerful",
  grim: "always-serious",
  curious: "ever-questioning",
  stoic: "quiet",
  kind: "soft-spoken",
  ambitious: "restless",
  anxious: "watchful",
  wise: "old-souled",
};
