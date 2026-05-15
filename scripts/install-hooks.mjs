#!/usr/bin/env node
/**
 * Install local git hooks. Run once after cloning: `npm run hooks:install`.
 * Adds a pre-commit hook that runs typecheck + tests and blocks the commit
 * on failure. Zero npm dependencies — just writes the hook file.
 *
 * Skip via: `git commit --no-verify` (use sparingly; CI catches it anyway).
 */

import { writeFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const hooksDir = join(repoRoot, ".git", "hooks");

if (!existsSync(join(repoRoot, ".git"))) {
  console.error("[install-hooks] No .git directory found. Run `git init` first.");
  process.exit(1);
}

if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

const preCommit = `#!/bin/sh
# KingdomOS pre-commit hook — installed by scripts/install-hooks.mjs
# Runs typecheck + tests. Bypass with --no-verify (CI still catches it).

set -e

echo "→ kingdomos pre-commit: typecheck"
npm run typecheck --silent

echo "→ kingdomos pre-commit: tests"
npm test --silent

echo "✓ pre-commit checks passed"
`;

writeFileSync(join(hooksDir, "pre-commit"), preCommit);
try {
  chmodSync(join(hooksDir, "pre-commit"), 0o755);
} catch {
  // Windows doesn't have meaningful chmod; ignore
}

console.log("✓ pre-commit hook installed at .git/hooks/pre-commit");
console.log("  Runs `npm run typecheck && npm test` before each commit.");
console.log("  Bypass once: git commit --no-verify");
