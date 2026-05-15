#!/usr/bin/env node
/**
 * Slice a character sprite sheet into individual frame PNGs and update
 * public/sprites/manifest.json so the engine picks it up on reload.
 *
 * Usage:
 *   node scripts/slice-sheet.mjs <input.png>
 *      [--cols=<n>] [--rows=<n>] [--frame=<size>] [--role=<role>]
 *
 * Defaults (matching the procedural placeholder layout):
 *   cols (frames per direction) = 4
 *   rows (directions)           = 4
 *   frame size                  = 32x32
 *   role                        = derived from input filename
 *
 * The script does NOT physically split the sheet into multiple files —
 * the engine slices at runtime. It just validates the dimensions and
 * updates the manifest to point at the right sheet.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = { input: null, cols: 4, rows: 4, frame: 32, role: null };
  for (const a of argv) {
    if (a.startsWith("--cols=")) args.cols = +a.slice(7);
    else if (a.startsWith("--rows=")) args.rows = +a.slice(7);
    else if (a.startsWith("--frame=")) args.frame = +a.slice(8);
    else if (a.startsWith("--role=")) args.role = a.slice(7);
    else if (!args.input) args.input = a;
  }
  return args;
}

async function readPngDimensions(filePath) {
  const buf = await fs.readFile(filePath);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  // IHDR chunk: bytes 16-19 = width, 20-23 = height
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("Usage: node scripts/slice-sheet.mjs <input.png> [--cols=4] [--rows=4] [--frame=32] [--role=villager]");
    process.exit(2);
  }
  const inputPath = path.resolve(args.input);
  const charDir = path.resolve(ROOT, "public/sprites/characters");
  await fs.mkdir(charDir, { recursive: true });
  const filename = path.basename(inputPath);
  const role = args.role ?? path.parse(filename).name;
  const destPath = path.join(charDir, filename);

  // Copy file into characters folder if not already there
  if (path.resolve(inputPath) !== destPath) {
    await fs.copyFile(inputPath, destPath);
    console.log(`copied → ${path.relative(ROOT, destPath)}`);
  }

  // Validate dimensions
  const { width, height } = await readPngDimensions(destPath);
  const expectedW = args.cols * args.frame;
  const expectedH = args.rows * args.frame;
  if (width !== expectedW || height !== expectedH) {
    console.warn(
      `WARNING: dimensions ${width}x${height} don't match cols×rows×frame ` +
        `(${args.cols}×${args.rows}×${args.frame} = ${expectedW}x${expectedH}).`,
    );
    console.warn("The engine will still load it, but frames may be misaligned. Pass --cols / --rows / --frame to match.");
  }

  // Update manifest
  const manifestPath = path.resolve(ROOT, "public/sprites/manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.characters ??= {};
  manifest.characters[role] = {
    sheet: filename,
    directions: args.rows,
    frames: args.cols,
    frameW: args.frame,
    frameH: args.frame,
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`updated manifest entry for character "${role}"`);
  console.log(`  sheet:      ${filename} (${width}×${height})`);
  console.log(`  directions: ${args.rows}`);
  console.log(`  frames/dir: ${args.cols}`);
  console.log(`  frame size: ${args.frame}×${args.frame}`);
  console.log("\nReload KingdomOS — the new character art is live.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
