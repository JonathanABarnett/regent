# KingdomOS — Automation Reference

Every automated pipeline in this project, what it does, and how to engage with it.

## Pre-commit hook

Local guard that runs typecheck + tests before each commit. Install once after cloning:

```sh
npm run hooks:install
```

This writes `.git/hooks/pre-commit` (zero npm dependencies). Bypass for a single commit with `git commit --no-verify`. CI catches anything you bypass anyway.

## CI workflows

### `.github/workflows/test.yml` — on every push/PR

- Type-check
- Run all 164+ tests
- Production build
- Upload `dist/` as a 7-day artifact

Green badge in README means everything is healthy.

### `.github/workflows/release.yml` — on tag push (`v*.*.*`)

- Everything from `test.yml`
- Deploy `dist/` to itch.io via [Butler](https://itch.io/docs/butler/)
- Upload `dist/` as a 90-day artifact

**Required GitHub secrets:**
- `BUTLER_API_KEY` — from <https://itch.io/user/settings/api-keys>
- `ITCH_USER` — your itch.io username
- `ITCH_GAME` — the project slug (e.g. `kingdomos`)

Set these once in repo Settings → Secrets and variables → Actions. After that every `git push --follow-tags` ships a release.

### `.github/workflows/nightly.yml` — every day at 03:00 UTC

- Fresh `npm ci` from cold cache
- `npm audit` (warn-only)
- Type-check, tests, build
- On failure: **automatically opens a GitHub issue** so you wake to a flag

Catches dependency drift, new CVE disclosures, and CI infrastructure issues before they bite a real release.

### `.github/dependabot.yml` — weekly + monthly

- **npm** (Monday 09:00 ET): minor + patch grouped to reduce PR noise, majors arrive individually
- **GitHub Actions** (monthly): action version updates
- **Cargo** (Monday): Rust crate updates for `src-tauri`

Major bumps of `pixi.js`, `react`, and `react-dom` are pinned — those need attention, not autopilot.

## Release pipeline

Ship a new version with one command:

```sh
npm run release -- 0.2.0      # or patch / minor / major
git push --follow-tags        # the only manual step
```

The release script:

1. Verifies the working tree is clean
2. Verifies the tag doesn't already exist
3. Runs typecheck + tests (fails the release if either fails)
4. Bumps `package.json` version
5. Generates a `CHANGELOG.md` entry from conventional-commit-prefixed messages
6. Commits `release: vX.Y.Z` and creates an annotated tag
7. Prints the push command (intentionally manual — last look before shipping)

If you need to back out before pushing:

```sh
git tag -d v0.2.0
git reset --hard HEAD~1
```

## Changelog generator

```sh
npm run changelog -- 0.2.0
```

Pulls commits since the last `v*.*.*` tag, groups them by Conventional Commits prefix (`feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `chore:`, `ci:`, `build:`, `style:`), and prepends the new section to `CHANGELOG.md`. Commits without a recognized prefix land in "Other" so you can edit them before tagging.

You don't normally call this directly — `npm run release` invokes it. But if you want to preview what would be generated, run it standalone.

## Conventional Commits cheat sheet

Use these prefixes so the changelog auto-categorizes correctly:

```
feat: add the news ticker to the title screen
fix: dedup villager spawn on twitch re-sub
perf: split pixi into its own chunk
refactor: extract sprite manifest loader
docs: expand security threat model
test: add stress suite for 5000-tick perf
chore: bump @types/node
ci: add nightly health check workflow
build: enable rollup manualChunks
style: tweak HUD button hover state
```

Scope is optional: `feat(audio): add achievement chime`.

## How everything chains together

```
1. You commit                  → pre-commit hook runs typecheck + tests (local)
2. You push                    → test.yml runs (CI cloud)
3. You run npm run release     → bumps version, generates changelog, tags
4. You push --follow-tags      → release.yml runs (deploys to itch.io)
5. Daily at 03:00 UTC          → nightly.yml runs (catches drift)
6. Weekly Monday               → dependabot opens PRs for safe bumps
```

The point of all of this: **you never need to remember which command to run**. The chain catches mistakes at the earliest cheap stage (pre-commit) and the slowest correct stage (CI). You write code; the pipeline ships it.

## Manual escape hatches

- `git commit --no-verify` — skip pre-commit
- `git push origin :v0.2.0` — delete a remote tag (e.g., shipped wrong version)
- Workflow `workflow_dispatch` — manually trigger any CI from the Actions tab
- `npm run build` — produce a `dist/` without going through release

## What's NOT automated (intentional)

- **Pushing to remote.** Every tag/release requires a manual `git push`. No accidental ships.
- **Closing dependabot PRs.** Each merge is a human decision because npm has shipped bad versions before.
- **Steam deploys.** Steam Direct requires manual upload through Steamworks; not safe to automate.
- **Tauri desktop builds.** Cross-compile from Linux CI to Windows is possible but flaky; do it locally on a Windows machine when ready.
