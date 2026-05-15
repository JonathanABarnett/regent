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

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
];

const CARRYING: readonly string[] = [
  "carrying only a small knife and a book of psalms",
  "carrying a sleeping cat in the crook of one arm",
  "carrying nothing but a name and a willingness to work",
  "carrying a sealed letter they would not let anyone read",
  "carrying a single bag of seeds, carefully wrapped",
  "carrying news from somewhere they refused to name",
];

const STATED_REASONS: readonly string[] = [
  "and said they had heard the kingdom was kind to strangers",
  "and asked only for a place to sleep until the rains passed",
  "and offered no reason at all — just sat at the gate until they were waved through",
  "and said an old aunt had once mentioned the place fondly",
  "and claimed they had walked here in a dream",
  "and produced a small token that the captain recognized at once",
];

const TRADES: readonly string[] = [
  "They said they could mend a wheel, a roof, or an argument.",
  "They said they were a cook of middling skill, but a fine baker.",
  "They said they were better with goats than with people, and had brought references from one goat.",
  "They said they had been a soldier once and would prefer not to be again.",
  "They said they could read four languages, three of them dead.",
  "They said they sang at funerals and asked if the kingdom had any need.",
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
