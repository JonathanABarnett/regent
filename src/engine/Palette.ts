/**
 * Limited 16-color SNES-flavored sub-palettes. Hex strings are convenient for
 * Pixi v8 which accepts numbers or "#rrggbb".
 */

export type PaletteName = "default" | "snowy" | "desert";

export const TILE_COLORS: Record<string, [string, string, string, string]> = {
  // [base, shade1, shade2, edge]
  ocean:    ["#1e3a8a", "#1d4ed8", "#2563eb", "#0c1f4a"],
  coast:    ["#fde68a", "#fcd34d", "#f59e0b", "#a16207"],
  river:    ["#3b82f6", "#60a5fa", "#93c5fd", "#1e40af"],
  plain:    ["#65a30d", "#84cc16", "#a3e635", "#365314"],
  forest:   ["#166534", "#15803d", "#22c55e", "#052e16"],
  hill:     ["#a16207", "#ca8a04", "#eab308", "#713f12"],
  mountain: ["#78716c", "#a8a29e", "#d6d3d1", "#1c1917"],
  snow:     ["#e7e5e4", "#f5f5f4", "#ffffff", "#a8a29e"],
};

/** Time-of-day color grade — a multiplicative tint applied across the whole canvas.
 *
 * Tuned 2-step: night was originally r=0.30/g=0.32/b=0.55, which crushed greens
 * so hard that forest tiles read as flat brown blocks (trunk + crown became
 * indistinguishable). The whole map turned muddy at night. The current
 * keyframes preserve a clearly nocturnal "moonlight + ambient" feel while
 * keeping enough green/yellow in the multiplier to distinguish terrain
 * features — your eyes can still see hills as hills and forests as forests.
 */
export function dayNightTint(hour: number): { r: number; g: number; b: number } {
  // smooth interpolation across keyframes
  const keyframes: Array<{ h: number; r: number; g: number; b: number }> = [
    { h: 0,  r: 0.58, g: 0.62, b: 0.85 }, // deep night (moonlit, still readable)
    { h: 5,  r: 0.65, g: 0.62, b: 0.78 }, // pre-dawn (cool grey)
    { h: 7,  r: 1.05, g: 0.85, b: 0.70 }, // dawn (warm)
    { h: 10, r: 1.00, g: 1.00, b: 1.00 }, // day
    { h: 16, r: 1.00, g: 0.97, b: 0.92 }, // late afternoon
    { h: 19, r: 1.10, g: 0.75, b: 0.55 }, // dusk (warm)
    { h: 21, r: 0.72, g: 0.70, b: 0.92 }, // evening
    { h: 23, r: 0.60, g: 0.62, b: 0.85 }, // night settling in
    { h: 24, r: 0.58, g: 0.62, b: 0.85 },
  ];
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (hour >= a.h && hour <= b.h) {
      const t = (hour - a.h) / (b.h - a.h);
      return {
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t,
      };
    }
  }
  return { r: 1, g: 1, b: 1 };
}

export function hexToInt(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}
