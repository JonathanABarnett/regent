# Marketing & launch assets

Source files for everything that lives outside the game itself: the
itch.io store page, screenshots, the launch trailer GIF, social
posts, the Steam capsule (if that ever happens).

```
assets/marketing/
├── key-art/              ← the "hero" image — castle at sunset etc.
├── screenshots/          ← raw + edited captures from in-game
├── gifs/                 ← short loops for social / store pages
├── trailer/              ← timeline file + final renders
└── copy/                 ← itch.io page text, Steam description, press kit
```

---

## What you need to ship

### Required (itch.io)

| Asset | Specs | Status |
|---|---|---|
| Cover image | 630×500 PNG | Not started |
| Banner | 960×250 PNG (optional but recommended) | Not started |
| Screenshots | 4–6, 1920×1080 PNG | Use in-game Photo mode (`P` key) |
| Short description | 1–2 sentences | Drafted in task #12 |
| Long description | 200–500 words | Drafted in task #12 |
| Trailer / GIF | 15–30s loop, < 5 MB | Not started |

### Nice-to-have

- **Devlog #1 cover image** — for the first itch.io devlog post
- **Press kit** — folder with logos, screenshots, fact sheet for press
- **Twitter/Bluesky launch graphic** — same content as cover but
  reformatted for 1200×675 cards

---

## Capturing in-game art

The fastest path to good screenshots:

1. Boot the game, find a moment that reads well (festival, dawn,
   cutaway view of NPCs inside their buildings, etc.)
2. Press **P** to open Photo Mode — hides the HUD, lets you tune
   weather + time of day, frames a clean capture
3. Press shutter — the PNG saves to your downloads folder
4. Move the keeper into `assets/marketing/screenshots/` and rename
   it `kingdomos-001-festival-night.png` (so the filename describes
   the moment, not the timestamp)

For GIFs:

1. **ScreenToGif** (free, Windows) is the right tool
2. 480×270 native capture → 2× upscale via nearest-neighbour
3. 12 fps is plenty for the game's pace
4. Keep loops under 5 MB or itch.io strips them out

---

## Recommended capture moments

Things in the game that look interesting on screen:

- **Cutaway view** (X key) — see all NPCs at their stations inside
  buildings simultaneously. Strongest single-frame.
- **Sunset over the castle** — Photo mode lets you scrub time
- **Festival** — fireworks + crowd
- **Storm** — lightning flash + rain particles
- **Snow on rooftops** — winter, day
- **Comet pass** (rare; year 10+) — the night-sky composition
- **Procession to a new monarch's coronation** — succession day

---

## Trailer outline (60s, single take)

A trailer that would actually represent the game:

```
0:00  Wordmark KingdomOS appears, fades up
0:03  Founding moment — "The kingdom of Bramble was founded under Aldric"
0:08  Time-lapse: spring villagers planting, year ticker rolling
0:15  Decision prompt appears, player picks an option
0:20  War sequence — guards march out, distant smoke
0:28  Years pass — old monarch dies, succession journal entry
0:35  Cutaway view reveal — show the dollhouse
0:45  Cult subplot ending — "the shrine stands locked"
0:55  Closing: aerial of a 50-year kingdom, monument in courtyard
0:58  Wordmark + "itch.io/kingdomos"
```

Capture with ScreenToGif or OBS, edit in Shotcut (free) or DaVinci
Resolve (free with a learning curve).

---

## Copy drafts

The itch.io page copy lives at `copy/itch-page.md` once you draft it
— this is the only marketing asset that's purely text. Reference
material:

- `docs/UPDATER.md` — technical docs (not for marketing)
- Existing `index.html` `<meta>` tags — the og:description and
  twitter:description are usable as a starting point

---

## Don't over-invest

The temptation with marketing is to polish forever before you ship.
Don't. Cover image + 4 screenshots + a 15s GIF + 300 words of copy
is enough for a v1 itch page. You can iterate the page after launch
based on what's working.
