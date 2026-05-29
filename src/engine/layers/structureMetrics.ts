/**
 * Shared sprite-geometry estimates for structure overlay layers
 * (WinterCapLayer, StructureBannerLayer). Both need to know roughly
 * how tall a structure's sprite renders above its footprint so they
 * can place snow caps / banners near the roofline rather than floating
 * above the peak or sinking below it.
 *
 * Consolidated from two near-identical copies that had drifted apart
 * during rapid iteration (the banner layer's copy was missing several
 * kinds). This is the canonical, complete table.
 */

/**
 * Rough visible sprite height in tile units per structure kind.
 * Over-estimating by half a tile is preferable to under — an overlay
 * placed slightly high reads fine; one placed below the roof looks
 * broken.
 */
export function approxSpriteHeightTiles(kind: string): number {
  switch (kind) {
    case "castle":            return 5;
    case "town":              return 4;
    case "library":           return 4;
    case "forge":             return 3.5;
    case "mine":              return 3.5;
    case "mill":              return 3.5;
    case "astronomers_tower": return 4.5;
    case "watchtower":        return 2.5;
    case "shrine":            return 2.5;
    case "obelisk":           return 2.5;
    case "ruin":              return 2;
    case "camp":              return 2;
    case "wellspring":        return 1.5;
    default:                  return 2;
  }
}
