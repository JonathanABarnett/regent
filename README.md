# KingdomOS

> A 16-bit fantasy kingdom that lives on your desktop. It runs on its own, reacts to what you're already doing, and tells you stories about a place that's now yours.

[![Tests](https://img.shields.io/badge/tests-379%20passing-brightgreen)](./src) [![TypeScript](https://img.shields.io/badge/typescript-strict-blue)]() [![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-orange)]()

**Play it now:** https://jonathanabarnett.github.io/kingdomos/ — no install required.

KingdomOS is an ambient simulation, not a game. You found a kingdom, name your monarch, design their look, then watch a small SNES-flavored world live its own life — NPCs walk daily schedules, fall in love, raise children, grow old. The economy ticks. Weather rolls in. Seasons turn. A narrative director writes a chronicle of what's happening. When you do real things in the real world (commits to a watched repo, a Twitch sub on your channel, a CPU spike from a build) the kingdom flavors itself accordingly: couriers ride, blacksmiths forge, mines glow.

There are no missions, no fail state, no progress bar. The world keeps running whether you watch or not.

---

## Screenshots

<!--
  Capture these following the directions in docs/SCREENSHOTS.md, then commit them.
  Until you do, this section sits empty — that's intentional.
-->

![KingdomOS hero](docs/img/hero.png)

|  |  |
|---|---|
| ![Journal panel](docs/img/journal.png) | ![Stats panel](docs/img/stats.png) |
| The journal, filterable + exportable | The stats panel with court + aspirations |

See [`docs/SCREENSHOTS.md`](docs/SCREENSHOTS.md) for the exact shot list and capture workflow.

## What it looks like

You boot the app. You're asked for a kingdom name ("Aurelia"), a monarch's name ("Elara"), and the name and kind of a royal companion ("Biscuit the dog"). You're shown a small overworld — castle in the middle, two towns, a forge, a library, a mine — and 12-ish villagers going about their day.

You can:

- **Just watch.** The camera drifts gently between points of interest. NPCs walk to work, eat, sleep, wander. After a few minutes the journal will start to fill: "Berta and Olen were wed at Highkeep," "A storm rolled in from the east," "the ever-cheerful Pim took charge of festival preparations."
- **Step inside any building.** Click a structure → "Step inside" opens a detailed interior view: anvil, forge, library shelves, the throne in the castle hall. The NPCs currently inside show up at their stations with little labels ("Tessa at the anvil", "the monarch on the throne").
- **Or pop the roofs off the whole kingdom.** Press `X` for cutaway / dollhouse mode: every building goes translucent and you see every non-walking villager living their life at their station — the blacksmith hammering, the scholar at the bookshelf, sleepers in their beds. It's a god's-eye view of an ant farm in progress.
- **Click any journal entry to fly there.** Most entries are pinned to a place — a wedding to a home, a forge milestone to the forge, a storm to wherever it broke. Click "go to" next to the entry and the camera snaps to it.
- **Discover landmarks.** Over time the world spontaneously gains things the simulation didn't start with: a ring of standing stones in a forest clearing, the ruin of an older keep at the marsh edge, a hunters' camp on a hillside, a wellspring discovered by a wandering child. Five kinds, drawn from the deterministic seed.
- **Take photos.** Press `P` to freeze the moment in one of five frames (parchment, wood, stone, window, naked). Save it. Share it. The whole app is built around making every screenshot worth keeping.
- **Read your kingdom's chronicle.** Open the Journal panel — day-by-day entries grouped by season and year. Filter by kind. Search by NPC name. Export as a markdown file you can keep.
- **Inspect anyone.** Hover any villager to see their name, role, age, personality trait, partner, and (if they were born in your kingdom) who their parents were.
- **Make small royal decisions.** Sometimes a petition arrives — a stranger at the gates, a merchant's offer, a boundary dispute between two villagers. Choose or ignore; the kingdom responds either way.
- **Watch generations.** Eventually your monarch dies. An heir is named. The kingdom outlives any one ruler. The vault accumulates artifacts across reigns. After your first in-world year passes, the kingdom marks the anniversary.

The whole thing is designed to be left running on a second monitor.

---

## Run it

```sh
npm install
npm run dev        # browser dev mode at http://localhost:5876
npm run tauri:dev  # full desktop app (requires Rust + MSVC on Windows)
```

For a production browser build:

```sh
npm run build      # outputs dist/ — drop on itch.io as an HTML5 game
```

For Tauri desktop binaries:

```sh
npm run tauri:build  # outputs src-tauri/target/release/*.msi (Windows)
```

For one-command releases (creates a tag; CI publishes to itch.io):

```sh
npm run release -- patch  # bumps version, generates changelog, tags
git push --follow-tags    # release.yml does the deploy
```

## What's in it

- **Procedurally generated overworld** (96×64 tiles): forests, mountains, rivers, plains, coast
- **30+ NPCs at peak** with daily schedules, marriages, children with parent tracking, aging, death — every NPC has one of 8 personality traits (joyful, grim, curious, stoic, kind, ambitious, anxious, wise) that flavors how the chronicle talks about them; new arrivals get a one-line backstory ("Calla arrived from the southern road carrying only a small knife and a book of psalms")
- **Royal succession** — when a monarch dies, an heir ascends; your kingdom outlives any one ruler
- **17-section monarch creator** (5 hair styles, 8 hats, 7 hand items, 3 body types, capes, eye accessories, 21 colors × 5 slots) — ~140 billion combinations
- **7-section pet creator** — dog or cat, custom fur/belly/accent, collar/bandana/crown/bow
- **Royal banner** color, applied live to the castle flag
- **Treasury / vault** — artifacts accumulate across all monarchs and are visible in the castle inspector
- **Construction** — periodic offers to build watchtowers, mills, or shrines; they take days to complete and add real structures to the map
- **12 multi-day quest arcs** — traveling scholars, distant banners, festivals, a flood, a cat that won't leave, a lost child found asleep under an oak, an old friend who returns with stories of foreign coastlines, a fence dispute between neighbors that resolves into a shared herb garden, a letter from afar bearing three unfamiliar seals, **a five-day tournament** where heralds proclaim, champions are named, the forge runs late, the lists open at noon, and the champion's cup goes to the vault; each unfolds over 2–5 in-world days
- **10 interactive decision archetypes** — petitions, merchant offers, festival approvals, suspicious strangers, tax levies, pilgrim escorts, boundary disputes, astronomer's portents, a stray dog at the kitchens, anonymous gifts at the keep door
- **21 soft aspirations** — three player-facing goals at a time, rotating from a pool ("reach 25 villagers", "see 5 different monarchs", "collect 10 artifacts", "discover three wonders", "an elder of seventy", "a realm of many trades"). Ignore them if you want; check them off if that's your style
- **Court roles affect the world** — appoint a Royal Advisor (extends decision timers), Captain of the Guard (storms pass less often, threats less likely), or Court Scholar (50% faster tome production). Seats auto-vacate if the appointee dies, and the seated court speaks in the journal occasionally
- **Royal Edicts** — issue one of four 7-day decrees (Hospitality / Letters / Thrift / Open Court). Each is a deliberate short-term commitment with real mechanical bite — the Edict of Letters stacks with the Court Scholar for 2.25× tome production. One active at a time; auto-expires
- **Rare threats with stakes** — 7 flavors (wolves, bandits, beast, raiders, haunting, smugglers, wraith), each with 3 opening lines so repeat encounters never read the same. Decide whether to send the guard (costs gold, may yield treasure), rouse the militia (free, costs no one's sleep), or let it pass (40% chance it worsens). Captain seated cuts threat chance by 60%.
- **90-day history sparklines** — population, gold, vault count, and tomes are tracked per in-world day and rendered as tiny SVG line charts in the Stats panel. Watch your kingdom's arc.
- **Kingdom Vault** — when you found a new kingdom, the previous one isn't lost: its name, last monarch, founding date, generations, final census, and the last 12 milestone journal entries are preserved in a read-only archive (up to 20 kingdoms kept). Browse them from the title screen. *Past kingdoms aren't resumable — they're artifacts, like photos in an album.*
- **The Returning Bloodline** — every so often a descendant of a past monarch arrives at the gates of your current kingdom, settles in, and joins the chronicle. Their surname matches the old monarch's, so the bloodline is visibly woven through the kingdom's journal entries. Closes the loop on the Past Kingdoms Vault — your previous reigns *are still here.*
- **Real-world holidays** — 14 calendar-anchored festivals: solstices, Halloween, Yuletide, New Year, Lovers' Festival, the Greening (Apr), Bloomfest, the Long Walk (Jul), the First Sheaf (Aug), Harvest Moon, Day of Remembrance, Year's End all fire themed festivals when your local date matches
- **Kingdom Anniversary** — when your in-world year rolls over, the chronicle marks it with a rotating flavor line and a low-key festival at the castle
- **Seasonal anchors** — each season turn drops a one-line chronicle entry, picked from 4 variants per season ("Winter took the kingdom in the night. Hearths burned through every house." vs. "First snow fell at dusk and was still falling at dawn. The whole kingdom went quiet.")
- **27 achievements** including **10 hidden mysteries** that appear as "???" until unlocked — discovery rewards for unusual play (six-hour session, century of days, 2000 couriers, etc.)
- **Wall-clock calendar** — the day count tracks real time since the kingdom was founded
- **Day/night cycle** with seasonal palette tints
- **Weather system** (clear / cloudy / rain / storm / snow) with particles
- **Programmatic audio** — Web Audio ambient pad + sparse melody layer (sparse phrases play every 15-40s, tuned to the season + time of day) + 9 event SFX + 5 category chimes. No sound files required. Melody and pad are toggleable in settings.
- **Procedural sprites** for every tile, building, NPC, and pet — real pixel art can be dropped in via a manifest
- **Dashed kingdom border** drawn around your structures — a soft gold convex-hull outline that expands as you build watchtowers, mills, and shrines further out
- **Spatial journal** — every meaningful entry remembers *where* it happened. Click → camera flies there.
- **Two ways to see indoors** — Tier 2 modal (detailed Canvas2D interior, click "Step inside"), Tier 3 dollhouse (whole map at once, press `X`). 13 distinct interior layouts, 29 furniture station types.
- **NPCs de-stack** — multiple villagers sharing a tile each get a small per-NPC offset (deterministic from their seed) so you can actually see who's there.

## The chronicle (your kingdom's journal)

Every meaningful moment becomes a journal entry: a wedding, a birth, a death, a courier ride, a storm, an achievement unlock, a season turn, an anniversary. Entries are tagged by kind and grouped by day.

Open the journal panel and you can:

- **Filter** by kind chips (milestones / life / events / weather / system) — mute the ones you don't care about
- **Search** by any text — type a villager's name to trace every mention of them
- **Export as Markdown** — the `⇩` button downloads a portable `<kingdom>-chronicle-YYYY-MM-DD.md` file you can keep or share. Days are headers, entries are bulleted lines, oldest-first so it reads forward in time like a real chronicle.

The chronicle is the artifact a player would actually want to share — the screenshot worth keeping but in text form.

## Optional integrations

All off by default. Toggle in Settings:

| Source | What it does |
|---|---|
| **Narrative director** | Generates flavor events when the world is quiet. On by default. ~35 distinct phrasings across 8 branches (courier, research, forge, monster, festival, mining, airship, pilgrim). |
| **System monitor** | High CPU spike → mines glow; network burst → airship crosses the map |
| **File watcher** | New file in a watched folder → courier event |
| **Git watcher** | New commit on watched repo → blacksmith or scholar event; merge to main → forge milestone |
| **JSON inbox** | Drop a JSON file in `%APPDATA%/com.jonat.kingdomos/inbox/` → world reacts |
| **Twitch (frontend ready)** | Follow → courier; sub → new villager named after subber; bits → gold to treasury; raid → airship + companions |

See [`docs/EVENT_SCHEMA.md`](docs/EVENT_SCHEMA.md) for the JSON schema and [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) for setup.

## Streamer mode

Toggle in Settings → renders KingdomOS as an OBS-friendly browser source: HUD hides, a small Twitch-event ticker appears top-right. Subscribers become villagers in your kingdom. Raids arrive as airships. Bits trickle into the treasury. The streamer's channel name is shown as a discreet badge.

## Keyboard shortcuts

```
WASD / arrows  pan camera (Shift = fast)
Space          follow random NPC
F              center on castle
R              resume autopilot drift
P              photo mode (framed screenshot)
X              cutaway / dollhouse mode — see NPCs inside buildings
,  .           slow / speed up sim
/              toggle pause
? / H          help overlay
Esc            close any panel
```

Mouse: click NPC → camera follows; click structure → inspector → "Step inside"; drag → pan (with inertia when you flick-release); wheel → zoom. Pointer events back the drag, so touch and pen and middle-click all work. Cursor flips `grab` → `grabbing` while you drag.

## Architecture

```
src/sim/     — headless simulation, no rendering, fully testable
src/engine/  — PixiJS rendering, reads sim, never writes
src/ui/      — React UI panels and overlays
src/store/   — Zustand store for UI-visible state
src/lib/     — shared utilities (sanitization, etc.)
src-tauri/   — Rust desktop shell (tray, window modes, ambient signal sources)
```

Strict separation. `src/sim/` files cannot import from `pixi.js`. The render layer subscribes to sim state but is forbidden from mutating it. This pays off in three places: tests are fast (no PixiJS in the harness), the renderer can pause without freezing the world, and replay/save-load is trivially correct.

Determinism is enforced via `world.rand` (a seeded `mulberry32` PRNG). Two players who start with the same seed get the same NPC roster, the same quest arcs in the same order, the same decision IDs, and the same trait assignments. Same kingdom — same chronicle.

See [`CLAUDE.md`](CLAUDE.md) for the full architectural tour, including recipes for adding new event kinds, building kinds, achievements, quest arcs, and NPC roles.

## Testing & quality

```sh
npm test            # one-shot (~1.5s)
npm run test:watch  # watch mode
npm run typecheck   # tsc -b strict
```

**379 tests across 32 files.** TypeScript strict mode. Hardened against:

- Twitch raid floods (NPC + effect runtime caps)
- Tampered save files (clamps NaN, drops unknown roles, caps roster, validates parent ids)
- Oversized event labels (5-min cap on `duration_ms`, byte caps on every string)
- Prototype pollution in event meta (`__proto__` / `constructor` keys dropped)
- Bidi-override and zero-width character impersonation in names
- Out-of-bounds pathfinding requests
- Newborn save-load drift (children born in a prior session are now reconstructed on reload)
- Quest/decision non-determinism (every roll flows through the seeded RNG)

The full threat model is documented in [`SECURITY.md`](SECURITY.md).

## Releases & automation

The repo ships with a complete release pipeline:

- **Pre-commit hook** — runs typecheck + tests before every commit (`npm run hooks:install` to enable)
- **CI on every push** — `.github/workflows/test.yml` typechecks, tests, and builds, uploading `dist/` as an artifact
- **Tag-triggered releases** — `npm run release -- patch` bumps version, regenerates `CHANGELOG.md`, commits, tags. Pushing the tag triggers `release.yml` which deploys `dist/` to itch.io via Butler.
- **Nightly health check** — `.github/workflows/nightly.yml` runs daily at 03:00 UTC; on failure it auto-opens a GitHub issue.
- **Dependabot** — weekly npm and cargo bumps, monthly action bumps.

Full reference in [`docs/AUTOMATION.md`](docs/AUTOMATION.md).

## Tech stack

| Layer | Choice |
|---|---|
| Desktop | Tauri 2 |
| Frontend | React 18 + TypeScript + Vite 5 |
| Rendering | PixiJS v8 (WebGL) |
| State | Zustand |
| Validation | Zod |
| Tests | Vitest |
| Audio | Web Audio API (programmatic, no assets) |
| Procgen | simplex-noise |

## Custom art

KingdomOS ships with programmatic sprites for everything. To replace them with real pixel art, drop PNGs into `public/sprites/<kind>/` and list them in `public/sprites/manifest.json`. See [`docs/AI_SPRITES.md`](docs/AI_SPRITES.md) for a full pipeline using Stable Diffusion + ComfyUI.

The monarch sprite is permanently player-designed — there's no artwork to replace there. Same for the pet, banner color, and (most) particle effects.

## Distribution paths

- **GitHub Pages** — live demo at https://JonathanABarnett.github.io/kingdomos/ (auto-deployed on every push to `main` via `.github/workflows/pages.yml`). Free, no setup beyond enabling Pages in repo settings.
- **itch.io HTML5** — `npm run build`, zip `dist/`, upload. Pay-what-you-want or free. No Rust needed. Or set up the GitHub secrets and let `npm run release` push for you.
- **Steam (desktop)** — `npm run tauri:build` on a Rust-enabled machine, package the `.msi`, submit to Steam Direct.
- **OBS Browser Source** — point at your running dev URL with Streamer Mode on; viewers see your kingdom react to their subs in real time.

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — full developer / architecture reference
- [`SECURITY.md`](SECURITY.md) — threat model (12 vectors) and mitigations
- [`MARKETING.md`](MARKETING.md) — full pre-launch marketing kit (product descriptions, Steam/itch copy, tweet drafts, press templates, trailer scripts)
- [`docs/EVENT_SCHEMA.md`](docs/EVENT_SCHEMA.md) — v1 event JSON reference
- [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) — wiring git / fs / CPU / inbox / Twitch
- [`docs/AUTOMATION.md`](docs/AUTOMATION.md) — release pipeline reference
- [`docs/AI_SPRITES.md`](docs/AI_SPRITES.md) — pixel-art pipeline via ComfyUI

## License

[MIT](LICENSE). The code is yours to fork. The name "KingdomOS" is reserved for the canonical build at [github.com/JonathanABarnett/kingdomos](https://github.com/JonathanABarnett/kingdomos); please rename your fork if you publish a derivative work.

## Acknowledgments

Final Fantasy 6 for the overworld template, Chrono Trigger for the pacing, every cozy game from Stardew Valley to *A Short Hike* for proving that low-stakes worlds are worth building.
