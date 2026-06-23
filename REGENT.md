# Regent — Charter

> The committed direction for this fork. Read this before building a feature.
> If a change doesn't serve the loop or differentiators below, it's probably KingdomOS work, not Regent work.

## What Regent is

**A medieval kingdom that ages on your real calendar while you work, brings you only its hardest questions, and writes a shareable chronicle of everything you missed — the first desktop companion with the soul of Dwarf Fortress.**

You are the **conscience of the crown, not its hands.** You never build, place, route, or micromanage. The world ticks on its own; you intervene on your breaks, and it remembers what you chose — and what you didn't.

This is a **fork of KingdomOS**, not a rewrite. Regent is a *superset of what already ships*: it keeps the ~40-system headless sim and re-points it from "ambient toy you watch" to "companion dynasty sim you steward."

## Why this, and not a full kingdom-sim fork

A naive full fork drops us into the Colony/Grand-Strategy tag — Steam's most expectation-heavy, lowest-median lane — to fight CK3 on depth, RimWorld/Norland on emergent drama, and Manor Lords on logistics, on the one axis (active-play control/UX) where this engine has **zero** advantage (camera/hover/select input only; no command, job, or blueprint layer). That's a near-total rebuild and a death march for a solo dev.

The defensible move is the opposite: **keep the calendar-aging companion loop as the spine — the one thing the giants are structurally barred from copying — and make the already-shipped chronicle export the viral hook.**

## The core loop

1. The kingdom surfaces a decision (`Decisions.ts`) — a faced petitioner, a succession crisis, a hard trade-off — each option carrying a plain-English consequence hint.
2. You read the situation from the Journal/Chronicle, then **act** (pick an option / set an edict) or **deliberately abstain** — silence is a real move (`Decisions` auto-resolves on expiry; `Consequences.ts` schedules the deferred fallout days out).
3. The world advances; named NPCs age, marry, are born, and die (`LifeEvents`/`Succession`/`MonarchLegacy`/`Remembrance`); the journal records what your choice — or silence — became.
4. **Ambient/away mode:** the calendar keeps running between sessions. On return, `runAwayProgression`/`World.fastForwardDays` replays missed days, ages the NPCs, and holds + caps the decisions that piled up (`MAX_CHECKIN_DECISIONS = 4`) — the Steward's Report.
5. At a natural inflection — a dynasty falls, a jubilee, a usurper wins — you **export the saga** (seed + chronicle + card + clip) and post it.

**A session feels like:** open it Monday on your second monitor; the Steward's Report says the old queen died Thursday and her heir is feuding with the cult that tripled over the weekend; four decisions wait; you spend eight minutes, set one standing edict, watch the consequences ripple, and close it. Friday the edict has either saved the harvest or started a revolt — and the chronicle remembers exactly why.

## Where Regent wins (the only edges that survived adversarial review)

1. **Real-calendar aging + permadeath-memory as the *core* loop** — the only true structural moat. A deep sim that ages on your wall clock and can permanently lose named people while you're away, then tells you what you missed. The giants are sit-down apps; they cannot ship this in a patch.
2. **A *shipped* export/share pipeline** (`chronicle-generator.ts`, `kingdom-card-renderer.ts`, `VideoCapture.tsx`) — one-tap seed-stamped saga + card + clip. This is the word-of-mouth/off-Steam discovery engine a cold-start solo dev lives or dies on. DF and CK3 trap their stories behind UI.
3. **Reigns-accessibility on top of a *real remembering simulation*** — `Decisions.ts` gives swipe-simplicity; `Consequences.ts` gives "the thing you did three rulers ago is why this is happening." That bridge is genuinely unoccupied.
4. **Warm, legible 16-bit** against a genre whose chronic wound is opacity (DF's learning curve, Norland's unreadable icons). A real wedge — but it rides on 1–3, it doesn't stand alone.

## Fights to avoid (where we'd get crushed)

- **Succession/intrigue depth vs CK3** — ours is eldest-bloodline + procgen fallback. Never market on dynasty *depth*.
- **Pawn control / colony substrate vs RimWorld/Norland** — no needs-AI, no job queue, no placement. **Never tag "Colony Sim."**
- **Logistics/economy vs Manor Lords/Songs of Syx** — abstract global-float economy. Not our lane.
- **Content-volume comparisons** in expectation-heavy tags. We win on the *novel loop*, not on breadth.
- **The screensaver failure mode** — if interventions are too rare/low-stakes, autonomy reads as "why am I here?" This is the one genuine design risk; it's a *tuning* problem, which is why it's survivable.

## Comparables (one line each)

| Game | Where Regent loses | Where Regent wins |
|---|---|---|
| **Crusader Kings 3** | succession/intrigue depth | real-calendar aging + one-tap shareable chronicle |
| **RimWorld** | no control layer at all | "the storyteller *runs* it, you're the conscience" |
| **Dwarf Fortress** | sim depth (don't chase) | legible 16-bit; stories are one-tap postable, not UI-trapped |
| **Norland** | owns the depth end of this exact niche | the readable, breathing, *companion* version |
| **Reigns** | shallow fast | a real remembering simulation, not scripted rails |
| **Yes, Your Grace** | — (price/shape to emulate: $19.99) | "nudge, never steer" with a real consequence queue |
| **Rusty's Retirement** | cozy-idler tone/price (~$7) | the only differentiated neighbor on the companion shelf |

## Build path — evolve, don't rebuild

**Reuse as-is (the expensive part, already done):** the ~40 headless sim systems, `Decisions`, `Consequences`, `NarrativeDirector`, away-progression, `LifeEvents`/`Succession`/`MonarchLegacy`/`Remembrance`, factions/uprising/usurper, the export trio, save/load, the calendar.

**Build first, in order — and *gate before spending a full year*:**

1. **(2–4 wk — DO THIS FIRST) Intervention-cadence vertical slice.** Prototype the pause-and-decide rhythm until testers feel like *stewards*, not spectators. If it feels like a screensaver, stay a companion and stop. This is the whole bet — de-risk it first.
2. **(2–3 wk) Fix the determinism leak.** `Date.now()` is woven through many systems (event ids/ts, `Calendar.snapshot`, `Persistence`). Normalize wall-clock inputs so "paste my seed" is honest — *or* drop the bit-identical-replay claim and lean on the WebM/card share. Don't ship "run my seed" while it's partly false.
3. **(M) A readable sit-down view + goal / win-loss / end-of-chapter structure** (survive N generations, hit a legacy milestone), bounded by dynasty arcs.
4. **(M) Tutorialization** — the genre's chronic killer.
5. **(S) One-tap "publish my saga"** flow bundling seed + chronicle + card + clip, plus a gallery to receive them.

**Cut entirely (the death-march vector):** needs-AI, job-priority queues, task assignment, base-building/blueprint placement, supply-chain economy, tactical combat. Every hour here is an hour not spent on the only defensible differentiator — and it invites the comparison we lose.

## Go / No-Go gates (all three must pass before a full year of fork budget)

1. The web demo converts wishlists on the **"it ages while you're away"** hook specifically — not on active play.
2. Playtesters **voluntarily** re-share chronicle/seed/clip exports.
3. The `Date.now()` determinism leak is fixed, **or** the replay claim is dropped.

If the cadence slice (build step 1) or gate (1)/(2) fails, the correct answer reverts to **stay a companion** — a real, non-embarrassing outcome.

## Sellability

- **Platform:** Steam (Tauri desktop build), tagged **Desktop Companion + Simulation + Management** — *never* Colony Sim / Grand Strategy first. Keep a free web demo as the wishlist funnel.
- **Price:** **$12.99–$14.99** — above the ~$7 cozy-idler norm (justified by dynasty/chronicle depth), below the $30–40 deep-sim band that invites the CK3/RimWorld comparison.
- **Steam one-liner:** *"A medieval kingdom that ages on your real calendar while you work, brings you only its hardest questions, and writes a shareable chronicle of everything you missed."*
- **Capsule:** a warm 16-bit throne room, a faced petitioner mid-decision, a torn calendar-page edge; overlay: *"The first companion game with the soul of Dwarf Fortress."*
- **6-second trailer beat (uncopyable by a sit-down sim):** kingdom idling in the screen corner → days blur past while the user "works" → notification: *"While you were away: the queen died, an heir took the throne, the harvest failed"* → cut to the chronicle card exporting with its seed stamped on it.
