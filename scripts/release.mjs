#!/usr/bin/env node
/**
 * One-command release.
 *
 * Usage:
 *   npm run release -- <version>   (e.g. 0.2.0)
 *   npm run release -- patch       (bump patch from package.json)
 *   npm run release -- minor       (bump minor)
 *   npm run release -- major       (bump major)
 *
 * What it does, in order:
 *   1. Sanity: clean working tree, on main/master branch (configurable)
 *   2. Run typecheck + tests (mirrors what CI will run)
 *   3. Bump version in package.json
 *   4. Generate CHANGELOG entry (via changelog.mjs)
 *   5. Commit "release: vX.Y.Z" + tag vX.Y.Z
 *   6. Print next-step instructions (manual `git push --follow-tags`)
 *
 * Push is intentionally NOT automatic — gives you one last look before
 * shipping. Once you push the tag, .github/workflows/release.yml triggers
 * the itch.io deploy.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const pkgPath = join(repoRoot, "package.json");

function sh(cmd, { silent = false } = {}) {
  try {
    return execSync(cmd, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: silent ? "pipe" : "inherit",
    });
  } catch (err) {
    if (silent) return "";
    throw err;
  }
}

function shOutput(cmd) {
  return execSync(cmd, { cwd: repoRoot, encoding: "utf8" }).trim();
}

// 0. Parse desired version
const arg = process.argv[2];
if (!arg) {
  console.error("Usage: npm run release -- <version|patch|minor|major>");
  process.exit(2);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const current = pkg.version;
let next;
if (/^\d+\.\d+\.\d+(?:-\S+)?$/.test(arg)) {
  next = arg;
} else if (["patch", "minor", "major"].includes(arg)) {
  const [maj, min, pat] = current.split(".").map(Number);
  if (arg === "patch") next = `${maj}.${min}.${pat + 1}`;
  else if (arg === "minor") next = `${maj}.${min + 1}.0`;
  else next = `${maj + 1}.0.0`;
} else {
  console.error(`[release] don't understand "${arg}". Use X.Y.Z or patch|minor|major.`);
  process.exit(2);
}

console.log(`→ Releasing v${next} (current v${current})`);

// 1. Sanity checks
console.log("→ Checking git state...");
const status = shOutput("git status --porcelain");
if (status) {
  console.error("[release] working tree is dirty. Commit or stash first:");
  console.error(status);
  process.exit(1);
}
const branch = shOutput("git rev-parse --abbrev-ref HEAD");
if (branch !== "main" && branch !== "master") {
  console.warn(`[release] WARNING: you're on branch '${branch}', not main/master.`);
}
// Check tag doesn't already exist
try {
  shOutput(`git rev-parse v${next}`);
  console.error(`[release] tag v${next} already exists.`);
  process.exit(1);
} catch {
  // Tag doesn't exist — good
}

// 2. Typecheck + tests
console.log("→ Running typecheck + tests...");
sh("npm run typecheck");
sh("npm test");

// 3. Bump version
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`→ Bumped package.json: ${current} → ${next}`);

// 4. Generate changelog entry
console.log("→ Generating CHANGELOG entry...");
try {
  sh(`node scripts/changelog.mjs ${next}`);
} catch {
  console.warn("[release] changelog generation failed — continuing without it.");
}

// 5. Commit + tag
console.log("→ Committing and tagging...");
sh(`git add package.json CHANGELOG.md`);
sh(`git commit -m "release: v${next}"`);
sh(`git tag -a "v${next}" -m "v${next}"`);

console.log(`\n✓ Released v${next} locally.\n`);
console.log(`Next: review CHANGELOG.md, then push:\n`);
console.log(`    git push --follow-tags\n`);
console.log(`That triggers .github/workflows/release.yml to deploy to itch.io.`);
console.log(`If you need to back out: git tag -d v${next} && git reset --hard HEAD~1`);
