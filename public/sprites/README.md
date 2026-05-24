# KingdomOS Sprite Assets

Drop PNG / JSON files into the matching sub-folders, list them in
`manifest.json`, and reload. The engine prefers manifest entries over its
built-in programmatic placeholders — swap assets one category at a time.

> **Working on source files?** The Aseprite `.ase` files and other
> editable originals live in [`../../assets/sprites/`](../../assets/sprites/) —
> this `public/sprites/` directory is exported runtime PNGs only.
> See [`assets/README.md`](../../assets/README.md) for the full source-
> to-distributable pipeline.
>
> Quick audit: `npm run assets:check` — shows which slots are authored
> vs. still using the procedural fallback.

---

## Folder layout

```
sprites/
├── manifest.json          ← list your files here
├── tiles/                 ← 32×32 terrain tiles (PNG)
├── structures/            ← building sprites (variable size, PNG)
├── characters/            ← NPC sprite sheets (PNG, 128×128)
├── props/                 ← effects & misc (PNG)
└── atlas.json + atlas.png ← optional TexturePacker / Aseprite packed atlas
```

---

## Tiles  (`tiles/`)

Each tile kind has **4 variants** (0–3, picked by the procgen map for variety).

- **Size:** 32×32 px, transparent background, no anti-aliasing
- **Colour palette:** 12–16 colours (SNES sweet spot — see Palette section)

List variants in the manifest:
```json
"plain": ["plain_0.png", "plain_1.png", "plain_2.png", "plain_3.png"]
```

### Seasonal tile overrides

Autumn (`forest`, `plain`, `hill`) and winter (`forest`, `plain`, `hill`)
variants are swapped in automatically when the in-world season changes.

```json
"seasonalTiles": {
  "autumn": { "forest": ["forest_autumn_0.png", ...] },
  "winter": { "plain":  ["plain_winter_0.png",  ...] }
}
```

---

## Structures  (`structures/`)

Building sprites are **taller than their tile footprint** to show roofs /
chimneys. The engine aligns the **bottom edge** of the sprite to the bottom
edge of the footprint.

| Structure | Footprint | Recommended sprite |
|---|---|---|
| castle | 4×4 tiles | 128×160 px |
| town | 3×3 tiles | 96×128 px |
| library | 3×3 tiles | 96×128 px |
| forge | 2×3 tiles | 64×112 px |
| mine | 2×3 tiles | 64×112 px |
| watchtower | 1×2 tiles | 32×80 px |
| mill | 2×3 tiles | 64×112 px |
| shrine | 2×2 tiles | 64×80 px |
| astronomers_tower | 2×4 tiles | 64×144 px |
| standing_stones | 2×2 tiles | 64×64 px |
| ruin | 2×2 tiles | 64×64 px |
| camp | 2×2 tiles | 64×64 px |
| wellspring | 1×1 tile | 32×48 px |
| obelisk | 1×2 tiles | 32×80 px |

```json
"structures": { "castle": "castle.png" }
```

---

## Characters  (`characters/`)

Each NPC role uses a **4×4 sprite sheet** — 4 walk frames per direction.

**Sheet size:** 128×128 px (4 cols × 4 rows × 32 px each)

Row order (top → bottom):
```
Row 0 — South  (facing down, toward camera)
Row 1 — North  (walking up)
Row 2 — West   (walking left)
Row 3 — East   (walking right)
```

Column 0 is the **idle/standing** pose; columns 1–3 are the walk cycle.
Walk playback rate: ~6 fps.

```
+----+----+----+----+
| S0 | S1 | S2 | S3 |  ← south (down-facing)
+----+----+----+----+
| N0 | N1 | N2 | N3 |  ← north
+----+----+----+----+
| W0 | W1 | W2 | W3 |  ← west
+----+----+----+----+
| E0 | E1 | E2 | E3 |  ← east
+----+----+----+----+
```

> If you only have south-facing art (1 row), set `"directions": 1` — the
> engine mirrors it for west-facing movement.

```json
"guard": { "sheet": "guard.png", "directions": 4, "frames": 4, "frameW": 32, "frameH": 32 }
```

---

## Props  (`props/`)

One PNG per prop, no animation (particles are single frames).

| Prop | Suggested size |
|---|---|
| airship | 64×32 |
| monster | 32×32 |
| cloud | 64×24 |
| rain_drop, snow_flake, spark, smoke, firework | 4×8 or 8×8 |

---

## TexturePacker / Aseprite atlas  (recommended)

Pack everything into a single `atlas.png + atlas.json` and add it to the
manifest `atlases` array:

```json
"atlases": ["atlas.json"]
```

### Frame naming conventions (used by the atlas loader)

| Pattern | Example | Registers as |
|---|---|---|
| `tile_<kind>_<variant>` | `tile_forest_0` | tile variant |
| `tile_<season>_<kind>_<v>` | `tile_winter_plain_2` | seasonal tile |
| `struct_<kind>` | `struct_castle` | structure sprite |
| `char_<role>_<dir>_<frame>` | `char_guard_s_0` | character frame |
| `prop_<name>` | `prop_airship` | prop sprite |

Direction codes: `s` `n` `w` `e`  
Any frame name not matching a pattern is silently ignored.

---

## Colour palette reference

The engine applies a day/night multiply-tint to the whole world, so sprites
should look correct at full daylight brightness. Design using these base
colours for tile consistency:

```
Ocean    #1e3a8a  #1d4ed8  #2563eb  (deep → bright blue)
Coast    #fde68a  #fcd34d  #f59e0b  (pale → amber sand)
Plains   #65a30d  #84cc16  #a3e635  (dark → bright green)
Forest   #166534  #15803d  #22c55e  (deep → mid green)
Hills    #a16207  #ca8a04  #eab308  (dark → golden amber)
Mountain #78716c  #a8a29e  #d6d3d1  (charcoal → pale grey)
Snow     #e7e5e4  #f5f5f4  #ffffff  (off-white → pure white)
```

---

## Quick-start with Aseprite

1. Create a 128×128 canvas, draw a 4×4 character sheet
2. **File → Export Sprite Sheet → JSON (Array) + PNG** with "Horizontal strip" or grid layout
3. Name frames `char_villager_s_0`, `char_villager_s_1`, ..., `char_villager_e_3`
4. Copy `atlas.json` and `atlas.png` into `public/sprites/`
5. Add `"atlases": ["atlas.json"]` to `manifest.json`
6. Reload — the engine loads it automatically

---

## Programmatic fallback

If a sprite is missing (null in the manifest, or the PNG failed to load), the
engine renders a procedurally-drawn placeholder that approximates the correct
shape and colour. This means you can ship with zero custom art and the game
still runs — the fallbacks look like clean pixel art even if they lack detail.
