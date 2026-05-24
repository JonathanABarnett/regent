# Sprite source files

This is the **working** directory for sprite art — Aseprite `.ase`
files with all their layers, frames, and timelines intact. Exports
land in `public/sprites/` (which is what the game actually loads).

## Convention

```
assets/sprites/
├── structures/
│   ├── castle.ase            ← source
│   ├── library.ase
│   └── ...
├── tiles/
│   ├── plain.ase             ← contains all 4 variants as frames
│   ├── forest.ase
│   └── ...
├── characters/
│   ├── villager.ase          ← 4x4 sheet (south/north/west/east × 4 frames)
│   ├── guard.ase
│   └── ...
└── props/
    ├── airship.ase
    └── ...
```

For each `.ase` file, export to the matching `public/sprites/<category>/<name>.png`
via **File → Export Sprite Sheet** (or **File → Export As** for single frames).

## Aseprite project template

For new character sheets, start with this layout:

- **Canvas:** 128×128
- **Frames:** 16 (4 directions × 4 frames each)
- **Layout (frames left-to-right, top-to-bottom in the timeline):**
  - 0–3: South-facing (idle, walk1, walk2, walk3)
  - 4–7: North-facing
  - 8–11: West-facing
  - 12–15: East-facing
- **Layers:** `body`, `clothes`, `hair`, `outline` — keep separated so you can
  re-colour without redrawing
- **Tags:** name the tag for each direction (`south`, `north`, `west`, `east`)
  so the JSON export picks them up cleanly

## Export settings (Aseprite)

**File → Export Sprite Sheet** with:

- Type: **Horizontal Strip** (for individual sheets) or **Packed** (when contributing to the atlas)
- Frame range: All frames
- Layers: Visible only
- Output: PNG, **transparent background**
- JSON Data: ON, **Array** format
- Texture path: relative (so atlases work portably)

If exporting into the shared atlas (`public/sprites/atlas.png`), give
frames the naming convention from
[`public/sprites/README.md`](../../public/sprites/README.md):

| Pattern | Example |
|---|---|
| `tile_<kind>_<variant>` | `tile_forest_0` |
| `struct_<kind>` | `struct_castle` |
| `char_<role>_<dir>_<frame>` | `char_guard_s_0` |
| `prop_<name>` | `prop_airship` |

## Palette

Load `../palette/kingdomos.gpl` into Aseprite before drawing — keeps
all sprites in the same 32-colour family. The engine applies a
day/night multiply-tint at runtime, so design at full daylight
brightness; the engine will darken for night.

## Git

`.ase` files are binary but git-tracked — they're the source of truth.
Don't `.gitignore` them. Aseprite files are usually small (a few KB
for a single sprite, ~50 KB for a full character sheet).
