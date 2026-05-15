# Capturing screenshots for the README, itch.io, and press

The README expects images in `docs/img/`. None ship in the repo — you capture them once and check them in. This doc tells you exactly what to capture, at what aspect ratio, and where it goes.

## The shot list

Capture these six images. Keep them. Use them everywhere.

| # | Filename | Subject | Aspect | Where it goes |
|---|---|---|---|---|
| 1 | `docs/img/hero.png` | Wide overworld shot at golden hour, day/night palette shift visible, monarch+pet in frame | 16:9 | Top of README, itch.io banner, Steam page header |
| 2 | `docs/img/journal.png` | Journal panel open showing 8-10 mixed-kind entries, search bar visible, filter chips visible | 4:3 portrait | README "chronicle" section, itch capsule |
| 3 | `docs/img/stats.png` | Stats panel showing population breakdown, court appointments (all 3 filled), aspirations progress bars | 4:3 portrait | README, marketing tweet thread |
| 4 | `docs/img/character_creator.png` | Character creator open with a finished monarch design (use the hat tab — most colorful) | 16:9 | README "make your monarch" sentence, itch screenshots |
| 5 | `docs/img/photo_mode.png` | Photo mode result — pick the parchment frame style with a quiet daytime scene | 1:1 | Marketing posts, "designed for sharing" sections |
| 6 | `docs/img/event_flow.gif` | 8-15 sec GIF: a Twitch sub fires → new villager spawns → settles in town → journal entry appears | 16:9 | README hero spot below static screenshot, social posts |

## How to capture cleanly

1. **Run a fresh kingdom.** Settings → Found new kingdom → wait until day 5 or so so the journal has real content.
2. **Open dev tools → toggle device toolbar.** Set the viewport to **1920×1080** (or whatever your target display ratio is). This ensures every screenshot is the same canvas size.
3. **Hide what you don't need.** Settings → Streamer Mode hides the HUD entirely if you want a "the world only" shot. Otherwise just close panels you don't care about.
4. **For the GIF**: use [LICEcap](https://www.cockos.com/licecap/) or [ScreenToGif](https://www.screentogif.com/) on Windows. Capture at 30 fps, cap to 15 sec, ~5 MB max.

## Compositional tips that matter

- **Frame the castle in the center third.** It's the project's mascot — every still should have it.
- **Use the dawn or dusk band.** The palette tint is most beautiful 6-9 in-world hours. Day is too flat; night is too dark.
- **Pick a moment with movement.** Even a still capture reads as alive if a courier is mid-route or weather particles are visible.
- **Banner color matters.** Default red is fine, but generating one screenshot with a cool blue banner shows the customization is live.

## Workflow once you've captured them

1. Save into `docs/img/` (create the directory if it doesn't exist — `.gitignore` doesn't exclude it).
2. Add to `README.md` at the indicated locations. Suggested embed:
   ```markdown
   ![KingdomOS](docs/img/hero.png)
   ```
3. Commit `docs/img/*` alongside the README change. Reasonable to include even though they're binary — they only update when something visible changes.
4. For itch.io: just upload directly to the itch page editor. Same files work for Steam.

## What we deliberately DON'T capture

- **Onboarding modal** — never the hero shot. Most players won't see it more than once; showing it suggests setup overhead.
- **Empty kingdom on day 1** — wait until the world has visible activity (couriers, smoke, NPCs).
- **Anything with the dev console open** — kills the magic.
- **Anything during a storm** — the screen is dark and gray. Wait for it to pass.

## When to recapture

After any of the following, re-capture the affected screenshots:
- New visual feature lands (a new structure kind, a new weather effect, a new HUD panel)
- Sprite assets get replaced (programmatic → custom pixel art)
- Major banner/UI redesign
- Right before a release tag

Stale screenshots on the README are the #1 source of "this project looks abandoned" vibes. Refresh them when the codebase moves.
