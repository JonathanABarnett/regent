# Road to v1.0.0

Current version: **0.2.0** (15 commits past founding, 466 tests, 80+ shipped features). This document is the honest path to a v1.0.0 release — what's actually required vs. what feels like polish vs. what should be deferred to v1.1+.

A v1.0.0 release is a commitment. It says: *"This is what you can buy. I will support it. Breaking changes only via 2.0."* The work isn't writing features — it's compressing what exists into something defensible.

---

## Where we actually are

### Done (and proven)
- Autonomous sim that runs for hours without input
- ~30 distinct narrative systems (cult, war, succession, holidays, …)
- Visual chrome: FF6 windowbox, font tier, chip HUD, snow caps, banners
- First-5-minutes hook: FoundingDay fanfare + Welcome Petition + FoundingMoment toast
- Consequences primitive — decisions can schedule downstream effects
- Multi-slot save management + import/export + crash log
- In-game video capture (.webm) for promo material
- Asset pipeline documented (procedural with manifest override)
- 466 / 466 tests passing
- Live demo deploys on every push to main
- 2 reviewed playtests (expert critic + casual-gamer) with major findings addressed

### Not yet
- Tested in production-mode build (`npm run build`) by a non-developer
- Code signed for Windows (SmartScreen will block first launch otherwise)
- Tauri auto-updater signing keys generated + CI configured
- Crash reporting endpoint stood up (currently no-op without `VITE_CRASH_ENDPOINT`)
- itch.io store page populated with art, GIFs, copy, price
- A real human (not an agent) playing for 30+ minutes and reporting back
- LLC / privacy policy / terms / press kit
- Steam page (deferred — not required for v1.0.0)
- Google Play / mobile (deferred — separate project)

---

## Phase 1 — Stop building. Get signal. (2-4 weeks)

**The single most important step.** Everything we've shipped in this session was guided by *imagined* play sessions (the agent playtests had to read code, not actually play). Until real humans put in 30+ minutes, we don't know which polish is real and which is decorative.

### Concrete actions

- [ ] Cut **v0.3.0-rc1** — a public "release candidate" tag with everything that landed this session
- [ ] Push to itch.io as a **public alpha** at $0 / pay-what-you-want
- [ ] Recruit **10-20 testers** — friends, family, a Reddit post in r/incremental_games or r/Tinygames, a Bluesky post, anyone with an attention span
- [ ] Ask each tester:
  - Did you finish a 30-minute session, or close early?
  - At minute 5 — exciting / confused / bored / closed the tab?
  - What was the most interesting thing that happened?
  - What was the most confusing UI element?
  - Would you come back tomorrow without being asked?
- [ ] Watch what they actually do (Sentry / FullStory / a tiny telemetry endpoint). What buttons do they click? When do they pause? Do they EVER open the Family panel?
- [ ] Catalog every drop-off, confusion, and "oh nice!" moment in a single doc

**Decision gate**: don't move to Phase 2 until you have ≥10 sessions logged, ideally from people who don't already know you. If the response is "this is cool but I closed it after 4 minutes," the next phase isn't store assets — it's content.

**Why this is unskippable**: the cost of a bug noticed by 5,000 buyers is reputational. The cost of a bug noticed by 5 testers is a Tuesday.

---

## Phase 2 — Address what playtesting reveals (2-4 weeks)

This phase is unknowable in advance. The size depends on what testers say. Common patterns from indie launches:

### Likely (based on existing playtest signal)
- Decisions accumulate in some scenarios → triage
- Specific button labels are confusing → rewrite microcopy
- Some panels never get opened → consolidate or remove
- The first decision needs to fire even sooner than +2 days
- Player wants to *do* more than just react to prompts

### Possible (depending on testers)
- The world is too quiet between events → tune NarrativeDirector cadence
- Speech bubbles are too rare / too frequent
- Camera autopilot is annoying / not noticed
- Music is too ambient / too sparse
- The cult arc lands too aggressively / too softly

### Out of scope for v1.0
- Anything that requires a new core system
- Anything that breaks save format
- Visual overhauls beyond procedural sprite tweaks

**Budget**: if a tester's complaint takes more than a day to address, defer to v1.1. Resist scope creep — v1.0.0 is "what you buy today," not "what it might be."

---

## Phase 3 — Production hardening (1-2 weeks)

The infrastructure that turns "a dev preview" into "a thing you can sell."

### Code signing (Windows)

Without this, every first-launch shows "Windows protected your PC" SmartScreen warning. ~70% of testers bail at that screen.

- [ ] Buy a Sectigo standard code-signing certificate (~$200/yr) or DigiCert (~$300/yr)
- [ ] Cert delivery takes 3-5 business days
- [ ] Add cert thumbprint to `src-tauri/tauri.conf.json` under `bundle.windows.certificateThumbprint`
- [ ] Add `TAURI_KEY_PASSWORD` to GitHub Actions secrets
- [ ] Cut a signed test build, install on a fresh machine, verify no SmartScreen warning

### Auto-updater (Tauri)

We shipped the wiring; the keys aren't generated yet. See [`UPDATER.md`](UPDATER.md) for the full setup.

- [ ] `npx @tauri-apps/cli signer generate` — make a one-time keypair
- [ ] Paste public key into `tauri.conf.json` under `plugins.updater.pubkey`
- [ ] Add `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to GitHub Actions secrets
- [ ] Update `.github/workflows/release.yml` with `includeUpdaterJson: true`
- [ ] Cut two test releases (e.g. v0.4.0 → v0.4.1) and verify the `UpdateToast` actually surfaces + the update applies cleanly

### Crash reporting

Currently `lib/crashLog.ts` is local-only. To see crashes from the wild:

- [ ] Stand up a tiny Cloudflare Worker (free tier) at `https://crashlog.kingdomos.app` that accepts POST `{name, message, stack, version}` and writes to a KV store or D1
- [ ] OR sign up for Sentry free tier and replace `sendRemote()` with `Sentry.captureException`
- [ ] Set `VITE_CRASH_ENDPOINT` in the production build env
- [ ] Verify a deliberate `throw new Error("test")` in dev shows up in the endpoint

### QA pass

- [ ] Production-mode build (`npm run build`) tested on a fresh machine that's never seen the project
- [ ] Tested in **Firefox, Chrome, Safari** (web demo) — Safari often surfaces edge cases the others don't
- [ ] Tested at **3 monitor sizes**: 1366×768 (laptop), 1920×1080 (standard), 3840×2160 (4K — does the retro upscale look right?)
- [ ] Background-tab behaviour (sim throttling, audio context suspension, save persistence)
- [ ] Cold boot, found kingdom, close window, reopen — verify autosave restored everything
- [ ] Performance audit: 60fps maintained at year 30+ with 200 NPCs?

---

## Phase 4 — Store + business setup (1-2 weeks)

The work that turns "a downloadable build" into "a thing on a store page."

### itch.io page

- [ ] **Cover image** (630×500 PNG) — use the `KingdomCard` component to generate one, or use Photopea/Aseprite for a hand-composed scene
- [ ] **Banner** (960×250 PNG) — optional but recommended; same source
- [ ] **4-6 screenshots** (1920×1080) — captured via Photo Mode (`P` key). Pick: cutaway view of NPCs inside buildings, a festival, sunset over the castle, a winter snow scene, the Welcome Petition decision, the Journal showing a real chronicle
- [ ] **15-30s GIF or WebM** — record gameplay with the new VideoCapture button. Show a decision being made + the world reacting
- [ ] **Page copy** — already drafted at [`ITCH.md`](ITCH.md); finalize tags, system requirements
- [ ] **Pricing decision** — see "Pricing reality check" below
- [ ] **Demo + Buy tier** — itch.io supports "demo build" alongside paid main build

### Privacy policy + terms

Required for any store that handles user data (which is anything with even an opt-in crash log).

- [ ] Generate from a template — `termly.io`, `iubenda.com`, or a lawyer-reviewed sample from a similar indie
- [ ] Cover: what we collect (crash logs, only on opt-in), what we don't (no telemetry, no analytics), retention period, contact email
- [ ] Host on the existing pages site (e.g. `jonathanabarnett.github.io/kingdomos/privacy`)

### Business entity

Optional for an itch.io launch under your personal name; required if you expect serious revenue or want liability separation.

- [ ] Consider forming an LLC via online service (Stripe Atlas, ZenBusiness, ~$200-500 total fee)
- [ ] Get an EIN (free, IRS website, 10 minutes)
- [ ] Open a separate business bank account
- [ ] itch.io payout configured against the business

### Press kit

For when (not if) someone writes about the game.

- [ ] Folder at `assets/marketing/press-kit/` with: logo, 6 screenshots, 1 GIF, fact sheet (1-page PDF), founder bio
- [ ] Host as a zip download
- [ ] Use `presskit()` template — https://dopresskit.com — if you want it polished

---

## Phase 5 — v1.0.0 release (1 week)

The actual launch.

- [ ] Final QA pass on the release-candidate build
- [ ] Update `package.json` + `Cargo.toml` + `tauri.conf.json` versions to 1.0.0
- [ ] Generate `CHANGELOG.md` entry covering everything since 0.2.0
- [ ] Tag `v1.0.0`, push, let CI build + publish to itch.io
- [ ] Test the auto-updater works (install 0.9.x, watch it update to 1.0.0)
- [ ] **Launch post** — itch devlog + Bluesky + a single Reddit post in the right sub (r/Tinygames or r/indiegaming, not r/gaming)
- [ ] Submit to indie aggregators: warpdoor.com, indieboost, freeindie
- [ ] Send press-kit links to 5-10 indie journalists/streamers from a personally-curated list (NOT a mass email)
- [ ] Watch crash log + itch.io comments daily for the first week
- [ ] Be available to ship 1.0.1 patch within 48 hours if anything serious breaks

---

## Pricing reality check

The math nobody likes:

- **At $0.99 on Google Play**: Google takes 30%, so you net ~$0.69/sale. Minimum-wage equivalent for the work already invested (~200 hours, ~$15/hr = $3,000) requires **~4,300 downloads**. That's a lot for a niche ambient sim.
- **At $4.99 on itch.io**: itch's default revenue share is "your choice" (often 90/10 in your favour). At 90% = $4.49/sale. **~670 downloads** for the same $3,000.
- **Pay-what-you-want, $1 minimum**: typically averages $3-4 once you account for the players who tip above minimum. Roughly equivalent to a fixed $4 price but lets price-sensitive players in.

**Recommendation**: itch.io PWYW with $2 minimum. Lower than your effort deserves; high enough that ambient-sim fans who genuinely value the thing will tip $5-15. The 99¢ Google Play story is a different conversation (Android port = months of separate work).

Honest framing: **treat the revenue as a bonus, not the goal.** This is portfolio work + a thing that exists in the world + a satisfying engineering project. If it makes $5,000 in year one, that's good. If it makes $50,000 you'll know because a streamer covered it — not because of anything strategic you did.

---

## Out of scope for v1.0.0 (defer to 1.x)

These keep coming up but should NOT block 1.0.0:

- Steam release ($100 dev fee + 30% cut + Steam-specific QA + Steam Workshop integration; later)
- Android / iOS port (Tauri Mobile is still beta-y; separate project)
- Multiplayer / shared kingdoms (different game)
- Mod support (load custom JSON quest packs from a folder)
- Achievements / leaderboards via Steam
- Localization (English-only is fine for v1.0; community contributions for translations post-launch)
- AI-generated sprites (the procedural pipeline ships; authored art is v1.x content)
- macOS / Linux native builds (Tauri supports both; defer until requested)

---

## Calendar estimate

Realistically:

| Phase | Calendar weeks | Active work |
|---|---|---|
| 1. Playtest with real humans | 2-4 | low (your work is recruiting + watching) |
| 2. Address playtest findings | 2-4 | medium-high |
| 3. Production hardening | 1-2 | medium |
| 4. Store + business setup | 1-2 | medium |
| 5. v1.0.0 release week | 1 | high |
| **Total** | **7-13 weeks** | |

Compressible to 4-6 weeks if you skip Phase 1 (don't). The unskippable items are: code-signing cert delivery (3-5 business days, gated by Sectigo) + playtest signal collection (gated by humans being slow).

---

## The single decision that matters most

**Do you ship 1.0.0 to feel done, or do you ship 1.0.0 to start building an audience?**

If "feel done": skip Phase 1, do Phase 3 + 4 in parallel, tag v1.0.0 in ~3 weeks. The launch will be quiet but the artifact will exist.

If "build an audience": do Phase 1 first, no matter how painful. The playtest data is the only thing that turns a quiet launch into a noisy one — because the people who playtested will tell their friends if (and only if) the game is good. Without that, you're shouting into the indie void.

Different choices for different goals. Both are legitimate. Be honest about which you're doing.
