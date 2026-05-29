/**
 * Tiny fantasy-flavored name generator. Names are deterministic per (seed, role)
 * so a kingdom regenerated from the same seed always produces the same residents.
 */

import { mulberry32 } from "../../lib/rng";

const FIRST_NAMES = [
  // Original 32
  "Berta", "Olen", "Mira", "Pell", "Thaddeus", "Sera", "Roan", "Imla",
  "Wend", "Calla", "Brom", "Yara", "Eddrin", "Jol", "Pim", "Sable",
  "Tovin", "Lira", "Roska", "Galen", "Mara", "Verro", "Kit", "Noa",
  "Tiber", "Halda", "Eske", "Drev", "Ivo", "Linnet", "Rook", "Sela",
  // Pass 8 expansion (+32)
  "Anwen", "Bryn", "Corin", "Dera", "Ennis", "Fian", "Gwyn", "Hale",
  "Iden", "Jorah", "Kestral", "Lonn", "Maddox", "Niall", "Orin", "Petra",
  "Quill", "Renn", "Saren", "Talia", "Ulric", "Vey", "Wren", "Xanthe",
  "Yorrick", "Zelda", "Asha", "Brell", "Cinder", "Doran", "Eira", "Fenn",
];

const SURNAME_PARTS_LEFT = [
  "High", "Iron", "River", "Stone", "Oak", "Bramble", "Glim", "Hollow", "Mar", "Wend",
  // Pass 8 expansion (+10)
  "Ash", "Vale", "Fen", "Thorn", "Loft", "Brook", "Dusk", "Moor", "Pine", "Crag",
];
const SURNAME_PARTS_RIGHT = [
  "mark", "hew", "ford", "step", "vale", "wick", "stride", "brook", "smith", "rune",
  // Pass 8 expansion (+10)
  "shaw", "well", "ridge", "hollow", "crest", "field", "gate", "watch", "weave", "spire",
];

const ROLE_TITLES: Record<string, string[]> = {
  blacksmith: ["the Smith", "the Forgehand"],
  miner: ["the Delver", "of the Deep"],
  scholar: ["the Lettered", "the Inkstain"],
  courier: ["the Swift", "the Quick"],
  guard: ["the Keeper", "the Watchful"],
  villager: ["", ""], // no title for villagers
};

export function generateName(role: string, seed: number): string {
  const rand = mulberry32(seed);
  const first = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
  const titles = ROLE_TITLES[role] ?? ROLE_TITLES.villager;
  const title = titles[Math.floor(rand() * titles.length)];
  if (title) return `${first} ${title}`;
  const l = SURNAME_PARTS_LEFT[Math.floor(rand() * SURNAME_PARTS_LEFT.length)];
  const r = SURNAME_PARTS_RIGHT[Math.floor(rand() * SURNAME_PARTS_RIGHT.length)];
  return `${first} ${l}${r}`;
}
