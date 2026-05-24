# Auto-updater setup

The Tauri auto-updater is wired (Cargo plugin, npm packages, frontend
toast, capability) but it won't actually do anything until you complete
the **one-time signing key setup** below. Without a real signing key,
`tauri.conf.json` ships with a placeholder pubkey and the updater
plugin refuses to apply downloaded packages.

## 1. Generate a signing keypair (one time, on your dev machine)

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/kingdomos.key
```

You'll be prompted for a passphrase. It produces two files:

- `~/.tauri/kingdomos.key` — **private key, keep secret**
- `~/.tauri/kingdomos.key.pub` — public key, safe to commit

## 2. Commit the public key

Open `src-tauri/tauri.conf.json` and replace the placeholder string
under `plugins.updater.pubkey` with the **contents of the .pub file**
(it's a single base64 line).

## 3. Add the private key to GitHub Actions secrets

In your repo settings → Secrets and variables → Actions, add:

- `TAURI_SIGNING_PRIVATE_KEY` — paste the contents of `~/.tauri/kingdomos.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the passphrase you set in step 1

## 4. Update the release workflow to sign artifacts

Your `.github/workflows/release.yml` already builds with `tauri-action`.
Ensure the build step has these env vars set:

```yaml
- uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
  with:
    tagName: v__VERSION__
    releaseName: 'KingdomOS v__VERSION__'
    includeUpdaterJson: true   # ← generates `latest.json`
```

`includeUpdaterJson: true` is the magic flag — it writes a
`latest.json` manifest into the GitHub Release that the updater
plugin polls for.

## 5. Verify the endpoint

`src-tauri/tauri.conf.json` is configured to poll:

```
https://github.com/jonat/kingdomos/releases/latest/download/latest.json
```

Adjust the org/repo name if it doesn't match.

## 6. Test it

1. Cut a release tag (e.g. `v0.2.0`) — workflow builds + uploads.
2. Bump `package.json` + `Cargo.toml` + `tauri.conf.json` to `0.2.1`.
3. Cut a second release tag — workflow builds + uploads `latest.json`.
4. Launch the previous build locally — within ~10 seconds, the
   "Update available" toast should appear in the bottom-right corner.

## What happens if a player can't auto-update?

The plugin gracefully fails. The `UpdateToast` component logs to
console and stays hidden. The player can manually re-download from
itch.io / GitHub Releases like before — nothing breaks.
