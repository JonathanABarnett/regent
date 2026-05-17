# KingdomOS — Claude / Developer Context

A 16-bit ambient fantasy kingdom that lives on the desktop. Runs autonomously; reacts to real-world signals (git, system, Twitch) as flavor.

> Status at last full pass: **389 tests passing across 29 files · TypeScript strict · production build ~2.7s.** Live demo at https://jonathanabarnett.github.io/kingdomos/ — auto-deployed on every push to `main` via `.github/workflows/pages.yml`.

## TL;DR

```sh
npm install           # one-time
npm run dev           # Vite-only frontend (works in browser; Tauri APIs stub)
npm run tauri:dev     # Full desktop app (needs Rust + MSVC)
npm test              # Vitest suite (389 tests across 29 files)
npm run typecheck     # tsc -b strict
npm run build         # Production bundle → dist/
npm run release       # Tag + push → CI publishes to itch.io
```

## Stack

| Layer | Choice |
|---|---|
| Desktop shell | Tauri 2 (Rust) |
| Frontend | React 18 + TypeScript + Vite 5 |
| Rendering | PixiJS v8 (WebGL) |
| UI state | Zustand |
| Validation | Zod (event schema + save data) |
| Tests | Vitest |
| Audio | Web Audio API (programmatic, no assets) |
| Procgen | simplex-noise |
| Optional | Howler (loaded lazily for future music assets) |

## Architectural pillars

1. **The simulation is autonomous.** The world ticks at 10 Hz with or without input. NPCs have schedules, the economy ticks, weather rolls in, the narrative director writes journal entries. Zero integrations required.
2. **Strict separation: sim ↔ engine ↔ UI.** Files under `src/sim/` have NO imports from `pixi.js`. Files under `src/engine/` read sim state but never write. UI lives in `src/ui/` and reads through the Zustand store.
3. **External events are flavoring.** A clean v1 JSON schema validated by Zod is the only entry point for outside data (`world.publishRaw(unknown)`). Hardened against oversized strings, NaN, prototype pollution, dangerous meta keys, bidi-override impersonation.
4. **Runtime caps everywhere.** 200 NPCs, 100 effects, 50 couriers, 4 pets. Prevents Twitch raid spam / scripted event floods from killing the renderer.
5. **Programmatic art.** All sprites (terrain, structures, NPCs, monarch, pets) drawn from Pixi `Graphics` primitives at boot. Real art swaps in via `public/sprites/manifest.json` — drop a PNG, list it, done.
6. **Identity is sacred.** Once the player founds a kingdom they get a 17-section monarch creator, pet creator, banner color. All persist forever, survive succession.
7. **Determinism from the seed.** Same seed + same in-world day sequence → same NPC roster, same quest arcs, same decision IDs, same trait assignments. RNG flows through `world.rand` (mulberry32). `Math.random()` is only allowed for *transient* effects (sprite jitter, animation tuning) — never anything that should round-trip through a save.
8. **Court seats have real mechanical effects.** Player-appointed Royal Advisor / Captain / Scholar each modify a sim system. Wired via `world.courtEffects` (three booleans) + `world.setCourt(...)` validating ids against the live roster. App.tsx mirrors `identity.court` → `world.setCourt` on change. Day rollover auto-revalidates seats so deaths free them up.
9. **Journal entries are spatial.** Each `SavedJournalEntry` carries an optional `targetStructureId`. Most non-system entries (life events, founding, anniversaries, holidays, threats, court speech, quest phases, courier arrivals, forge/library/mine activity) are pinned to a structure. The journal panel renders a `[ go to ]` button next to each pinned entry; clicking snaps the camera to that structure.
10. **Two interior lenses on the same data.** `src/sim/Interiors.ts` defines a layout (rooms + furniture stations) for every structure kind. The same data drives:
    - **Tier 2** (modal "Step inside" view): click a building → detailed 24px-tile interior + roster — `src/ui/InteriorView.tsx`
    - **Tier 3** (cutaway / dollhouse mode, press `X`): roofs go translucent, every building shows its interior overlay at world scale, non-walking NPCs render at their stations — `src/engine/layers/CutawayLayer.ts` + `src/sim/Associations.ts`

## Directory map

```
src/
├── sim/                      # HEADLESS simulation — no Pixi imports here
│   ├── World.ts              # tick loop, owns all state, event bus subscriber
│   ├── Map.ts                # procgen overworld (simplex noise)
│   ├── Persistence.ts        # save/load with hardened validation + export/import
│   ├── KingdomArchive.ts     # past-kingdoms vault (compact summaries, up to 20)
│   ├── Interiors.ts          # interior layouts + stationFor() for every structure kind
│   ├── Associations.ts       # pure helper: which building is an NPC "inside" right now?
│   ├── types.ts              # NPC, Pet, Structure, WorldState, NPCTrait
│   ├── events/
│   │   ├── EventSchema.ts    # Zod-validated v1 event schema (HARDENED)
│   │   ├── EventBus.ts       # in-process pub/sub
│   │   └── EventMapper.ts    # external signal → world event (system, git, fs, Twitch)
│   └── systems/
│       ├── Pathfinding.ts    # tile A* with iteration cap
│       ├── DayNight.ts       # in-world hour from sim time
│       ├── Weather.ts        # markov-ish weather
│       ├── Schedule.ts       # FF6-style NPC daily routines
│       ├── Economy.ts        # ore → forge → ironwork tick
│       ├── Names.ts          # deterministic NPC name generator (64 first names, 20×20 surname parts)
│       ├── Traits.ts         # 8 deterministic personality traits + epithet table
│       ├── Calendar.ts       # wall-clock anchored day/year/season
│       ├── Journal.ts        # narrative entry writer (subscribes to bus, 5 entry kinds)
│       ├── LifeEvents.ts     # aging, marriage, birth, death (trait-flavored, 7 phrasing variants each)
│       ├── Quests.ts         # 14 multi-day arcs + 10 decision archetypes — all seeded; ArcDef.guard + pickFlavor hooks for stateful arcs
│       ├── Decisions.ts      # interactive decision queue with timed expiry
│       ├── Succession.ts     # monarch death + heir ascension
│       ├── Treasury.ts       # vault of artifacts across all monarchs (cap 200)
│       ├── Construction.ts   # authorize new buildings (watchtower/mill/shrine)
│       ├── NarrativeDirector.ts  # 9 flavor-event branches with ~40 label variants
│       ├── Holidays.ts       # 11 real-world dates trigger themed festivals
│       ├── CourtSpeech.ts    # seated court roles speak in the journal (18 lines)
│       ├── Backstories.ts    # one-sentence arrival origins for new villagers
│       ├── Aspirations.ts    # player-facing soft goals (15 pool, 3 active)
│       ├── History.ts        # per-day snapshots for the stats sparklines (90-day ring)
│       ├── Threats.ts        # rare monster siege → decision; captain seat reduces chance
│       ├── Discoveries.ts    # spontaneous map landmarks (standing_stones, ruin, camp, …)
│       ├── Edicts.ts         # 4 player-issued 7-day royal decrees with real effects (stackable with court seats)
│       ├── NameAStar.ts      # yearly Astronomer's-Tower-unlocked decision: name a new star or dedicate it to a past monarch
│       └── Achievements.ts   # 27 milestone badges (17 visible + 10 hidden mysteries)
├── engine/                   # PIXI RENDERING — reads sim, never writes
│   ├── PixiApp.ts            # bootstraps Pixi v8, runs sim/render ticks
│   ├── Camera.ts             # smooth pan, zoom, follow, autopilot
│   ├── TileRenderer.ts       # parallax + viewport-culled tile map
│   ├── SpriteFactory.ts      # programmatic sprites + manifest override
│   ├── Palette.ts            # tile colors + day/night tint
│   ├── HoverState.ts         # cursor-hovered NPC id (module global)
│   ├── Audio.ts              # Web Audio synth (ambient pad + event SFX)
│   ├── CharacterSpec.ts      # CharacterSpec type + palettes
│   ├── CharacterRenderer.ts  # parameterized 32×32 character draw
│   ├── PetSpec.ts            # PetSpec type + pet draw
│   └── layers/
│       ├── ParallaxBackground.ts
│       ├── StructureLayer.ts    # sprites for buildings, reconciles new ones
│       ├── BorderLayer.ts       # dashed gold convex-hull outline around the kingdom
│       ├── CutawayLayer.ts      # Tier 3 dollhouse overlay — interior decor at world scale
│       ├── EntityLayer.ts       # NPCs, pets, couriers, effects, speech bubbles (incl. cutaway relocation)
│       ├── WeatherLayer.ts      # rain/snow/cloud particles
│       └── CrtOverlay.ts        # scanline + vignette overlay
├── ui/                       # REACT chrome
│   ├── HUD.tsx               # top bar: kingdom name + day + clock + buttons
│   ├── TitleScreen.tsx       # main menu (Continue / New / Settings / Quit)
│   ├── OnboardingModal.tsx   # kingdom + monarch + pet naming (24 suggestions each)
│   ├── CharacterCreator.tsx  # 17-section monarch designer (3 tabs)
│   ├── PetCreator.tsx        # 7-section pet designer
│   ├── StatsDashboard.tsx    # population, economy, vault, court, achievements + mysteries hint
│   ├── JournalPanel.tsx      # day-grouped chronicle + filter chips + search + markdown export
│   ├── journal-utils.ts      # pure filter/export helpers (DOM-independent, fully tested)
│   ├── EventLog.tsx          # raw event stream
│   ├── SettingsPanel.tsx     # toggles, banner, customize, integrations, save export
│   ├── PhotoMode.tsx         # `P` framed screenshot (5 frame styles)
│   ├── HelpOverlay.tsx       # `?` / H keybindings + how-to
│   ├── AboutDialog.tsx       # credits
│   ├── DecisionPrompt.tsx    # quest decision popup
│   ├── CourtPicker.tsx       # pick advisor/captain/scholar
│   ├── NpcInspect.tsx        # hover tooltip (name · role · age · trait · partner · parents)
│   ├── StructureInspector.tsx# click-to-inspect building + "Step inside" entry point
│   ├── InteriorView.tsx      # Tier 2 modal: detailed interior render via Canvas2D
│   ├── interior-renderer.ts  # pure Canvas2D primitives — drawRoom, drawStation, drawNpcAt
│   ├── PastKingdoms.tsx      # read-only archive of past kingdoms (title screen entry)
│   ├── Sparkline.tsx         # tiny SVG line chart used by the stats panel
│   ├── MiniMap.tsx           # corner overworld preview
│   ├── SpeedControl.tsx      # pause/0.5x/1x/2x/3x
│   ├── StreamerOverlay.tsx   # Twitch event ticker (only in streamer mode)
│   ├── ErrorBoundary.tsx
│   ├── TrayMenuBindings.ts   # Tauri tray IPC
│   └── AchievementToast.tsx
├── store/
│   └── useGameStore.ts       # Zustand: events, journal, achievements, identity, settings,
│                             #         monarchSpec, petSpec, seen
├── lib/
│   ├── sanitize.ts           # sanitizeName, sanitizeTwitchUser, sanitizeHexColor
│   └── sanitize.test.ts
├── App.tsx                   # root component — bootstraps everything
└── main.tsx                  # ReactDOM root

src-tauri/                    # RUST desktop shell
├── Cargo.toml
├── tauri.conf.json
└── src/
    ├── main.rs
    ├── lib.rs                # tauri::Builder, command handlers, ambient task spawns
    ├── events.rs             # KingdomEvent struct mirroring the JS schema
    ├── state.rs              # IntegrationToggles + AppState
    ├── tray.rs               # system tray menu
    ├── window.rs             # overlay / fullscreen mode commands
    ├── ambient/
    │   ├── system.rs         # CPU/network monitor → mining/airship events
    │   ├── fs_watcher.rs     # notify-rs file watcher → courier/research
    │   ├── git_watcher.rs    # poll watched repos → courier/forge/research
    │   └── inbox.rs          # JSON file drop folder
    └── plugins/
        └── http.rs           # optional axum POST /events (feature-gated)

public/sprites/               # OPTIONAL custom art drop-in
├── manifest.json             # list PNG overrides here
├── tiles/                    # 32×32 PNGs, 1-4 variants per tile kind
├── structures/               # variable-size PNGs (anchor bottom-center)
├── characters/               # sprite sheets (4 dir × 4 frame)
└── props/                    # particles, airship, monster, cloud

docs/
├── EVENT_SCHEMA.md           # v1 JSON event reference
├── INTEGRATIONS.md           # CPU/git/fs/inbox/Twitch wiring
├── AUTOMATION.md             # release pipeline reference (pre-commit, CI, nightly, dependabot)
└── AI_SPRITES.md             # full ComfyUI + SD pixel-art pipeline

scripts/
├── install-hooks.mjs         # one-time pre-commit hook installer (typecheck + tests)
├── changelog.mjs             # Conventional-Commits grouped changelog generator
├── release.mjs               # bump → tag → push (CI publishes)
├── seed-events.ps1           # PowerShell: drop sample events into inbox
├── slice-sheet.mjs           # CLI: register a character sprite sheet
└── sprite-prompts.md         # paste-ready ComfyUI prompts

.github/workflows/
├── test.yml                  # typecheck + tests + build on every push
├── release.yml               # Butler → itch.io HTML5 channel on v*.*.* tag
└── nightly.yml               # daily 03:00 UTC fresh-install audit, auto-opens issue on fail

.github/dependabot.yml        # weekly npm bumps, monthly action bumps, weekly cargo
```

## Save format & persistence

`localStorage["kingdomos.kingdom.v1"]` holds the entire save as JSON. Tauri also mirrors to `AppData/kingdom.json`. Schema versioned via `SAVE_VERSION` (currently 1) with a migration scaffold in `migrateSave()`.

Every load goes through `validateSave(unknown)` which:
- Caps roster at 500 NPCs, journal at 5000 entries, achievements at 200, artifacts at 200
- Caps `parentIds` per NPC at 2 string entries, filtering non-strings
- Clamps NaN/Infinity positions to 0
- Clamps NPC age to [0, 200]
- Clamps `foundedAtMs` to [2020-01-01, now + 1 day]
- Drops NPCs with unknown roles, journal entries with unknown kinds, artifacts with unknown kinds
- Strips control chars, bidi overrides, HTML from all displayable text

**applySave reconstructs newborns.** Any NPC in the save whose id isn't in the freshly-spawned roster is rebuilt via `world.pushNpc()`. Without this, children born in a prior session were silently dropped — fixed in pass 10.

Autosaves: every 30s, on `visibilitychange` (hidden), on `beforeunload`, on succession event.

To export: Settings → "Export save" downloads a `.kingdomos.json`. Import: file picker → `validateSave` → confirm → reload.

To export the journal as a readable artifact: Journal panel → `⇩` button → `<kingdom>-chronicle-YYYY-MM-DD.md`. Markdown-escaped against user-supplied text.

To wipe: Settings → "Found new kingdom" → confirm → `resetKingdom()` sets a `__kingdomos_skip_save` window flag so the beforeunload save doesn't race-overwrite.

## Event schema (v1)

```jsonc
{
  "v": 1,
  "id": "uuid",
  "ts": 1715212800,
  "kind": "courier" | "forge" | "research" | "mining" | "storm" | "celebration"
       | "airship" | "monster" | "festival" | "custom"
       | "twitch_follow" | "twitch_sub" | "twitch_bits" | "twitch_raid",
  "source": "github" | "fs" | "system" | "http" | "ws" | "inbox"
         | "internal" | "narrative" | "twitch",
  "intensity": 0.0..1.0,
  "duration_ms": int (max 300000),
  "payload": {
    "from"?: string (max 64),
    "to"?: string (max 64),
    "label"?: string (max 120),
    "structure"?: string (max 64),
    "meta"?: Record<string, unknown>
  }
}
```

All strings cap-and-cleanstring. Meta keys `__proto__` / `constructor` / `prototype` are dropped. Nested meta values flattened to JSON-stringified short strings.

## Dev console hook

When the app is running, open devtools:

```js
// Publish any event
window.kingdomos.publish({ v: 1, id: "x", ts: 1, kind: "courier",
  source: "internal", payload: { from: "rivermouth", to: "highkeep", label: "test" } });

// Twitch simulation
window.kingdomos.twitch.sub("Alice", 2);
window.kingdomos.twitch.raid("RaidLord", 99);
window.kingdomos.twitch.bits("Carol", 500);
window.kingdomos.twitch.follow("Eve");

// Inspect world state
window.kingdomos.world().npcs.length;
window.kingdomos.world().npcs[0].trait;     // 'joyful' | 'grim' | …
window.kingdomos.world().treasury.artifacts;
window.kingdomos.world().succession.state;
```

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

Mouse: click NPC → camera follows; click structure → inspector → "Step inside"; drag → pan (with inertia on flick-release); wheel → zoom. Uses pointer events so touch / pen / middle-click all work. Cursor flips `grab` → `grabbing` during a drag.

## Content systems (current state)

| System | Content count |
|---|---|
| Achievements | 27 (17 visible + 10 hidden mysteries) |
| Aspirations (player-facing goals) | 21 in pool, 3 active at a time |
| Quest arcs | 14 (`traveler`, `festival_prep`, `rival_banner`, `scholar_discovery`, `wandering_cat`, `river_flood`, `lost_child`, `old_friend_returns`, `village_well`, `fence_dispute`, `letter_from_afar`, `tournament`, `returning_bloodline`, `long_drought`) |
| Decision archetypes | 10 (petition, merchant, festival, stranger, levy, pilgrim, boundary dispute, astronomer's portent, stray dog, anonymous gift) |
| Narrative director branches | 9 (courier, research, forge, monster, festival, mining, airship, pilgrim, lone fisher) with ~85 label variants |
| Court speech lines | 30 (10 per role × 3 roles), deterministic per seed |
| NPC backstory pools | 10,000 unique sentences (4 pools × 10 entries each) |
| Holidays | 14 (New Year, Lovers' Festival, Equinox, The Greening, Bloomfest, Midsummer, The Long Walk, The First Sheaf, Harvest Moon, Hallowtide, Remembrance, Solstice, Yuletide, Year's End) |
| Seasonal journal anchors | 16 (4 per season, picked via seeded RNG so a save's anchors round-trip identically) |
| Kingdom anniversaries | rotating pool of 10 flavor lines, fires once per year roll after Y1 (10-year no-repeat cycle) |
| NPC personality traits | 8 (joyful, grim, curious, stoic, kind, ambitious, anxious, wise), each with 3 epithet variants (24 total). `epithetFor(trait, seed)` picks one deterministically per NPC. |
| First-name pool | 64 |
| Surname-part pools | 20 left × 20 right |
| Onboarding suggestions | 24 kingdom + 24 monarch + 20 pet names |
| Photo-mode frames | 5 (wood, parchment, stone, window, naked) |
| Audio | procedural drone pad (toggleable) + sparse melody layer (toggleable) + 9 event SFX + 5 category chimes |
| Threat flavors | 7 (wolves, bandits, beast, raiders, haunting, smugglers, wraith), each with 3 opening lines = 21 unique openings — captain seat reduces chance 60% |
| Royal Edicts | 4 (Hospitality, Letters, Thrift, Open Court). 7-day duration; one active at a time. Effects stack with court seats (Letters + Scholar = 2.25× tome rate). |
| Discovered landmarks | 5 kinds (standing stones, ruin, camp, wellspring, obelisk) × 3 opening sentences = 15 flavor variants |
| Stats history retained | 90 in-world days (population, gold, vault, tomes as sparklines) |
| Interior layouts | 13 (one per structure kind: castle, cottage/town, library, forge, mine, watchtower, mill, shrine + 5 landmarks) |
| Furniture station tags | 29 distinct (anvil, throne, bookshelf, bed, loom, mill_wheel, telescope, altar, kneeler, well_mouth, …) |
| Past kingdoms archived | up to 20 retained (oldest fall off); each preserves milestones + final census |

## Adding new content (typical recipes)

### A new event kind
1. Add to `EventKind` enum in `src/sim/events/EventSchema.ts` (and the matching `EventKindEnum` Zod enum below)
2. Add a case in `World.handleEvent()` for the visual / state effect
3. Optional: add to `EventMapper` if it has an external signal source
4. Add to journal narration in `src/sim/systems/Journal.ts`
5. Update `docs/EVENT_SCHEMA.md`

### A new building kind
1. Add to `StructureKind` in `src/sim/types.ts`
2. Add a `build<Name>()` method in `src/engine/SpriteFactory.ts` and register it in `build()`
3. Add a `ConstructibleDef` in `src/sim/systems/Construction.ts`
4. Update `Persistence.validateSave` to allow the new kind
5. Update `Schedule.ts` if NPCs should work there

### A new achievement
Add an `AchievementDef` to the `DEFINITIONS` array in `src/sim/systems/Achievements.ts`. The `check` function gets the world + counters and returns true when unlocked. Set `hidden: true` to make it appear as "???" in the stats panel until unlocked.

### A new NPC role
1. Add to `NPCRole` in `src/sim/types.ts`
2. Add to `VALID_NPC_ROLES` in `src/sim/Persistence.ts`
3. Add a schedule case in `src/sim/systems/Schedule.ts`
4. Add a programmatic sprite in `SpriteFactory.buildCharacterFrames` (or accept the default)

### A new quest arc
Add an `ArcDef` to the `ARCS` array in `src/sim/systems/Quests.ts`. Each phase receives an `ArcContext` with `world`, `journal`, `flavor`, and `rand` — use `rand` (not `Math.random`) for any picker logic so the arc is reproducible from the seed.

### A new narrative director branch
Add a `fire<Name>()` private method to `NarrativeDirector`, register it in the `fireFlavor()` dispatch roll, and add a label pool at the bottom of the file. Branch should bail (return) gracefully if its required structure kind isn't on the map.

### A new aspiration
Append an `AspirationDef` to `ALL_ASPIRATIONS` in `src/sim/systems/Aspirations.ts`. The `progress(world)` function returns a number; >=1 means complete. Three slots are always active; when one completes a random fresh one is drawn. The pool is intentionally small (15 entries) — adding 3-4 more is the right size of expansion.

### Court speech lines
Add to the relevant `ADVISOR_LINES` / `CAPTAIN_LINES` / `SCHOLAR_LINES` array in `src/sim/systems/CourtSpeech.ts`. Lines may include `{name}` which is substituted with the appointee's name. Keep the line "in-character" for the seat — advisor speaks of counsel, captain of vigilance, scholar of letters.

### NPC backstory pools
The four pools in `src/sim/systems/Backstories.ts` (`ORIGINS`, `CARRYING`, `STATED_REASONS`, `TRADES`) are combinatorial — adding one entry to each multiplies the total backstory count. Keep entries thematically grounded (medieval-flavored, no anachronisms).

### A new interior layout
1. Add the structure kind to `INTERIORS` in `src/sim/Interiors.ts`. Each layout is `{ width, height, stations: Station[] }` where `width`/`height` are in interior tiles (one interior tile renders at `INTERIOR_TILE_PX` = 24px in the modal and at world-scale in cutaway mode).
2. Each `Station` is `{ x, y, tag, capacity? }`. Pick existing `StationTag` values when possible (anvil, throne, bed, …) to reuse the renderer; new tags require a `drawStationMarker` case in `src/engine/layers/CutawayLayer.ts` AND a `drawStation` case in `src/ui/interior-renderer.ts` AND a label in `stationLabel()` (Interiors.ts).
3. If a new role should associate with this building, extend `stationFor(npc, building, taken)` so the NPC's role maps to the right station tag (e.g., a `gardener` role → `flowerbed` station).
4. The cutaway placement is automatic: any non-walking NPC whose `associatedBuildingId()` resolves to this structure will be drawn at their station via `stationWorldPos()`. No additional wiring needed for Tier 3.
5. Add at least one test in `Interiors.test.ts` confirming the layout exists and a `stationFor()` test for the new role/station mapping.

## Testing

```sh
npm test            # one-shot (~1.5s total)
npm run test:watch  # watch mode
npm run typecheck   # tsc -b strict
```

389 tests across 29 files. New systems should have at least 4–6 tests covering:
- Happy path
- Adversarial / oversized / NaN input
- Round-trip save/load (if persisted)
- Cap / limit enforcement
- Determinism (same seed → same result)
- Edge cases (empty input, single element, missing structure)

**Source bit-rot lesson:** regex literals with raw control bytes (`\x00..\x1f`) get mangled by some editor round-trips. **Always build regex character classes at runtime via `String.fromCharCode(...)`** — see `src/lib/sanitize.ts` for the pattern.

## Release automation

```sh
npm run hooks:install    # one-time — installs pre-commit (typecheck + tests)
npm run changelog -- 0.2.0   # generate CHANGELOG.md entry for new version
npm run release -- patch     # bump, regenerate changelog, tag locally
git push --follow-tags       # release.yml deploys dist/ to itch.io
```

Required repo secrets for itch deploy: `BUTLER_API_KEY`, `ITCH_USER`, `ITCH_GAME`.

Daily nightly check at 03:00 UTC (`.github/workflows/nightly.yml`) runs a fresh `npm ci` → audit → typecheck → tests → build, and auto-opens a GitHub issue on failure.

See `docs/AUTOMATION.md` for the full chain.

## Graphics upgrade paths

The current art is **programmatic 32×32 pixel sprites** drawn from `Pixi.Graphics` primitives in `SpriteFactory`. That's deliberate — it ships fast and keeps the binary tiny — but every sprite is a "blocky silhouette" by physics, and the only way to read finer than 32×32 of detail is to upgrade the source data.

Three upgrade tiers, ordered cheapest-to-richest:

1. **Sub-pixel shading** *(shipped — present pass)*. Same 32×32 footprint, more shade/highlight bands per sprite (3-band drop shadows, left-edge highlights on outfits, hair sheen pixels). Tiles get denser noise + softer edges so the grid disappears.
2. **48×48 or 64×64 sprite refactor** (~1–2 days of work). Bump `SpriteFactory.TILE_SIZE` and rewrite `CharacterRenderer.bodyMetrics` for the new pixel budget. Buys real facial features, fabric folds, hand details. Manifest already supports arbitrary PNG dimensions — the bottleneck is the procedural drawing code, not the renderer.
3. **AI-piped real pixel art** (~1 week + Stable Diffusion + ComfyUI). Documented end-to-end in `docs/AI_SPRITES.md`. Drop PNGs into `public/sprites/<kind>/` and list them in `manifest.json`; `SpriteFactory.loadStructure` / `loadCharacterSheet` already prefer real art when present. The procedural draws then become a no-asset fallback.

**Anti-pattern to avoid**: turning off `imageSmoothingEnabled = false`. PixiJS would happily bilinear-filter the existing 32×32 sprites and the result is *blurrier blocks*, not crisper art. Pixel art is always nearest-neighbor.

## Known issues / future work

- **PixiJS bundle is 562 KB** before gzip (164 KB after). Already split out via `manualChunks` (pixi / react / vendor / app); further trimming requires dropping unused Pixi features.
- **Cargo not installed on this dev machine** → can't exercise `npm run tauri:build`. Tauri config is correct; will build on any machine with Rust 1.77+ + MSVC.
- **Howler is unused** but kept in deps for future music asset support (lazy-imported).
- **No tests yet for**: rendering layers (would need PixiJS test harness), Audio (Web Audio in jsdom is complex), Tauri-side Rust code.
- **Decision `onChoose` callbacks** use the seeded `rand` for outcome rolls, but the *moment* the user clicks is wall-clock — so two same-seed kingdoms diverge only if the players make different clicks at different in-world days.
- **Twitch EventSub Rust adapter** not yet built — frontend is fully ready, just needs ~3hr of Rust wiring.
- **Sim time can drift** if user keeps tab in background — sim drops to a low rate via `requestAnimationFrame` throttling. Save persists; on focus, time advances based on real wall clock via the Calendar system.

## Shipping checklist

- [ ] Drop sprite PNGs into `public/sprites/*` and update `manifest.json` (optional — programmatic sprites ship fine)
- [ ] One ambient music track (optional, Howler ready)
- [ ] Trailer recording (OBS + the streamer-overlay mode for clean footage)
- [ ] Screenshots / capsule images for Steam / itch.io
- [ ] Steam page: tags, description, system requirements
- [ ] Build Rust Twitch EventSub adapter (~3hr, frontend already complete)
- [ ] Test `npm run tauri:build` on machine with Rust toolchain
- [ ] Set `BUTLER_API_KEY` / `ITCH_USER` / `ITCH_GAME` secrets on the GitHub repo

## Tauri / Rust notes

`src-tauri/Cargo.toml` deps: tauri 2.1, axum 0.7 (feature-gated), notify 6, sysinfo 0.32, tokio (full), serde, uuid, chrono, anyhow, tracing.

The Rust side spawns background tasks for: system monitor (CPU/network), fs watcher, git poller, inbox watcher, optional HTTP server. All write to the same `kingdom:event` channel that the frontend listens on. To add a new ambient source: implement in `src-tauri/src/ambient/<name>.rs`, register in `lib.rs::setup`.

The tray menu emits Tauri events (`tray:command`) that `src/ui/TrayMenuBindings.ts` listens to.

Window modes (overlay / fullscreen secondary / windowed) are invoked from frontend via `invoke("toggle_overlay_mode")` etc. — see `src-tauri/src/window.rs`.

---

**The kingdom of Aurelia is the canonical first world.** When in doubt, found a fresh kingdom and watch it for an hour at 3× speed. The narrative director, life events, succession, treasury, anniversaries, and construction systems will tell you what the codebase wants to do.

See `WAKE_UP_REPORT.md` for the full pass-by-pass changelog of how the project got here.
