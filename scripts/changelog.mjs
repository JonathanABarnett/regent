#!/usr/bin/env node
/**
 * Generate / append a CHANGELOG.md entry for the current release.
 *
 * Usage:
 *   npm run changelog -- <version>
 *
 * Picks up commits since the last vN.M.K tag (or all history if none).
 * Groups them by conventional-commit prefix (feat / fix / etc) and inserts
 * the new section at the top of CHANGELOG.md.
 *
 * If the conventional-commit prefix is missing, the commit lands in "Other"
 * and you can edit it before releasing.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const CHANGELOG = join(repoRoot, "CHANGELOG.md");

const version = process.argv[2];
if (!version) {
  console.error("Usage: npm run changelog -- <version>   (e.g. 0.2.0)");
  process.exit(2);
}

function sh(cmd) {
  return execSync(cmd, { cwd: repoRoot, encoding: "utf8" }).trim();
}

let lastTag = "";
try {
  lastTag = sh("git describe --tags --abbrev=0 --match 'v*.*.*'");
} catch {
  // No prior tag — get all history
  lastTag = "";
}

const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
let log = "";
try {
  log = sh(`git log ${range} --pretty=format:"%H%x09%s"`);
} catch {
  console.error("[changelog] git log failed — is this a git repo?");
  process.exit(1);
}

const lines = log.split("\n").filter(Boolean);

const groups = {
  Features: [],
  Fixes: [],
  Performance: [],
  Refactors: [],
  Docs: [],
  Tests: [],
  Chores: [],
  Other: [],
};

const PREFIX_MAP = {
  feat: "Features",
  fix: "Fixes",
  perf: "Performance",
  refactor: "Refactors",
  docs: "Docs",
  test: "Tests",
  chore: "Chores",
  ci: "Chores",
  build: "Chores",
  style: "Chores",
};

for (const line of lines) {
  const [hash, subject] = line.split("\t");
  if (!subject) continue;
  const m = subject.match(/^(\w+)(\([^)]+\))?:\s*(.+)$/);
  if (m) {
    const group = PREFIX_MAP[m[1].toLowerCase()] ?? "Other";
    groups[group].push({ hash, text: m[3], scope: m[2]?.replace(/[()]/g, "") });
  } else {
    groups.Other.push({ hash, text: subject });
  }
}

const today = new Date().toISOString().slice(0, 10);
let section = `## v${version} — ${today}\n\n`;

let hasContent = false;
for (const [group, entries] of Object.entries(groups)) {
  if (!entries.length) continue;
  hasContent = true;
  section += `### ${group}\n`;
  for (const e of entries) {
    const short = e.hash.slice(0, 7);
    const scope = e.scope ? `**${e.scope}:** ` : "";
    section += `- ${scope}${e.text} (\`${short}\`)\n`;
  }
  section += "\n";
}

if (!hasContent) {
  console.error("[changelog] no commits since last tag — nothing to write");
  process.exit(1);
}

const header =
  "# Changelog\n\n" +
  "All notable changes to KingdomOS are documented here. Format inspired by [Keep a Changelog](https://keepachangelog.com).\n\n";

let existing = "";
if (existsSync(CHANGELOG)) {
  existing = readFileSync(CHANGELOG, "utf8").replace(/^# Changelog\n+/, "").replace(/^All notable changes.*?\n+/s, "");
}

writeFileSync(CHANGELOG, header + section + existing);

console.log(`✓ wrote ${Object.values(groups).flat().length} entries to CHANGELOG.md under v${version}`);
console.log("  Review and edit before tagging the release.");
