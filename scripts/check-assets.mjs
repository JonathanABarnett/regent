#!/usr/bin/env node
/**
 * Asset audit — reports which sprites in the manifest are authored
 * (PNG path set) vs. still using the procedural fallback (null).
 *
 * Run with:  node scripts/check-assets.mjs
 *
 * Exits 0 always. The output is a punch list, not a CI gate — the
 * game runs fine on its procedural defaults, so a "0 of 14 authored"
 * report is not a failure, it's just useful information for deciding
 * where to spend your next pixel-art hour.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const MANIFEST_PATH = resolve(PROJECT_ROOT, "public/sprites/manifest.json");
const SPRITES_DIR = resolve(PROJECT_ROOT, "public/sprites");

const COLOR = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  amber: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function fileExists(rel) {
  return existsSync(join(SPRITES_DIR, rel));
}

/** Render one category section. Returns [authored, total]. */
function reportCategory(label, entries, isArrayValue = false) {
  console.log(`\n${COLOR.bold}${label}${COLOR.reset}`);
  let authored = 0;
  let total = 0;
  for (const [key, value] of Object.entries(entries)) {
    total++;
    let status;
    let detail;
    if (value === null || value === undefined) {
      status = `${COLOR.dim}—${COLOR.reset}`;
      detail = `${COLOR.dim}procedural fallback${COLOR.reset}`;
    } else if (isArrayValue) {
      // Tile arrays: count present + missing files
      if (!Array.isArray(value) || value.length === 0) {
        status = `${COLOR.dim}—${COLOR.reset}`;
        detail = `${COLOR.dim}procedural fallback${COLOR.reset}`;
      } else {
        const missing = value.filter((f) => !fileExists(`tiles/${f}`));
        if (missing.length === 0) {
          status = `${COLOR.green}✓${COLOR.reset}`;
          detail = `${value.length} variant${value.length === 1 ? "" : "s"}`;
          authored++;
        } else {
          status = `${COLOR.amber}!${COLOR.reset}`;
          detail = `${value.length} listed, ${COLOR.red}${missing.length} missing PNG${COLOR.reset}`;
        }
      }
    } else if (typeof value === "string") {
      // Single file ref
      const exists = fileExists(value);
      if (exists) {
        status = `${COLOR.green}✓${COLOR.reset}`;
        detail = value;
        authored++;
      } else {
        status = `${COLOR.red}✗${COLOR.reset}`;
        detail = `${COLOR.red}${value} (file not found)${COLOR.reset}`;
      }
    } else if (typeof value === "object" && value.sheet) {
      // Character sheet entry
      const exists = fileExists(value.sheet);
      if (exists) {
        status = `${COLOR.green}✓${COLOR.reset}`;
        detail = value.sheet;
        authored++;
      } else {
        status = `${COLOR.red}✗${COLOR.reset}`;
        detail = `${COLOR.red}${value.sheet} (file not found)${COLOR.reset}`;
      }
    } else if (typeof value === "object" && value.sheet === null) {
      status = `${COLOR.dim}—${COLOR.reset}`;
      detail = `${COLOR.dim}procedural fallback${COLOR.reset}`;
    } else {
      status = `${COLOR.dim}?${COLOR.reset}`;
      detail = `${COLOR.dim}unknown entry shape${COLOR.reset}`;
    }
    console.log(`  ${status}  ${key.padEnd(22)}  ${detail}`);
  }
  return [authored, total];
}

async function main() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  } catch (err) {
    console.error(`${COLOR.red}Could not read manifest at ${MANIFEST_PATH}${COLOR.reset}`);
    console.error(err.message);
    process.exit(1);
  }

  console.log(
    `${COLOR.cyan}${COLOR.bold}KingdomOS asset audit${COLOR.reset}  ${COLOR.dim}(manifest v${manifest.version})${COLOR.reset}`,
  );
  console.log(
    `${COLOR.dim}Anything marked "—" falls back to the procedural sprite at runtime.${COLOR.reset}`,
  );

  const totals = [];
  totals.push(reportCategory("Tiles", manifest.tiles ?? {}, true));
  totals.push(reportCategory("Structures", manifest.structures ?? {}));
  totals.push(reportCategory("Characters", manifest.characters ?? {}));
  totals.push(reportCategory("Props", manifest.props ?? {}));

  // Seasonal tiles need a slightly different walk
  const seasonalEntries = manifest.seasonalTiles ?? {};
  let seasonalCount = 0;
  for (const season of Object.keys(seasonalEntries)) {
    for (const tile of Object.keys(seasonalEntries[season] ?? {})) {
      seasonalCount++;
    }
  }
  if (seasonalCount > 0) {
    console.log(`\n${COLOR.bold}Seasonal tile overrides${COLOR.reset}  ${COLOR.dim}(${seasonalCount} slot${seasonalCount === 1 ? "" : "s"})${COLOR.reset}`);
    for (const season of Object.keys(seasonalEntries)) {
      const tiles = seasonalEntries[season] ?? {};
      for (const [kind, value] of Object.entries(tiles)) {
        const variants = Array.isArray(value) ? value.length : 0;
        const status = variants > 0 ? `${COLOR.green}✓${COLOR.reset}` : `${COLOR.dim}—${COLOR.reset}`;
        console.log(`  ${status}  ${(season + ":" + kind).padEnd(22)}  ${variants > 0 ? `${variants} variant${variants === 1 ? "" : "s"}` : `${COLOR.dim}procedural fallback${COLOR.reset}`}`);
      }
    }
  }

  // Atlas check
  console.log(`\n${COLOR.bold}Atlases${COLOR.reset}`);
  const atlases = manifest.atlases ?? [];
  if (atlases.length === 0) {
    console.log(`  ${COLOR.dim}—  none registered${COLOR.reset}`);
  } else {
    for (const atlasFile of atlases) {
      const exists = fileExists(atlasFile);
      const status = exists ? `${COLOR.green}✓${COLOR.reset}` : `${COLOR.red}✗${COLOR.reset}`;
      console.log(`  ${status}  ${atlasFile}`);
    }
  }

  // Summary
  const totalAuthored = totals.reduce((a, [n]) => a + n, 0);
  const totalSlots = totals.reduce((a, [, n]) => a + n, 0);
  const pct = totalSlots === 0 ? 0 : Math.round((totalAuthored / totalSlots) * 100);

  console.log("");
  console.log(
    `${COLOR.cyan}Summary${COLOR.reset}  ${COLOR.bold}${totalAuthored} / ${totalSlots}${COLOR.reset} sprite slots authored (${pct}%)`,
  );

  if (totalAuthored === 0) {
    console.log(
      `${COLOR.dim}Everything is procedural — the game looks like itself.\n` +
        `When you're ready to author art, start with ${COLOR.reset}${COLOR.bold}structures/castle.png${COLOR.reset}${COLOR.dim} — biggest visual return per hour.${COLOR.reset}`,
    );
  } else if (pct < 50) {
    console.log(
      `${COLOR.dim}Partial authored set. The procedural fallbacks fill the gaps invisibly.${COLOR.reset}`,
    );
  } else {
    console.log(
      `${COLOR.dim}Most of the game is authored art now.${COLOR.reset}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
