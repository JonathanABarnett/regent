# AI sprite pipeline — local Stable Diffusion + ComfyUI

The goal: generate clean 32×32 (or 64×64) pixel-art sprites locally, free, that drop straight into `public/sprites/` and override the procedural placeholders.

This guide is opinionated. If you've never used ComfyUI before, follow it top-to-bottom and you'll have your first generated castle in 60-90 minutes.

## Fastest path — if you don't want to set up ComfyUI

**Recommended for shipping a first build:** commission 6 sprites on Fiverr or contract a pixel artist for ~$150-300. The hero sprites (castle, town, library, forge, mine, watchtower) cover ~90% of screenshots. The character sprites in the player-designed monarch creator are *already* customized in-engine, so you don't need them rendered.

**If you want AI but don't have a GPU:** rent a Replicate.com instance for the [pixel-art-xl model](https://replicate.com/lucataco/pixel-art-xl) — pay-per-second, ~$0.005 per image. Or use [civitai.com](https://civitai.com) which has free generations via their web UI using community LoRAs.

Skip ahead to **§7 — Batch prompts** if you just want the paste-ready text.

---

## 1. Install ComfyUI

```sh
# Windows
git clone https://github.com/comfyanonymous/ComfyUI
cd ComfyUI
# Use the included portable installer or:
pip install -r requirements.txt
python main.py
```

You should see `Starting server on http://127.0.0.1:8188`.

**GPU requirements:** 6 GB VRAM minimum (SD 1.5 + small LoRA), 12 GB ideal (SDXL).

---

## 2. Download the right models

Drop these into `ComfyUI/models/`:

### Base checkpoint (choose one)

| Model | Path | Why |
|---|---|---|
| **SD 1.5 base** (`v1-5-pruned-emaonly.safetensors`) | `models/checkpoints/` | Fast, low VRAM, best LoRA ecosystem for pixel art |
| **SDXL base 1.0** | `models/checkpoints/` | Higher quality, slower, needs 12+ GB VRAM |

Download from [huggingface.co](https://huggingface.co/runwayml/stable-diffusion-v1-5) or [civitai.com](https://civitai.com).

### Pixel-art LoRAs (choose 1-2)

| LoRA | Civitai search | Notes |
|---|---|---|
| **pixel-art-xl** by nerijs | "pixel art xl" | SDXL-compatible, very tight grid |
| **All-in-One-Pixel-Model** | "all in one pixel model" | SD 1.5, good for 32-64px |
| **PixelArtRedmond** | "pixel art redmond" | SDXL, sharper outlines |
| **Spritesheet LoRA** | "spritesheet pixel" | Specifically for character sheets |

Drop into `models/loras/`.

---

## 3. The prompt formula

Pixel art models respond best to a structured prompt. Use this template:

```
pixel art, 32x32, {subject}, {style modifiers}, limited palette, {color hints},
crisp pixels, transparent background, no anti-aliasing, sprite sheet, SNES-style,
Final Fantasy 6 inspired, Chrono Trigger inspired

Negative: blurry, anti-aliased, soft edges, photorealistic, 3d, smooth, gradient,
high resolution, anime, manga, watermark, signature
```

### Concrete subjects to generate

```
# castle (top-down RPG style)
pixel art, 96x64, stone medieval castle with red banner and crenellations,
limited palette, gray stone, red roof, transparent background, SNES style

# town
pixel art, 96x64, three small medieval houses, red roofs, wooden doors,
warm yellow walls, no people, transparent background, SNES style

# library / scriptorium
pixel art, 64x64, small stone library with purple dome and golden cross,
SNES style, transparent background

# forge
pixel art, 64x64, blacksmith forge with smoke stack and red fire glow,
dark stone, anvil visible, transparent background, SNES style

# mine entrance
pixel art, 64x64, dark mine entrance carved into hillside with wooden support beams,
mining cart tracks, brown rock, transparent background, SNES style

# villager (character sheet, 4 directions × 4 frames = 128x128)
pixel art, 32x32 character sprite, peasant villager, walking animation,
character sheet with 4 directions (down/up/left/right) and 4 walk frames,
brown hair, yellow tunic, transparent background, JRPG, SNES style

# courier
pixel art, 32x32 character sprite, mounted courier with leather satchel,
running animation, brown horse, green cloak, character sheet 4 directions,
transparent background, SNES style

# scholar
pixel art, 32x32 character sprite, robed scholar with book,
purple robe, walking cycle, 4 directions, transparent background, SNES JRPG

# blacksmith
pixel art, 32x32 character sprite, burly smith with leather apron and hammer,
red-brown clothes, 4-direction walk cycle, transparent background, SNES style

# miner
pixel art, 32x32 character sprite, miner with pickaxe and helmet,
gray and brown, walk cycle, 4 directions, transparent background, SNES style

# guard
pixel art, 32x32 character sprite, armored guard with red plume,
red and gold armor, spear, 4-direction walk cycle, transparent background, SNES JRPG

# airship
pixel art, 64x32, fantasy airship with red balloon and wooden gondola,
Final Fantasy style, side view, transparent background

# tile: forest
pixel art, 32x32 tileable forest grass tile, single tree with dark green leaves,
warm green grass, SNES top-down RPG, transparent background, tileable

# tile: ocean
pixel art, 32x32 tileable ocean water tile, simple wave pattern, dark blue,
SNES top-down RPG, tileable seamlessly, transparent background

# tile: mountain
pixel art, 32x32 tileable mountain rock tile, gray stone with snow cap,
SNES top-down RPG, tileable, transparent background
```

### Sampling settings that work

| Param | SD 1.5 | SDXL |
|---|---|---|
| Sampler | Euler a or DPM++ 2M | DPM++ 2M Karras |
| Steps | 20-25 | 25-30 |
| CFG scale | 7-9 | 5-7 |
| LoRA strength | 0.8-1.0 | 0.7-0.9 |
| Width × Height | 512×512 (then resize) | 768×768 |

You'll generate at higher than target resolution (512 or 768), then downscale + pixel-snap at the end.

---

## 4. Post-processing — the critical step

AI output looks "pixel-art-like" but is almost never aligned to a true pixel grid. Three tools to fix this:

### Option A: PixelOver ($25 one-time, recommended)

[pixelover.io](https://pixelover.io) — drag PNG in, set output resolution to 32×32 or 64×64, it snaps colors and grid. **The fastest workflow.**

### Option B: Aseprite ($20)

[aseprite.org](https://aseprite.org) — open the AI PNG, `Sprite > Sprite Size` → 32×32 with `Nearest neighbor`, then `Edit > Color Quantization` → 16 colors.

### Option C: Free GIMP

`Image > Scale Image` → set width/height to 32 or 64 with `Interpolation: None`. Then `Image > Mode > Indexed` → 16 colors with no dithering.

### Option D: ComfyUI built-in nodes

There's a community node pack `ComfyUI-PixelArt-Detector` that adds pixel-snap and palette-reduce nodes you can chain directly in your workflow — no manual post-processing. Worth installing once you do this regularly.

---

## 5. Slice character sheets

Once you have a `villager.png` that's 128×128 (4 directions × 4 frames at 32×32), use the included script:

```sh
npm run sprites:slice public/sprites/characters/villager.png
```

This script (added at `scripts/slice-sheet.mjs`) inspects the file's dimensions, slices it into the engine's expected frame layout, and updates `public/sprites/manifest.json` for you.

For now you can also just drop the full sheet in and update the manifest's `frames` and `directions` to match what you generated.

---

## 6. Drop in and reload

```
public/sprites/
├── manifest.json              ← list your files here
├── tiles/
│   └── forest_a.png
├── structures/
│   └── castle.png
├── characters/
│   └── villager.png           ← sprite sheet
└── props/
    └── airship.png
```

Update `manifest.json`:

```jsonc
{
  "structures": { "castle": "castle.png" },
  "characters": {
    "villager": { "sheet": "villager.png", "directions": 4, "frames": 4, "frameW": 32, "frameH": 32 }
  }
}
```

Reload the app. The new art replaces the procedural placeholder. Missing entries continue to use the placeholder, so you can ship incrementally.

---

## 6.5. Batch prompts — paste-ready, "ship the six hero sprites"

If your goal is the **minimum viable sprite drop** that transforms every screenshot, generate just these six. Each prompt is ready to paste into ComfyUI's text encoder. Use the same checkpoint + LoRA + seed across all six so they share a visual identity.

```
# Recommended config for this batch
Checkpoint: SDXL base 1.0 + pixel-art-xl LoRA (strength 0.85)
Sampler: DPM++ 2M Karras, 25 steps, CFG 6
Size: 768x768 (downscale to 96x64 for structures, 32x32 for tiles)
Seed: 12345 (reuse across the batch for palette consistency)

# Negative for all:
blurry, anti-aliased, soft edges, photorealistic, 3d, smooth gradient, watermark, signature, multiple objects, scattered, isometric, perspective view
```

### Castle (96×64)
```
pixel art, top-down RPG castle, 96x64, central keep with crenellations and a red flag,
two flanking corner towers with conical caps, arched gatehouse with iron-banded oak door,
arrow-slit windows with warm orange glow inside, weathered gray stone with vertical seams,
small banner cloth in red with brass finial,
SNES Final Fantasy 6 style, JRPG overworld sprite, limited 16-color palette, sharp pixel edges,
transparent background, no anti-aliasing, no shadows
```

### Town (96×64)
```
pixel art, top-down RPG village, 96x64, three medieval cottages clustered together,
warm yellow plaster walls, terracotta tile roofs in red-orange,
small wooden doors with iron hinges, square shuttered windows,
brick chimneys with thin smoke wisps,
warm cobblestone path between buildings,
SNES Final Fantasy 6 style, JRPG overworld sprite, limited 16-color palette, sharp pixel edges,
transparent background, no anti-aliasing
```

### Library / scriptorium (64×64)
```
pixel art, top-down RPG library building, 64x64, stone structure with arched windows
showing rows of books inside, copper dome on top with a small spire,
warm purple-blue stone with cool highlights, golden trim,
heavy oak door with brass knocker, two small lanterns flanking the entrance,
SNES Final Fantasy 6 style, JRPG overworld sprite, limited 16-color palette, sharp pixel edges,
transparent background, no anti-aliasing
```

### Forge (64×64)
```
pixel art, top-down RPG blacksmith forge, 64x64, dark stone building with a tall smoke stack
emitting gray smoke wisps, open work area showing glowing red coals and an anvil,
warm orange light spilling from the open front, sooty walls, iron-banded shutter doors,
tools on the outer wall (hammer, tongs, horseshoe),
SNES Final Fantasy 6 style, JRPG overworld sprite, limited 16-color palette, sharp pixel edges,
transparent background, no anti-aliasing
```

### Mine entrance (64×64)
```
pixel art, top-down RPG mine entrance, 64x64, dark cave mouth carved into a rocky hillside,
sturdy wooden support beams forming a frame, mining cart tracks leading out,
small wooden mining cart half-loaded with ore, a single hanging lantern with a yellow glow,
warm brown rock with cool gray shadows, scattered loose stones,
SNES Final Fantasy 6 style, JRPG overworld sprite, limited 16-color palette, sharp pixel edges,
transparent background, no anti-aliasing
```

### Watchtower (32×64)
```
pixel art, top-down RPG watchtower, 32x64, tall narrow stone tower with a wooden battlement
at the top, a single guard's silhouette barely visible at the lookout slit,
gray-brown weathered stone with vertical seams, conical wood-shingle roof,
small flag on a thin pole at the very top,
SNES Final Fantasy 6 style, JRPG overworld sprite, limited 16-color palette, sharp pixel edges,
transparent background, no anti-aliasing
```

### Where each lands in the manifest
```json
{
  "structures": {
    "castle":     "castle.png",
    "town":       "town.png",
    "library":    "library.png",
    "forge":      "forge.png",
    "mine":       "mine.png",
    "watchtower": "watchtower.png"
  }
}
```

The other structures (shrine, mill, smaller tiles) can be added later; the procedural placeholders cover them gracefully.

### Stretch: NPC character sheets (later)

NPC sprites are 32×32 character sheets — 4 directions × 4 frames = 128×128 total. The pet and monarch already have full creator UIs so the player designs those in-engine; **you only need to commission/generate the supporting cast**: villager, courier, scholar, blacksmith, miner, guard. See §3 above for individual prompts.

---

## 7. Cost & time expectations

| Phase | Time | Cost |
|---|---|---|
| ComfyUI install + LoRA download | 60-90 min | Free |
| First decent generation | +30 min | Free (GPU time) |
| Generate full sprite set (~25 assets) | 2-3 hrs | Free |
| Post-process all 25 sprites in PixelOver | 1-2 hrs | $25 one-time |
| **Total to fully re-skin** | **1 weekend** | **$25** |

If you want to skip the install: subscribe to **Retro Diffusion** ($10/mo) for a browser-based version of this same pipeline. Worth it if you're not going to use SD for other projects.

---

## 8. Quality tips that matter

1. **Generate big, downscale small.** Always 512+ source → 32 or 64 target. Direct-to-32 outputs look muddy.
2. **Reduce colors aggressively.** 12-16 colors per sprite. AI defaults to hundreds.
3. **Match palettes across structures.** Generate them in one batch with the same seed + prompt suffix so they share a visual identity.
4. **Keep backgrounds transparent.** Use `transparent background` in the prompt, then erase any residual color in post-process.
5. **Use the same LoRA for the whole batch.** Switching LoRAs makes characters and tiles look like they're from different games.
