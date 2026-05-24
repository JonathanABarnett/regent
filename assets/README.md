# KingdomOS assets

This directory holds **source files** for everything that isn't code:
sprite work-in-progress (Aseprite `.ase` files), audio sources,
launch/marketing assets, palettes. Runtime files (the PNGs the game
actually loads) live under `public/` — the convention is:

```
assets/             ← editable source files (commit these)
  sprites/          ← .ase files, layered originals
  audio/            ← .bps (BeepBox), .wav stems
  marketing/        ← key art, store-page graphics, GIF source frames
  palette/          ← shared palette files (.gpl, .hex)

public/sprites/     ← exported PNG + atlas JSON (loaded at runtime)
```

When you "ship" art, you export from `assets/` into `public/sprites/`
and commit both. Game players never see the `assets/` dir; it's just
the working room.

---

## What the game uses today vs. what's authored

KingdomOS started with **100% procedural art**: every sprite is drawn
at runtime from a programmatic spec. That's a deliberate brand choice
(every kingdom looks different, no two save files render the same).
The manifest pipeline below lets you replace any subset with authored
pixel art *without* losing the procedural fallback — a sprite that
isn't in the manifest just falls back to the programmatic version.

Run `node scripts/check-assets.mjs` to see what's authored vs. still
procedural at a glance.

---

## The pipeline

```
1. Open assets/sprites/<thing>.ase in Aseprite
2. Edit + save .ase (committed to repo)
3. File → Export Sprite Sheet:
     - Output:  public/sprites/<thing>.png
     - JSON:    optionally pack into atlas.json
4. Edit public/sprites/manifest.json to point at the new file
5. Reload — engine prefers the manifest entry over the procedural fallback
```

The full sprite manifest schema is documented at
[`public/sprites/README.md`](../public/sprites/README.md) — folder
layout, sheet dimensions, frame naming conventions for atlases, and
the Aseprite quick-start.

---

## What's worth authoring first (priority order)

If you're going to spend $20 on Aseprite and a weekend pixeling, do
these in order — biggest visual return first:

1. **Castle** (`structures/castle.png`) — the player's home is on
   screen at all times. The procedural castle is the weakest sprite
   in the game. ~2 hours.
2. **Library, forge, mine, town** (`structures/*.png`) — the four
   building types every kingdom has. ~4 hours total.
3. **Tileset** — `plain`, `forest`, `hill`, `mountain` × 4 variants
   each. ~6 hours. Massive surface area, biggest "this looks
   handcrafted now" moment.
4. **Character sheets** (last). The procedural CharacterSpec is
   actually the project's strongest feature — players design their own
   monarch, and replacing it with a fixed sprite removes the
   personalisation. **Keep characters procedural unless you have a
   reason not to.**

Estimated total: ~2 weekends to author the high-impact set.

---

## Palette

A shared palette lives at [`palette/kingdomos.gpl`](palette/kingdomos.gpl)
— GIMP/Aseprite format, ~32 colours. Load it in Aseprite via
**Edit → Preferences → Palette → Load Palette** so every sprite stays
in the same colour family. Matches the values documented in
`public/sprites/README.md` under "Colour palette reference".

---

## Other production tools you'll probably want

| Job | Tool | Cost | Used for |
|---|---|---|---|
| Pixel art | **Aseprite** | $20 | Sprites, tilesets, UI elements |
| Chiptune music | **BeepBox** (web) or **Bosca Ceoil** | Free | Replace the procedural drone pad |
| 8-bit SFX | **jsfxr** (web) or **sfxr** | Free | Better menu blips, fanfares |
| Promo GIFs | **ScreenToGif** (Windows) | Free | itch.io / Steam / social posts |
| Trailer video | **Shotcut** / **DaVinci Resolve** | Free | 60–90s launch trailer |
| Store-page mockups | **Photopea** (web) or Aseprite | Free / $20 | itch.io banner, Steam capsule |

None of these are required to ship — the game runs fine on its
procedural defaults. They're the "raise the ceiling" tools when you
decide a category is the weak link.

---

## Asset README index

- [`sprites/README.md`](sprites/README.md) — source-file conventions for the Aseprite working dir
- [`audio/README.md`](audio/README.md) — audio source files + how they feed the engine
- [`marketing/README.md`](marketing/README.md) — launch assets, screenshots, GIFs
- [`palette/kingdomos.gpl`](palette/kingdomos.gpl) — shared 32-colour palette
- [`../public/sprites/README.md`](../public/sprites/README.md) — runtime manifest schema (the canonical reference for sprite file format)
