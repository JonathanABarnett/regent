# Sprite drop-in directory

The engine loads PNGs listed in `manifest.json` on boot. Anything not listed
falls back to the procedural placeholder sprites generated at runtime, so you
can replace one asset at a time without breaking the world.

## Conventions

- All sprites should use **integer pixel coordinates** with **no anti-aliasing**.
- Power-of-two dimensions are NOT required.
- Backgrounds must be **transparent** (PNG alpha).
- Use a **limited palette** (12–16 colors per sprite is the SNES sweet spot).

## Expected sizes

### Tiles → `tiles/`
- 32×32 PNG per tile, no overhang.
- 1–4 variants per tile kind (e.g. `forest_a.png`, `forest_b.png`). List all of them in the `tiles.<kind>` array.

### Structures → `structures/`
- One PNG per structure kind. Variable size — the engine anchors the **bottom-center** of the image to the bottom-center of the structure's tile footprint.
- Suggested sizes:
  - castle: `128×96` (4×3 tiles)
  - town: `96×64` (3×2 tiles)
  - library: `64×64` (2×2 tiles)
  - forge: `64×64` (2×2 tiles)
  - mine: `64×64` (2×2 tiles)

### Characters → `characters/`
- One **sprite sheet** PNG per role. Default expected layout:
  - 4 rows = directions (south, west, east, north — in that order)
  - 4 cols = animation frames per direction
  - Each cell = 32×32
  - Total sheet = **128×128**
- You can change `directions` / `frames` / `frameW` / `frameH` in the manifest if you generate a different layout.

### Props → `props/`
- One PNG per prop. No animation; size matches the procedural placeholder defaults
  (airship: 64×32, monster: 32×32, particles: 1–4 px, cloud: 64×24).

## Pipeline

```
generate AI sprite          (Retro Diffusion / ComfyUI+LoRA / Scenario)
        │
        ▼
snap to pixel grid          (PixelOver / Aseprite "Pixelate" filter)
        │
        ▼
reduce palette to ~16       (Aseprite or Photoshop indexed mode)
        │
        ▼
slice character sheet       (npm run sprites:slice <input.png>)
        │
        ▼
copy into the right folder
        │
        ▼
add filename to manifest.json
        │
        ▼
reload — your art is live
```

See `docs/AI_SPRITES.md` in the repo root for the full ComfyUI workflow.
