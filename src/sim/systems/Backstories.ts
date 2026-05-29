/**
 * Tiny backstory generator. Used whenever a new NPC arrives in the world via
 * external means (a Twitch sub, a "petition at the gates" welcome, a herald
 * who decides to stay). Returns one self-contained sentence flavored by the
 * NPC's name. Deterministic given (name, seed) — same name + seed always
 * produces the same backstory.
 *
 * Kept intentionally small: 4 origin pools × ~6 each, simple template fill.
 * The product of a few minutes' thought, but at runtime it makes a Twitch
 * subscriber's arrival read like a person, not a token.
 */

import { mulberry32 } from "../../lib/rng";

function hashName(name: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ORIGINS: readonly string[] = [
  "from the southern road",
  "from the salt marshes",
  "from a village no one in the kingdom had heard of",
  "from a long road and a longer winter",
  "from over the eastern hills",
  "from the docks at Rivermouth",
  "from a charcoal-burner's hut at the edge of the old forest",
  "from a windswept island the maps only half-remember",
  "from the abbey at Coldspring, where they had been a novice",
  "from a fishing camp on a coast the chronicler had to be told twice to spell",
];

const CARRYING: readonly string[] = [
  "carrying only a small knife and a book of psalms",
  "carrying a sleeping cat in the crook of one arm",
  "carrying nothing but a name and a willingness to work",
  "carrying a sealed letter they would not let anyone read",
  "carrying a single bag of seeds, carefully wrapped",
  "carrying news from somewhere they refused to name",
  "carrying a battered lute with two of its strings replaced by horsehair",
  "carrying a folded cloak that smelled faintly of pine smoke",
  "carrying a small bird in a wicker cage that whistled every quarter hour",
  "carrying a leather-bound ledger of debts owed to people they would not name",
];

const STATED_REASONS: readonly string[] = [
  "and said they had heard the kingdom was kind to strangers",
  "and asked only for a place to sleep until the rains passed",
  "and offered no reason at all — just sat at the gate until they were waved through",
  "and said an old aunt had once mentioned the place fondly",
  "and claimed they had walked here in a dream",
  "and produced a small token that the captain recognized at once",
  "and said the stars had been clearer over this kingdom for the last three nights",
  "and asked if anyone here remembered a stonemason who used to sing while he worked",
  "and confessed they had been told never to return home, and had at last believed it",
  "and said only that they had run out of roads and chosen the prettiest of the remaining gates",
];

const TRADES: readonly string[] = [
  "They said they could mend a wheel, a roof, or an argument.",
  "They said they were a cook of middling skill, but a fine baker.",
  "They said they were better with goats than with people, and had brought references from one goat.",
  "They said they had been a soldier once and would prefer not to be again.",
  "They said they could read four languages, three of them dead.",
  "They said they sang at funerals and asked if the kingdom had any need.",
  "They said they knew the names of every herb that grew north of the river.",
  "They said they had once been a courier and could still outwalk a horse on a wet road.",
  "They said they could fix a clock if they were given enough time and enough quiet.",
  "They said they had no trade at all, but were a steady hand at almost everything.",
];

/**
 * Build a one-sentence backstory line for a new NPC. Deterministic per
 * (name, seed) — useful for save/replay parity.
 */
export function backstoryFor(name: string, seed: number): string {
  const rand = mulberry32((seed ^ hashName(name)) >>> 0);
  const pick = <T,>(pool: readonly T[]): T => pool[Math.floor(rand() * pool.length)];
  return `${name} arrived ${pick(ORIGINS)}, ${pick(CARRYING)}, ${pick(STATED_REASONS)}. ${pick(TRADES)}`;
}
