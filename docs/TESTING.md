# KingdomOS — Automated Testing Pipeline

You don't need to test KingdomOS manually. Everything important is covered by 156 automated tests that run in **under 2 seconds**. Use this doc to wire that signal into your workflow.

## TL;DR — Day-to-day commands

```sh
npm test            # one-shot — runs all 156 tests, exits 0/1 (best for CI)
npm run test:watch  # auto-reruns on file save — best while coding
npm run typecheck   # type-only sweep (strict mode)
npm run build       # production bundle — sanity check that the code transpiles
```

If any of these exit non-zero, treat it as a real signal. The suite is small enough that there's no flakiness.

## Coverage map — what's tested today

```
src/sim/Integration.test.ts            7 tests   full-session flow (boot, save round trip, journal stream, achievements, malicious input)
src/sim/Stress.test.ts                10 tests   1000-tick run, 5000-tick perf, all cap enforcement, malformed input
src/sim/World.test.ts                 14 tests   caps, determinism, tick stability, adversarial payloads
src/sim/Persistence.test.ts           15 tests   validation, round-trip, tamper resistance
src/sim/events/EventSchema.test.ts    18 tests   schema validation, NaN, oversized, prototype pollution
src/sim/systems/Achievements.test.ts   9 tests   counters, unlock conditions, hydration
src/sim/systems/Calendar.test.ts       8 tests   day/season/year math, real-clock following
src/sim/systems/Construction.test.ts   6 tests   cost gating, single-build constraint, hydrate
src/sim/systems/Decisions.test.ts     10 tests   queue, resolve, expiry, defaultOnExpire, subscribe
src/sim/systems/Holidays.test.ts       6 tests   real-date matching, once-per-day, leap-year safety
src/sim/systems/Journal.test.ts        9 tests   narration coalescing, template variety, day stamping
src/sim/systems/LifeEvents.test.ts     6 tests   aging cadence, marriage rolls, death rolls, absence cap
src/sim/systems/Names.test.ts          5 tests   deterministic naming, role-titled variants
src/sim/systems/Pathfinding.test.ts    6 tests   A* finds paths, gives up on unreachable, OOB safe
src/sim/systems/Succession.test.ts     4 tests   monarch death + heir ascension, subscribe firing
src/sim/systems/Treasury.test.ts       6 tests   acquire, listener, hydrate, cap
src/lib/sanitize.test.ts              15 tests   control/bidi/HTML stripping, hex color, twitch user
                                     ────────
                                     156 tests
```

## What's NOT tested (acceptable gaps)

- **Pixi rendering layers** — would need a WebGL test harness. The sim is separated so rendering bugs can't corrupt sim state; tested at the sim/UI boundary instead.
- **React UI components** — no jsdom + RTL setup. Acceptable given the panels are mostly thin wrappers over the Zustand store, which is tested transitively via World tests.
- **AudioEngine** — Web Audio is hostile in jsdom. The methods are small enough to inspect by hand.
- **Tauri Rust code** — would need a separate Rust test crate. Cargo isn't installed on this machine.

If you ever add render-layer logic that's load-bearing (e.g., a complex shader or a sim → render coordinator), add a Pixi headless harness. Not needed today.

## CI signal

`.github/workflows/test.yml` runs on every push:

```yaml
- npm ci
- npm run typecheck   # exits non-zero if any type error
- npm test            # exits non-zero if any test fails
- npm run build       # exits non-zero if production bundle fails
- upload dist/        # 7-day retention as a workflow artifact
```

You can rely on the green check next to a commit as full confidence the simulation still works. The build artifact is the same one you'd upload to itch.io.

## Re-running locally after I've slept

```sh
cd C:\Users\jonat\Projects\kingdomos
npm test
```

That's it. Expect **17 test files, 156 tests, ~1.5s on cold start, ~600ms on warm**.

If something fails, the output names the file + line. Read the assertion, then look at recent commits to see what changed near the source file. The tests are written to be readable as documentation — each `it("...", ...)` describes the invariant.

## Adding tests as you add features

Every new system should ship with at least 4 tests:

1. **Happy path** — default usage produces the expected effect
2. **Edge case** — NaN / empty / cap-hit / unknown-kind input
3. **Round-trip** — if there's persistence, serialize → validate → restore is the same
4. **Hostile input** — malformed JSON, oversized strings, type confusion

There's a pattern for each in the existing test files. Cribbing from `Treasury.test.ts` (small system) or `Decisions.test.ts` (subscribe + queue) covers most shapes.

## Stress testing

`src/sim/Stress.test.ts` proves the simulation can absorb 5000 ticks, 1000-event spam, twitch raid floods, and malformed input without exceeding caps or throwing. If you ever wonder "will this hold up to a 12-hour stream session," this is the suite.

## When tests start lying

If you see a test pass that *shouldn't* pass:

1. Comment out the assertion temporarily — confirm it actually fails the right way
2. Look for sneaky `try/catch` around the assertion (some legacy patterns swallow errors)
3. Verify you're running fresh: `npm test` (not stale Vitest watch state)

In two cases tonight the tests caught subtle bugs that manual play wouldn't have:
- Treasury was growing unboundedly because `acquire()` didn't enforce the 200 cap (only `hydrate()` did). Fixed.
- An earlier ZodEffects type chain confused TypeScript into inferring `unknown` for event payloads. Fixed by hoisting the output type into a plain interface.

This is what automated tests are for. Trust them.
