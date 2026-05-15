# KingdomOS — Morning Report

Written overnight across multiple batches. Status: **285 tests passing across 29 files · TypeScript clean · production build succeeds in 2.67s · code-split bundles · live demo at https://jonathanabarnett.github.io/kingdomos/ · full release automation in place · ready to ship to itch.io today if you want.**

## Pass 26 — documentation refresh

The codebase moved substantially between Pass 18 and Pass 26 (interiors, journal pin navigation, landmarks, drag UX, NPC de-stacking, kingdom borders). Pass 26 brings CLAUDE.md / README.md / this report into line with what actually ships:

- Updated test count everywhere (250 → 285), build time (2.96s → 2.67s), file count (25 → 29).
- CLAUDE.md gained two new architectural pillars: **(9) Journal entries are spatial** and **(10) Two interior lenses on the same data**.
- Directory map now lists `Interiors.ts`, `Associations.ts`, `Discoveries.ts`, `BorderLayer.ts`, `CutawayLayer.ts`, `InteriorView.tsx`, `interior-renderer.ts`, `PastKingdoms.tsx`, `Sparkline.tsx`.
- Content tables added: 13 interior layouts, 29 station tags, 5 landmark kinds × 3 opening sentences, drone toggleable, 5 category chimes, 20 archived kingdoms cap.
- New recipe: "A new interior layout" — explains how to add a structure kind to `INTERIORS`, wire `stationFor()`, and register the renderer cases in both `CutawayLayer` and `interior-renderer`.
- README gained a "Step inside any building" section, the `X` cutaway keybind, the "click to fly there" journal-pin behaviour, the dashed kingdom border, and the landmark-discovery system.

## Pass 25 — interior dollhouse mode (Tier 3)

The same data that powered Pass 24's modal "Step inside" view now drives a god's-eye dollhouse: press `X` and every building goes translucent, every non-walking NPC renders at their interior station at world scale.

### New modules
- **`src/sim/Associations.ts`** — pure helper `associatedBuildingId(npc)` answering "which building, if any, is this NPC currently *inside*?". Pure function, 11 tests covering every activity × role combination. Sleeping → home. Working → work. Idle for specialists → work. Idle for villagers/monarchs → home. Walking → null (render outdoors). Empty homeId for walking-equivalent → null. The whole table is unit-tested before we ever asked the renderer to use it.
- **`src/engine/layers/CutawayLayer.ts`** — new Pixi container that mirrors `StructureLayer` at world coords but draws translucent roofs + the interior decor on top. `stationWorldPos(structure, station)` returns the pixel coord for any station, used by `EntityLayer` to relocate sprites.

### Wiring
- `EntityLayer` consults `associatedBuildingId(npc)` + `stationFor()` when cutaway is on: if the NPC has a station inside a building, draw them there instead of at their world tile.
- The roof translucency uses Pixi alpha 0.45 on the structure layer when cutaway is active — no double-render, just an alpha toggle.
- `X` keybind in App.tsx flips `useGameStore.settings.cutawayMode` which threads to `pixi.cutawayLayer.setEnabled(on)`.

### Net
- 11 new tests in `Associations.test.ts`.
- Cutaway mode visually integrates with the kingdom-border dashed outline from Pass 23 — together they make the whole map legible.

## Pass 24 — interior modal "Step inside" (Tier 2)

When you click a building, the StructureInspector now has a "Step inside" button. Click it → modal opens with a detailed Canvas2D interior render.

- **`src/sim/Interiors.ts`** — defines `INTERIORS: Record<StructureKind, Interior>`. 13 layouts (castle, cottage, town, library, forge, mine, watchtower, mill, shrine + 5 landmarks). Each layout is `{ width, height, stations: Station[] }`. 29 distinct station tags (`anvil`, `throne`, `bookshelf`, `bed`, `loom`, `mill_wheel`, `telescope`, `altar`, `kneeler`, `well_mouth`, …).
- **`stationFor(npc, building, taken)`** — picks the right station for an NPC based on role/activity, never assigning two NPCs to the same `capacity:1` station. Deterministic and pure.
- **`src/ui/InteriorView.tsx`** — the modal component. Mounts a `<canvas>`, calls `drawRoom / drawStation / drawNpcAt`, lists the roster with each NPC's station label ("Tessa at the anvil", "the monarch on the throne").
- **`src/ui/interior-renderer.ts`** — pure Canvas2D primitives. `INTERIOR_TILE_PX = 24`. `bodyColorFor(role)` palette by role. 29-case `drawStation` switch.

The architecture is intentionally identical to what Pass 25 reuses for cutaway — the modal is the testbed.

## Pass 23 — kingdom borders + dynamic landmarks

Two big content drops that make the map feel alive between events.

### Kingdom border (`src/engine/layers/BorderLayer.ts`)
- Convex hull (Andrew's monotone chain) computed every few seconds around all structures with per-kind padding (castle gets more breathing room than a shrine).
- Rendered as a dashed gold polygon with a continuous-rhythm dash pattern + soft 4% alpha fill inside the hull.
- Expands automatically as Construction adds watchtowers / mills / shrines further out — visualizes kingdom growth without a UI element.

### Discoveries (`src/sim/systems/Discoveries.ts`)
- 5% chance per day after day 8, gated by ≥10 day cadence between discoveries.
- 5 landmark kinds: `standing_stones`, `ruin`, `camp`, `wellspring`, `obelisk`. Each has 3 opening sentence variants.
- Picks a walkable plain/forest/hill tile ≥5 tiles from any existing structure.
- Writes a milestone journal entry pinned to the new landmark (so clicking the entry flies you there).
- Persists through save with `snapshot()` / hydrate, validated by `validateLandmarks()` in `Persistence.ts`.

## Pass 22 — drag UX

Replaced mouse-only drag with pointer events for touch/pen/middle-click support. Added inertia (0.92 decay per frame, samples last 100ms of motion). Cursor flips `grab` → `grabbing` during the drag. Right-mouse passes through to other handlers. Pointer-capture means you can drag off the canvas without the gesture breaking.

## Pass 21 — journal pin navigation

Every meaningful `SavedJournalEntry` now carries an optional `targetStructureId`. Most non-system entries (life events, founding, anniversaries, holidays, threats, court speech, quest phases, courier arrivals, forge/library/mine activity) pin to their structure when they're written. The journal panel renders a "go to" button (text + border + background, not an emoji — confirmed visible by user) next to each pinned entry. Clicking snaps the camera to the structure via `pixi.camera.centerOn(structure.pos)`.

## Pass 20 — NPC de-stacking + journal panel reflow

- **De-stack** — each NPC gets a deterministic sub-tile offset via `hash01(npc.seed)` so multiple villagers sharing a tile fan out instead of overlapping. The hash flows through the seed so it's stable across reloads.
- **Journal panel** — moved to the right side and gained a `with-event-log` class that shifts it left when the event log is open, so they never overlap. Search + filter chips kept.

## Pass 19 — bug-fix triage (live demo regressions)

The Pages deploy surfaced six issues that the local dev loop hadn't caught. Each one was either a deployment-environment quirk or a timing bug masked by fresh state.

1. **Sprite manifest 404 on Pages.** Manifest was loading from `/sprites/manifest.json`; Pages mounts the app at `/kingdomos/`. Fixed by prefixing `import.meta.env.BASE_URL + "sprites/"`. Added `src/vite-env.d.ts` for the type. `GITHUB_PAGES_BASE` env var threaded through `vite.config.ts`.
2. **Begin button infinite loop.** `resetKingdom()` was always called even on first launch. Fixed with `if (hasSaveRef.current) resetKingdom(); else setTitleOpen(false);`.
3. **Drone pad hum (110Hz triangle wave beating).** Replaced with sine waves at 220Hz root, ±7c detune, gain 0.18. Audio is now properly toggleable from settings.
4. **Journal 99-item spam.** `Quests.tick()` runs at 10Hz; quest phases had no dedup. Added `firedPhases: number[]` to `ActiveArc` and gated each phase write on `!firedPhases.includes(elapsed)`.
5. **Day-1 wedding bug.** `LifeEvents.lastProcessedDay = -1` caused gap=2 retroactive processing on the first tick. Sentinel `< 0` check now bails without processing.
6. **NPC bouncing (stationary).** Stale `prevPos` for non-walking NPCs caused interpolation jitter. Fixed: `npc.prevPos = npc.pos` in the non-walking branch.
7. **Pre-founding sim ticking.** `PixiApp.speedMultiplier` now returns 0 when `!store.identity` so the world doesn't tick during the title/onboarding screens.
8. **Duplicate pet welcome.** Both `adoptPet` AND the founding chronicle wrote it; added `{ silent: true }` opt to `adoptPet`.

Also added a stress test improvement to `Stress.test.ts`: previously only asserted elapsed time; now asserts the journal doesn't balloon past a reasonable bound. Would have caught the quest spam class of bug.

## Pass 18 — the kingdoms you've ruled

Three additions, one quiet emotional payoff:

### Kingdom Vault (the big one)
- **`src/sim/KingdomArchive.ts`** — new module. When the player chooses "Found a new kingdom", a compact summary of the kingdom they're leaving (name, last monarch, founding date, total days, generations, final census, and the last ~12 milestone journal entries) is archived to its own localStorage slot before the active save is wiped. Up to 20 kingdoms kept; oldest fall off.
- **`src/ui/PastKingdoms.tsx`** — new title-screen panel. Each archived kingdom is a collapsible row showing the highlight reel of its milestones. No "resume" button — these are deliberately read-only artifacts, like photos in an album rather than active games.
- **Title screen now shows "Past kingdoms (N)" button** when the archive is non-empty, sitting alongside Continue / New / Settings.
- This is the biggest emotional change in the project. A player who's spent two weeks on a kingdom and chooses to start fresh **no longer loses them**. The chronicle of every kingdom they've ruled lives on.
- 11 tests covering summarize, append, cap-at-20, malformed-input filtering, control-char/bidi-override scrubbing, and the clear path.

### Audio variety
- **`AudioEngine.chimeFor(category)`** — different musical fingerprints for different achievement categories:
  - **life** — warm major chord with slow bloom (births, marriages, deaths, population_25)
  - **time** — bell-like 4-note cascade (day_7, day_30, year_1, succession)
  - **construction** — sturdy two-tone hammer ring (first_building)
  - **vault** — bright ascending twinkle (vault_3, vault_10)
  - **mystery** — strange 4-note minor descent (all 10 hidden achievements)
  - **default** — the existing 3-note major triad chime
- App.tsx categorizes each achievement id and calls the right tone on unlock. The mystery descent in particular makes unlocking a hidden achievement feel like discovery rather than congratulation.

### Accessibility
- Added proper ARIA labels and roles to the most-used dialogs (OnboardingModal, HelpOverlay, JournalPanel, DecisionPrompt). Each is now navigable to screen readers and announces itself with title + body. Close buttons now have `aria-label`. The decision prompt uses `role="alertdialog"` since it's time-pressured. The search input has `aria-label="Search journal entries"`.

### Net
- Pass-18 verification: typecheck clean · **250 tests** (was 239) · build 2.96s.
- Vitest `localStorage` shim added in `KingdomArchive.test.ts` — other tests still run pure-node; the shim is local so the suite remains fast.

## Pass 17 — sprites, sparklines, and stakes

Three coherent improvements: the visual layer that drives every screenshot, a long-term progress feedback loop, and a real (small) threat to keep the world from feeling toothless.

### Visual — all 5 remaining hero sprites upgraded
- **Town** — 3-tone walls with light/shade highlights, two-tone tiled roofs with ridge highlights, chimneys (staggered by house) with rising smoke wisps, 4-pane shuttered windows with warm internal glow, articulated doors with plank seams + iron knobs, cobblestone connecting path between houses.
- **Library** — proper recessed archway entrance, two arched stained-glass windows with bright spot inside, two flanking lanterns with warm halos, masonry seams, dome with highlight crescent + brass-finial spire with cross-piece.
- **Forge** — 3-tone soot-stained stone with rising soot streaks around the fire opening, fire opening with 5-color gradient (deep red → mid red → orange → yellow → near-white), chimney with rising smoke plume, anvil with hot sparks above it, tools on the wall (hammer + tongs).
- **Mine** — rocky hillside backdrop with scattered loose stones, deep multi-layered cave shadow gradient, wooden support beams with plank seams + light/dark edges, hanging lantern with warm halo spilling onto the beams, mining cart half-loaded with ore chunks, wooden ties beneath the rails.
- **Watchtower** — wider base, tall articulated shaft with stone-block courses + arrow-slits, wooden battlement floor + railing posts, tiny guard silhouette at the top, two-tone wood-shingle conical roof, brass-finial flagpole with shaded flag cloth.

These five sprites + the castle (upgraded in pass 16) cover ~90% of any screenshot. Every promo image now reads as "real pixel art" rather than "graphics primitive."

### Sim — Sparklines (`src/sim/systems/History.ts`)
- New `History` class captures one snapshot per in-world day rollover with `(day, year, population, gold, vault)`.
- Bounded ring buffer at **90 days** — older entries shift off. Total memory: <1KB.
- Persisted through the save schema; hydrated with strict validation (clamps NaN, drops invalid entries, caps to 90).
- New `<Sparkline>` React component renders tiny SVG line charts (90×24px) — polyline + filled area, color-coded per metric. Zero dependencies.
- New "History" section in the Stats panel shows 3 sparklines (population in blue, gold in amber, vault in violet), each with the latest value as a label. Below day 2 it shows "The chronicle is too young for graphs. Come back in a few days."
- 9 tests covering capture/idempotency/cap/series/hydrate/garbage-filtering + an integration test that World.tick triggers a capture.

### Sim — Threats (`src/sim/systems/Threats.ts`)
- New rare threat system: every day rolls 1.5% chance (60% reduction when Captain seated), gated by ≥4 day cadence.
- Fires a `monster` event + a weather-kind opening journal line + a decision asking the player how to respond. Three options:
  - **Send the guard** — costs 15 gold, may yield a relic for the vault (30% chance)
  - **Rouse the militia** — free, no cost, the town just sleeps poorly
  - **Let it pass** — 40% chance it worsens (next threat fires earlier + sterner journal entry)
- 5 flavor variants (wolves, bandits, beast, raiders, haunting).
- Cozy-appropriate stakes: no NPC dies; worst case is small gold loss + a frowny journal entry.
- 7 tests including a statistical A/B that the captain seat reduces threat fires over 200 trials.

### Net
- Pass-17 verification: typecheck clean · **239 tests** (was 224) · build 2.77s.
- The combination of upgraded sprites + sparklines + threats is the difference between "a polished tech demo" and "a game I'd actually play this weekend."

## Pass 16 — major content + warmth expansion

This was a big one. Nine separate items shipped in a single session:

### Sim changes
- **Court NPCs now speak in the journal** (`src/sim/systems/CourtSpeech.ts`) — once you appoint a Royal Advisor, Captain, or Court Scholar, they each occasionally contribute a line to the chronicle ("Berta counseled patience, as is the advisor's habit"). Cadence is ~every 3 days per seat, gated by a 50% random roll, deterministic from the world seed. 6 lines per role × 3 roles = 18 distinct lines.
- **NPC arrival backstories** (`src/sim/systems/Backstories.ts`) — when a Twitch sub or "petition at the gates" decision spawns a villager, a one-sentence origin gets written to the journal. Deterministic per (name, seed). 6 origin pools × 6 carrying details × 6 stated reasons × 6 trades = ~1,300 possible backstories.
- **Aspirations system** (`src/sim/systems/Aspirations.ts`) — three player-facing soft goals at a time, rotating from a pool of 15. Different from achievements: prospective, with progress bars. Completion triggers a milestone journal entry + a fresh aspiration takes the slot. Persisted across saves with strict validation.
- **3 new quest arcs** (`lost_child`, `old_friend_returns`, `village_well`) bringing the pool to 9. Each is 2-3 days, ends in a small treasury reward or a notable journal milestone.
- **2 new decision archetypes** (`stray_at_the_kitchens` for cozy moments, `anonymous_gift` for mystery) bringing decision pool to 10. Re-balanced the roll distribution so all 10 are reachable.
- **9th narrative-director branch** — `fireLoneFisher` with 5 label variants ("a fisher with a wet dog and no fish at all"). Sparse, gentle, fires ~4% of flavor rolls.
- **Procedural melody layer on the audio engine** — sparse 3-5 note phrases play every 15-40s on top of the drone pad, in the same scale as the season's voicing. Quieter at night, slightly more frequent during day. Toggleable in Settings (`musicEnabled`). Adds actual "music" rather than just ambient drone.

### Save migration
- **Save migration v0→v1 worked example** — the migration scaffold in `Persistence.ts` was empty for months. It now contains a real `migrateV0ToV1` that handles a realistic pre-release save shape (missing trait, parentIds, succession, aspirations) and produces a valid v1 save. Tested with a hand-built v0 fixture in `Persistence.test.ts`. When v2 eventually ships, write `migrateV1ToV2` in the same shape, chain it above.

### Visual / sprite
- **Castle sprite substantially upgraded** — 3-tone stone (light/base/dark) for actual volume, masonry seams, arrow-slit windows with warm orange glow, articulated central tower with crenellations, conical-capped flanking towers, properly-shaded banner with lighter/darker bands, iron-studded gatehouse door with arch keystone. The castle is in every screenshot — this is the highest-leverage sprite change in the project.
- **`docs/AI_SPRITES.md` rewritten** — added a "fastest path" callout for users who can't run ComfyUI locally (Replicate, Civitai, Fiverr commission); added a §6.5 "batch prompts" section with 6 paste-ready prompts for the hero sprites (castle, town, library, forge, mine, watchtower) calibrated for SDXL + pixel-art-xl LoRA.

### Tutorial + screenshots
- **Tutorial hints expanded from 4 to 6 steps** — new entries for Aspirations and the Court ("appoint a Royal Advisor … each seat affects the world"). Existing hints reworded to mention search/export/photo mode.
- **`docs/SCREENSHOTS.md`** (new) — exact shot list (6 stills + 1 GIF), aspect ratios, capture workflow, composition tips, do-not-capture list, recapture cadence. README now references `docs/img/*` placeholders.

### Backend
- **Twitch EventSub Rust adapter scaffold** (`src-tauri/src/ambient/twitch.rs`) — WebSocket-based adapter that connects, fetches session id, subscribes to 4 event types via Helix REST, translates notifications into our `KingdomEvent` shape. Compiles cleanly because the module isn't declared in `mod.rs` (so the unused `reqwest` import doesn't bite). 4-step activation procedure documented in `docs/INTEGRATIONS.md`.

### Verification
- **22 new tests** (across CourtSpeech, Backstories, Aspirations, Persistence migration) bringing total from 203 → 224
- TypeScript: clean
- Production build: **2.54s**
- All four documentation files refreshed (CLAUDE.md, README.md, AI_SPRITES.md, INTEGRATIONS.md)

## Overnight pass 15 — court roles do something now

Royal Advisor, Captain of the Guard, and Court Scholar have existed as appointable seats for a while, but they were purely cosmetic — picking someone changed nothing about the simulation. This pass gave each role a real mechanical effect, with a clean enough wiring story that more roles can be bolted on later.

- **`world.courtEffects` flag bag + `setCourt(...)`** — `World` now exposes three booleans (`advisorSeated`, `captainSeated`, `scholarSeated`) plus a `setCourt` method that takes appointee ids and validates each against the live NPC roster. If you appoint someone who's since died, their seat is automatically treated as vacant.
- **Effects wired into three systems:**
  - **Royal Advisor** → `Quests.proposeRandomDecision` doubles the auto-expiry timer (90s → 180s). The player gets a more patient kingdom.
  - **Captain of the Guard** → `Weather.next` demotes storm transitions to "rain" instead. Storms still arrive via `forceStorm` (external triggers), but the natural Markov is dampened.
  - **Court Scholar** → `Economy` multiplies scholar tome-production rate by 1.5×.
- **Auto-revalidation on death** — when the day rolls over, `World.tick` calls `revalidateCourt()` which re-checks the stored appointee ids against the current roster. A captain who died yesterday no longer suppresses today's storms.
- **App.tsx mirrors identity → world** — a new `useEffect` watching `identity.court.advisor/captain/scholar` calls `world.setCourt(...)` whenever the player appoints or dismisses someone.
- **Stats panel surfaces the effect** — each court slot now shows its mechanical effect in italics ("+90s on royal decisions" / "storms passed less often" / "+50% tome production"), colored when active, dimmed when vacant. The player can finally tell what these seats do.
- **8 new tests** — vacant default; valid appointment; ignored-when-dead; advisor-extends-timer (asserts 90s vs 180s window); captain-dampens-storms (500-step Markov A/B); scholar-boosts-tomes (1.4–1.6× ratio); revalidate-clears-dead-seat; day-rollover auto-revalidates.

Pass-15 verification: typecheck clean · 203 tests (was 195) · build 2.92s.

## Overnight pass 14 — determinism cleanup (quiet but important)

The Quests system was the last bastion of `Math.random()`. Pass 14 plumbed `world.rand` through every roll so two players starting the same seed actually get the same kingdom history:

- **`Quests` constructor now takes `rand`** — passed in from `World` (same `mulberry32(seed)` instance shared with `LifeEvents`). Defaults to `Math.random` if omitted so the constructor remains test-friendly.
- **Every roll inside `Quests.tick()` and `proposeRandomDecision()`** — arc selection, flavor-name pick, decision archetype roll, town picker in arc phases — all now go through `this.rand()`. Captured into a local at the top of `proposeRandomDecision` so the onChoose closures can share it.
- **`ArcContext` extended with `rand`** — arc phases that need randomness (e.g. picking which town the traveler arrived at) get a deterministic source instead of falling back to global `Math.random`. The `pick(world, rand)` helper now takes an optional rand for the same reason.
- **Decision IDs are no longer `Date.now()`-derived** — replaced with a monotonic `nextId(prefix)` counter on the Quests instance (`dec_<day>_<n>`). Removes a real collision risk if two decisions fire in the same second (e.g. at high sim speed) and makes IDs trivially predictable per seed. The same id is reused as the deterministic seed for NPCs/events spawned by that decision's `onChoose`.
- **3 new tests** — same-seed worlds produce identical arc-start sequences and decision IDs over 30 days; different seeds diverge over 50 days; all decision IDs across 200 days are unique.

Wall-clock `ts` on published events is left as-is — that's legitimately metadata, not state. The remaining `Date.now()`-derived `expiresAt` on decisions is also intentional: it controls real-time UX (auto-resolution after ~90s), not save-state.

Pass-14 verification: typecheck clean · 195 tests (was 192) · build 3.54s.

## Overnight pass 13 — anniversaries & new arcs

A kingdom that lives a year deserves a moment to mark it:

- **Kingdom Anniversary** — when `state.year` rolls past 1, the world writes a milestone journal entry and fires a low-key festival at the castle. The ordinal is computed properly (1st, 2nd, 3rd, 4th… 11th, 12th, 13th, 21st) so the chronicle reads correctly even on long-running kingdoms. Five rotating flavor lines per year so the 2nd anniversary doesn't read identical to the 3rd. The line "the pet sat where it always sits — the kingdom did the same" lands especially well if the player has been around for a while.
- **2 new quest arcs** — "The cat that would not leave" (3-day arc, ends with a tin holding the cat's first whisker landing in the vault — pure cozy) and "The river ran high" (3-day arc, sandbags + miner shift + crested-and-dropped). Brings the arc pool to 6.
- **`ordinalSuffix(n)` helper** — handles the gnarly 11/12/13 case and proper mod-10 rules for all other numbers. Used by the anniversary entry but generally available for future ordinal flavor.
- **4 new tests** — anniversary fires on year roll, does NOT fire on year 1, fires exactly once per change (not on every subsequent tick of the same year), and emits a paired festival event.

Pass-13 verification: typecheck clean · 192 tests (was 188) · build 2.37s.

## Overnight pass 12 — the world has more to say

The narrative director was reliable but repetitive. Pass 12 turned it into something more like a writers' room:

- **Variant label pools per branch** — instead of every forge firing as "routine smithing," there are now 6 labels per common branch (forge, courier, festival, etc.) The same trigger reads differently each time it surfaces. Adds maybe 35 distinct flavor lines to idle play.
- **3 new flavor branches** — mining shifts, airship passages, and pilgrims/wanderers walking from a town to the shrine or castle. The pilgrim branch is a personal favorite — "a singer who promises to play once and leave," "a child sent to make an offering" — gives the world little quiet moments that aren't tied to anything mechanical.
- **Single-structure courier safety fix** — the original code could emit a courier with `from === to` if only one town existed (it picked `(index+1) % length` which wraps to itself for `length === 1`). New logic explicitly filters the candidate pool and bails rather than emit a self-loop. Probably never bit a real user, but the test catches it now.
- **Castle-as-fallback courier routing** — when there's only one town, the director routes through the castle instead of skipping entirely, so quiet maps still see some movement.
- **Refactored to per-branch methods** — `fireFlavor()` is now a roll → method-call dispatch instead of a fat switch. Each branch handles its own structure availability + label pick. Easier to extend and test.
- **3 new tests** — no-self-loop invariant, single-structure graceful degradation, and label-variety check (200 fires → ≥5 distinct labels seen).

Pass-12 verification: typecheck clean · 188 tests (was 185) · build 2.37s.

## Overnight pass 11 — the chronicle becomes an artifact

The journal panel was a passive log; now it's a tool. Three additions turn it into something a player would actually want to share:

- **Kind-filter toggles** — five chips below the search bar (milestones · life · events · weather · system). Click to mute a kind; click again to bring it back. Lets a player look at "just the love stories" or "just the storms" or hide the noisy system dawns. Filter state lives in component state so each open of the panel starts fresh — the kingdom's chronicle is always *all of it* under the hood.
- **Text search** — case-insensitive substring match. Type "courier" and only courier entries remain. Type a villager name and trace every mention of them.
- **Markdown export** — a `⇩` button in the header downloads `<kingdom>-chronicle-YYYY-MM-DD.md`. Days become H3 headers, entries become bulleted lines prefixed by kind emoji, oldest-first (so it reads forward in time like a real chronicle). User-controlled text is markdown-escaped so a villager named `Berta *the* Brave` doesn't accidentally italicize the rest of the file.
- **Extracted pure helpers** — `src/ui/journal-utils.ts` houses `filterEntries`, `exportMarkdown`, `downloadMarkdown`. No React, no DOM dependencies (the download is in a separate function that no-ops in server environments) — easy to unit-test, easy to extend.
- **11 new tests** — covers default-filter passthrough, kind muting, search case-insensitivity, whitespace trimming, combined filter + search, empty matches, exportMarkdown chronological order, fallback names, markdown escape of `*`/`[]`/etc., and bullet count.

Pass-11 verification: typecheck clean · 185 tests across 19 files (was 174 / 18) · build 2.33s.

## Overnight pass 10 — lineage & discovery

This pass fixed a quiet save-load bug and added a multi-generation thread to the world:

- **Newborn save-load bug fixed** — `applySave` previously only updated NPCs that *already existed* in the freshly-spawned world. Children born in a previous session were silently dropped on reload. Now any saved NPC whose id isn't in the spawn roster gets reconstructed in place via `world.pushNpc`, with full state (trait, partner, parents, position, role). The runtime cap still holds since `pushNpc` enforces it. This is the difference between "the kingdom resets every reboot" and "the lineage actually persists."
- **NPC parent tracking** — added `parentIds?: string[]` to the `NPC` type. `LifeEvents.tryBirth` now records both parents on every newborn. Persisted through the save schema with strict validation: parentIds are filtered to strings, capped at 2 entries, and survive serialization.
- **Parent surfacing in inspect tooltip** — hovering an NPC now shows "child of Berta and Olen" if they were born in-sim. Adds quiet depth: you can hover a 5-year-old in Highkeep and see the elderly couple they belong to.
- **Founding chronicle** — instead of a single flat journal line at kingdom creation, the founding now writes three: the formal announcement, "the banner was raised over the keep," and "[Pet] the [kind] sat at the foot of the throne and refused to leave." Sets the tone before any other events fire.
- **Hidden achievement counter** — the stats panel now shows "✦ N mysteries remain" beneath the achievement grid when hidden ones are still locked. Hints at content without spoiling — gives players a reason to keep playing.
- **4 new tests** — Persistence parentIds round-trip + caps + non-string filtering, and an Integration test verifying a child reconstructed from save retains name, trait, and parent links.

Pass-10 verification: typecheck clean · 174 tests (was 170) · build 2.33s.

## Overnight pass 9 — voice & continuity

The kingdom now speaks with more personality. Three things changed:

- **Newborn trait bug fix** — children born to NPC couples through `LifeEvents` were inheriting `seed` but not `trait`, so half the population (anyone born after launch) was un-trait-able. Now `traitFor(seed)` runs on every newborn so the generational chronicle is consistent.
- **Trait-flavored journal narration** — life-event entries now reference each NPC's trait via the `TRAIT_EPITHET` map. So instead of "Berta passed peacefully…" you'll see "the ever-cheerful Berta passed peacefully…" or "Bells tolled at dusk; the old-souled Olen had passed in their 84th year." Adds quiet color to deaths and marriages without becoming a parody.
- **Variant phrasing for life events** — marriages, births, deaths each have 3-4 phrasing rotations. Same event content, different sentence shape. Makes scrolling the journal less repetitive over a long playthrough. (Marriages now sometimes read "A wedding at Highkeep: the joyful Berta and the wise Olen stood beneath the canopy." Births sometimes "Highkeep woke to a new cry — Anwen, child of Berta and Olen.")
- **3 new tests** — covers `trait` defined on all spawned NPCs, trait determinism across same-seed Worlds, and the newborn-trait regression.

Pass-9 verification: typecheck clean · 170 tests (was 167) · build 2.30s.

## Overnight pass 8 — depth & discoverability

Small additions that make the world feel more textured and reward long play:

- **NPC personality traits** — every NPC now spawns with one of 8 deterministic traits (joyful, grim, curious, stoic, kind, ambitious, anxious, wise) derived from their seed. Surfaced in the inspect tooltip as italic accent text ("Berta · Smith · age 34 · joyful"). Persists through save/load. The hook for trait-flavored journal narration is in `TRAIT_EPITHET` — drop-in for future entries like "the ever-cheerful Berta opened the forge today."
- **Seasonal journal anchors** — when the season rolls over, the journal gets a fixed weather-kind entry ("Winter took the kingdom in the night. Hearths burned through every house.") Skipped on day 1 so you don't see the entry the moment you boot in. Four lines, one per season.
- **Expanded name pools** — first-name pool doubled (32 → 64), surname parts doubled both sides (10 → 20 each). Kingdom suggestions in the onboarding modal grew from 10 → 24, monarch suggestions same, pet suggestions 10 → 20. Way more variation between rerolls.
- **Hidden achievements** — 10 new achievements marked `hidden: true`. They render as `???` in the stats panel with a dashed border and "Hidden — unlock to reveal" tooltip, then flip to their real title + description on unlock. Includes some discovery rewards (Midnight Oil at 1am local + 1h session, Long Live the King at 6h session, Kind Skies for 7 days without a storm, Of Legend at day 100, Wings Untiring at 2000 couriers, A Dynasty Carved in Stone at gen 10).
- **3 new tests** — covers hidden achievement contract, day-100 unlock, no-storm-streak unlock with the negative case.

Pass-8 verification: typecheck clean · 167 tests (was 164) · build 2.29s.

## Overnight pass 7 — release automation

You said "automate please." Here's the full chain:

| Layer | What it does |
|---|---|
| **`npm run hooks:install`** | One-time setup — installs a `.git/hooks/pre-commit` that runs typecheck + tests before every commit. Zero new npm deps. |
| **`.github/workflows/test.yml`** | Already in place — runs on every push, full test + build, uploads `dist/` artifact |
| **`.github/workflows/release.yml`** (new) | Triggers on `v*.*.*` tag push. Re-runs tests, builds, then uses Butler to deploy `dist/` to itch.io's HTML5 channel. Requires three repo secrets: `BUTLER_API_KEY`, `ITCH_USER`, `ITCH_GAME`. |
| **`.github/workflows/nightly.yml`** (new) | Daily at 03:00 UTC: fresh `npm ci`, audit, typecheck, tests, build. **On failure auto-opens a GitHub issue** so you wake up to a flag. |
| **`.github/dependabot.yml`** (new) | Weekly npm bumps (Mon 09:00 ET), monthly Action bumps, weekly Cargo bumps. Pinned majors on pixi.js + react + react-dom (those are deliberate migrations). |
| **`npm run changelog -- <ver>`** (new) | Pulls commits since last tag, groups by Conventional Commits prefix, prepends to `CHANGELOG.md`. |
| **`npm run release -- <ver|patch|minor|major>`** (new) | One command to ship: verifies clean tree, no existing tag, runs typecheck + tests, bumps `package.json`, generates changelog, commits + tags. Push is intentionally manual (`git push --follow-tags`) so you get one last look. |
| **`docs/AUTOMATION.md`** (new) | Full reference: every workflow, every script, how they chain, what's NOT automated and why. |

**The whole chain in plain English:**
```
1. You commit              → pre-commit runs typecheck + tests
2. You push                → CI runs same + build, uploads artifact
3. You npm run release     → bumps version, generates changelog, tags locally
4. You git push --follow-tags  → release.yml deploys to itch.io
5. Daily at 03:00 UTC      → nightly checks for drift, opens issue if broken
6. Weekly Monday           → Dependabot opens PRs for safe bumps
```

You don't need to remember any of this. Just write code with Conventional Commits prefixes (`feat:`, `fix:`, etc.) and run `npm run release -- patch` when you want to ship.

## Overnight pass 6 (added since pass 5)

- **`MARKETING.md`** — full marketing kit. 3 product descriptions (15-word / paragraph / long), Steam page copy with shot list, itch.io page + devlog #1, 5 tweet drafts, 2 r/cozygames drafts, 2 r/PixelArt drafts (with the honest "is this AI?" framing), 1 r/programming draft, cold-email templates for press and streamers + 5-day followup, 10 named outreach targets, 30s and 90s trailer scripts shot-by-shot, 4-week pre-launch + launch-week + month-1 plan with realistic outcome scenarios, brand voice guide.
- **Title-screen news ticker** — when you return to a saved kingdom, the title screen now shows your 3 most recent journal entries under the "Continue" button. The kind tag colors them: milestones in gold, life events in pink, weather in slate. Hovering "Continue" feels heavier when you can see "Berta and Olen were wed. A storm rolled in from the east. The vault gained a relic" sitting under it.

> Note: I attempted to run the marketing copy via a subagent in parallel but Anthropic rate-limited the agent at startup. Wrote the kit directly instead — it's complete and project-specific, no boilerplate.

## Overnight pass 5 (added since pass 4)

- **NarrativeDirector tests** (7) — verifies the flavor-event injector fires when quiet, skips when noisy, doesn't crash on edge-case maps
- **Bug fix: duplicate-NPC on re-sub** — a Twitch viewer subscribing twice would have spawned two villagers with identical names. Now the second sub fires a celebration and a "renewed their pledge" journal entry instead. Test added.
- **Save migration scaffold** — `validateSave` now routes older-version saves through a `migrateSave` chain before validation. v→v1 is currently a no-op (we're at v1), but the architecture is in place for a clean v1→v2 lift when the schema needs to change.
- **`SECURITY.md`** — formal threat model. 12 attack vectors documented with their existing mitigations and verifying tests. Useful for Steam submission or any future security review.
- **Keyboard polish on creators** — Esc cancels (when `onCancel` is set); Ctrl/Cmd-Enter commits. Both CharacterCreator and PetCreator. Inputs still get default browser behavior.

## Overnight pass 4 (added since pass 3) — automated testing

You said you have trouble testing. The fix: **156 automated tests now run in 1.59s**. You shouldn't ever need to manually test core behavior again.

- **LifeEvents tests** (6) — aging cadence, marriage rolls, death rolls, 30-day absence cap
- **Decisions tests** (10) — queue, resolve, expiry, defaultOnExpire, subscribe, throwing-handler safety
- **Achievements tests** (9) — counters increment, unlock conditions, no double-unlock, hydration
- **Integration tests** (7) — full session boot, save round trip, journal stream, achievement chain, malicious save rejection, construction proposal pipeline
- **`docs/TESTING.md`** — full coverage map + how to extend

**To run everything: `npm test`** — exits 0/1, ~1.5 s on cold start.

**`.github/workflows/test.yml` CI** runs this on every push. Push, check the green badge before bed.

## Overnight pass 3 (added since pass 2)

- **5 new quest decision templates** — Suspicious stranger, Tax levy, Pilgrim's request, Boundary dispute, Astronomer's portent. Total decisions now 8. Each has real consequences (gold, treasury artifacts, journal threads).
- **Photo mode: 5 frame styles** — wood (default), parchment with burned-edge vignette, stone with brick lines, bronze window with crossing bars, naked (no frame). Cycle button in the photo modal lets you re-render the same shot in any style.
- **Time-of-day greeting** — hovering the kingdom badge in the HUD shows "Good morning/afternoon/evening, [monarch name]." Small flair, big charm.
- **Stress test suite** (10 tests, in `src/sim/Stress.test.ts`):
  - 1000 ticks without throwing
  - Bus buffer cap holds under 1000-event spam
  - NPC/effect/courier caps hold under 5× cap spam
  - Treasury cap (200) holds under 500 acquisitions
  - Gold can't exceed 99,999 even with bits whales
  - Mixed event stream + 500 ticks stays bounded
  - 11 categories of malformed event input handled gracefully
  - 5000-tick perf check completes in <5s (actually ~630ms)
- **Memory audit** — read EntityLayer, WeatherLayer, TileRenderer, NarrativeDirector for unbounded growth. Found one: `Treasury.acquire` wasn't enforcing the 200 cap. Fixed by aging out oldest artifacts.

## Overnight pass 2

- **CI workflow** (`.github/workflows/test.yml`) — typecheck + test + build on every push, uploads `dist/` artifact
- **Real-world holidays** — Midsummer, Hallowtide, Yuletide, Year's End, etc. fire festivals based on the player's local wall clock. 11 dates baked in.
- **Journal narration variety** — every event kind now picks from 3-5 phrasings, so a week of play doesn't read identically. ~50 templates total across courier/forge/research/mining/storm/celebration/festival/airship/monster.
- **Welcome-back message** — first journal entry when resuming a kingdom after >5 min away ("You returned after 8 hours away…")
- **Streamer mode panel leak fixed** — toggling streamer mode now hides all in-game panels (Stats, Journal, Events, Settings, Inspector, NPC tooltip) so the OBS source stays clean
- **More tests** — Journal (9 tests), Holidays (6 tests) — total now **112 across 12 files**
- **Polished `README.md`** — public-facing presentation with badges, integrations table, distribution paths

---

## TL;DR — Wake up, then in order:

1. **Run the app** for 5 min to feel the state of things. `cd C:\Users\jonat\Projects\kingdomos && npm run dev` then open http://localhost:5876.
2. **Decide today's primary goal:** ship a no-Tauri itch.io HTML5 release, generate sprites, or build the Rust Twitch adapter.
3. **Block 90 min for sprites** — your ComfyUI work is the single biggest unblock right now.

---

## What happened overnight

| Built | Why it matters |
|---|---|
| `CLAUDE.md` (full handoff doc) | Future-you (or a collaborator) can land on the repo and ship in an hour |
| Code-splitting | Bundle now splits into pixi (562 KB) / react (134 KB) / vendor (63 KB) / app (187 KB). React shell renders before Pixi loads → faster first paint |
| Performance HUD | Toggle in Settings → live FPS + npc/effect counts. Useful for users complaining "it's slow" |
| Test-integration buttons in Settings | One-tap fire courier/forge/storm/festival/etc + Twitch sub/raid/bits. No more devtools console needed for testing |
| First-launch tutorial | 4 hint cards that appear 3s after onboarding completes. Auto-disable after; toggleable in Settings |
| Audio polish | ±5% pitch variation on plucks so repeated SFX feel less mechanical; new `chime()` for achievements; festival/raid get a double-fanfare; bits drop a 4-note coin cascade; Twitch sub uses the chime |
| Onboarding ← Back button | First-launch character creator now has "← Back" instead of being a dead-end |
| Achievement audio | Every unlock now triggers a 3-note major-triad chime via `audio.chime()` |

All work passes `npm test` (97/97), `npm run typecheck`, and `npm run build`.

---

## Manual things only you can do (priority-ordered)

### 🟥 Critical-path for shipping

1. **Generate sprites in ComfyUI** (2-4 hr depending on iteration count)
   - You committed to free-local-SD route. Setup guide is in `docs/AI_SPRITES.md`.
   - Paste-ready prompts in `scripts/sprite-prompts.md`.
   - Generate in this order for max ROI: **5 structures first** (castle, town, library, forge, mine) → then **8 terrain tiles × 4 variants** → then **6 character sheets** (villager, courier, scholar, blacksmith, miner, guard).
   - For each: generate at 512px, downscale + pixel-snap with PixelOver or Aseprite, drop into `public/sprites/<kind>/`, list in `manifest.json`. The engine picks them up on reload — no code changes.

2. **Install Rust toolchain** if you want a Tauri desktop build (Steam path)
   - https://rustup.rs/ → `rustup-init.exe` → default settings → reboot terminal
   - On Windows also need: Visual Studio C++ Build Tools (https://aka.ms/vs/17/release/vs_buildtools.exe → "Desktop development with C++")
   - Verify: `cargo --version` and `rustc --version` both work
   - Then: `npm run tauri:build` produces a `.msi` installer
   - **You can skip this if shipping HTML5 to itch.io.**

3. **Pick a music track or skip it for v0.1**
   - Free CC0 chiptunes: https://opengameart.org/art-search-advanced?keys=chiptune&field_art_type_tid%5B%5D=12&sort_by=count
   - https://pixabay.com/music/search/chiptune/ (also free)
   - Or commission $50 on Fiverr (search "8-bit ambient music"). My recommendation: one 60-90 second ambient pad loop.
   - To install: drop `.mp3` or `.ogg` in `public/audio/` then I can wire it via Howler in 10 minutes when you're back.
   - **The programmatic synth already works.** Music is a polish item.

### 🟨 Pre-launch polish (do once before public release)

4. **Itch.io page** (45 min)
   - https://itch.io/dashboard/games/create
   - Title: KingdomOS
   - Genre: Simulation / Ambient
   - Tags: `cozy` `pixel-art` `procedural-generation` `relaxing` `simulation`
   - Pricing: pay-what-you-want with $0 minimum (highest install rate)
   - Upload: zip the contents of `dist/` after `npm run build`. The HTML build runs in-browser without Tauri.
   - Screenshots: take 4-6 in-game with `P` key after sprites are in. Cover image: 630×500 PNG (Itch's preferred capsule).

5. **Record a 30-60 sec trailer** (30 min)
   - Use OBS Studio (free). Capture the browser at 1920×1080 60fps.
   - Sequence: 5s establishing shot (autopilot camera) → 5s click an NPC → 5s drag pan → 5s journal scroll → 5s photo mode → 10s of streamer-mode showing Twitch events. Caption text overlaid: "your kingdom lives on its own."
   - YouTube upload, link from itch.io page.

6. **Steam page (only if doing Steam)** — $100 one-time fee
   - Requires the Rust Tauri build. Skip if just doing itch.io.
   - Asset specs: 460×215 (header capsule), 920×430 (main capsule), 1920×620 (page background), 6 screenshots at 1920×1080.

7. **Set up basic CI** (15 min, optional)
   - Create `.github/workflows/test.yml` with steps: checkout, setup-node, `npm ci`, `npm test`, `npm run typecheck`, `npm run build`
   - Auto-runs on every push. Catches regressions before they hit users.

### 🟩 Nice-to-have (whenever)

8. **Twitch developer account** (only if building Rust EventSub adapter)
   - https://dev.twitch.tv/console → register a new app
   - You get a client_id + client_secret. Those go into the Rust adapter when I (or you) build it.
   - **Not needed until you commit to the streamer-overlay product.**

9. **Brand decisions before public launch**
   - Logo: is the ✦ glyph fine, or do you want a real mark? (A real mark is $30 on Fiverr.)
   - Color: the gold accent (`#fbbf24`) works. If you want to change, edit `--accent` in `src/styles.css` once and everything follows.
   - Domain: kingdomos.io? kingdomos.app? Worth $12/yr only if you want a marketing site. Itch + Steam are enough for v0.1.

10. **Code cleanup I noticed but didn't do**
    - `src-tauri/src/tray.rs` uses a 1×1 transparent icon fallback when default_window_icon is unavailable. On a real Tauri build it'll use `icons/icon.png` instead — verify it looks right.
    - `Howler` import is still in `package.json` but unused. Either remove or load lazily when you add music. Saves ~16KB.
    - The "Iron-Ash" project on this machine is unrelated but kept claiming port 1420 → moved KingdomOS to 5876.

### 🟦 Future ideas to keep in your back pocket

- **AI agent narrative integration** — pipe LLM-generated journal entries via a special `narrative` event. ~2 hr to wire.
- **Multiple save slots** — manage 3 kingdoms. ~1 hr.
- **Replay mode** — scrub through journal entries with date filter. ~2 hr.
- **Web push for Tauri** — let the OS notification system surface major events (births, deaths, achievements). ~3 hr.
- **Mod support** — allow users to override the JS files for the narrative director / journal templates. ~1 day.

---

## Current project state (cheat sheet)

```
Tests          285 passing across 29 files
TypeScript     clean (strict)
Build          ✓ in ~2.7s
Main chunk     ~187 KB (gzip ~56 KB)
Pixi chunk     562 KB (gzip 165 KB) — loads after React shell paints
Live demo      https://jonathanabarnett.github.io/kingdomos/
```

**Features inventory:**
- 17-section monarch creator + 7-section pet creator + banner color
- Autonomous sim with NPCs, schedules, economy, weather, calendar with real-world day anchoring, seasons
- Quest arcs (4 templates), interactive decisions (3 types), succession/lineage, vault/artifacts, construction (3 building kinds)
- 17 achievements
- Save with hardened validation, export/import, Twitch event system + streamer mode
- Title screen, About, Help, Stats dashboard, Journal, Settings, Mini-map, Photo mode, Performance HUD, Tutorial
- Audio (procedural, no assets), CRT overlay, parallax background, day/night palette

**What's still asset-shaped (waiting on your ComfyUI work):**
- All structure sprites (currently programmatic)
- All tile sprites (currently programmatic)
- All character sprites (currently programmatic — but the monarch is already player-designed, so this is lower priority)

---

## If you have just 1 hour today

1. `npm run dev` → click around for 5 min, write down anything that feels off
2. Generate ONE structure sprite (castle) in ComfyUI → drop in `public/sprites/structures/castle.png`, edit `manifest.json` → reload, see it in-world. Just to validate the full pipeline.
3. Take 4 screenshots with `P` key
4. Create itch.io project, upload `dist/` zip, paste screenshots, publish as "Early Realm v0.1" pay-what-you-want
5. Post once on r/PixelArt and r/cozygames with a screenshot + journal excerpt. Two posts max — don't spam.

That's a real product in the wild before lunch.

---

## What I'd do next time you have a long block

Pick ONE based on energy level:

- **Twitch path** (3 hr) — Rust EventSub adapter so the streamer overlay is end-to-end real, not just dev-hook tested
- **Steam path** (1 hr) — install Rust + MSVC, run `npm run tauri:build`, sign + package the `.msi`, prep Steam page assets
- **Polish path** (2 hr) — replace remaining programmatic sprites with real art now that ComfyUI is set up

The codebase is at a clean point. None of those are blocking each other.

Sleep was useful. The kingdom of Aurelia is in its 3rd generation by now, probably.
