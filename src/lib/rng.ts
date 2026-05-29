/**
 * Shared deterministic RNG + hashing primitives.
 *
 * Lives in `src/lib/` — the one place BOTH `src/sim/` and `src/engine/`
 * may import from (sim must not import engine, engine must not import
 * sim, but both may import lib). Consolidates three byte-identical
 * `mulberry32` copies (Backstories, Names, WinterCapLayer) and two
 * `hashId` copies (WinterCapLayer, StructureBannerLayer) that had
 * drifted into separate files during rapid iteration.
 *
 * IMPORTANT: the mulberry32 algorithm here is bit-for-bit identical to
 * the previous inline copies. It feeds save-deterministic systems
 * (Names, Backstories) — any change to the math would silently alter
 * every existing kingdom's generated content on reload. Do not "tidy"
 * the constants.
 */

/**
 * mulberry32 — a tiny, fast, seedable PRNG. Returns a function that
 * yields floats in [0, 1). Same seed → same sequence, forever.
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * djb2-style string → unsigned-32 hash. Deterministic across runs.
 * Used to derive a stable per-entity seed from a string id (e.g. a
 * structure id → its banner colour / snow-cap shape).
 */
export function hashId(id: string): number {
  let h = 5381 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h = (((h << 5) + h) + id.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}
