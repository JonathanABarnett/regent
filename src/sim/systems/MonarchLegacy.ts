/**
 * Monarch Legacy — composes a reign-summary scroll whenever a monarch
 * leaves the throne (natural passing, usurper takeover, uprising).
 *
 * The summary is written as a milestone journal entry AND placed as a
 * scroll in the royal vault, so long-running kingdoms accumulate a
 * full historical record of every ruler.
 */

import type { World } from "../World";

export type LegacyContext = "natural" | "usurper" | "uprising";

/**
 * Structured, UI-facing summary of a completed reign — drives the Reign
 * Summary capstone modal that fires the moment a monarch leaves the throne.
 * Distinct from the journal/vault prose (which stays as the archive); this
 * is the *moment*, so the permadeath-memory payoff isn't buried.
 */
export interface ReignSummary {
  name: string;
  epithet: string;
  context: LegacyContext;
  generation: number;
  reignDays: number;
  seasons: string;
  population: number;
  reputation: string;
  vaultSize: number;
  dynastyStreak: number;
  moodTier: "celebrating" | "content" | "uneasy" | "anxious";
  headline: string;
}

/**
 * Derive an epithet ("the Beloved", "the Brief", "the Deposed") from how the
 * reign went and how it ended. Deterministic — a given reign always earns the
 * same title. Priority order: how they LOST the throne first, then length
 * extremes, then standing, then the mood they left behind.
 */
export function reignEpithet(input: {
  context: LegacyContext;
  reignDays: number;
  reputation: string;
  moodTier: string;
}): string {
  const { context, reignDays, reputation, moodTier } = input;
  if (context === "usurper") return "the Deposed";
  if (context === "uprising") return "the Cast Down";
  if (reignDays < 14) return "the Brief";
  if (reignDays >= 280) return "the Enduring";
  if (reputation === "beloved") return "the Beloved";
  if (reputation === "feared") return "the Iron";
  if (reputation === "austere") return "the Stern";
  if (moodTier === "anxious") return "the Troubled";
  if (moodTier === "celebrating") return "the Generous";
  if (reignDays >= 168) return "the Steadfast";
  return "the Steady";
}

// ── Template pools ────────────────────────────────────────────────────────────
// Indexed deterministically by `(reignDays * 7 + reignStartYear * 13) % pool.length`
// so the same reign always produces the same summary phrasing.

const OPENING_NATURAL: readonly string[] = [
  "{name} ruled for {days} in-world days — {seasons} — and passed peacefully. The kingdom gathered, and then continued.",
  "The reign of {name} ended with their passing at a good age. {days} days at the crown, across {seasons}. The court dressed in grey for a week.",
  "{name} was carried out of the great hall with full ceremony. {days} days of rule, through {seasons}, now complete.",
  "Word came to the chronicler in the morning: {name} had passed. A reign of {days} days, {seasons}, was formally closed.",
  "The {ordinal} monarch of this land died as monarchs should — in their own bed, with time to say the important things. {days} days of reign. {seasons}.",
];

const OPENING_USURPER: readonly string[] = [
  "The reign of {name} ended not by age but by challenge — {days} days, {seasons}, and then the throne changed hands.",
  "{name} ruled for {days} days across {seasons} before a usurper's claim was accepted. The transition was noted in the chronicle without editorial.",
  "A challenger took the throne from {name} after {days} days and {seasons}. The chronicle records this without judgment. History will form its own.",
  "The {ordinal} reign — {days} days, {seasons} — ended when {name} yielded the throne. The manner of it will be discussed for years.",
];

const OPENING_UPRISING: readonly string[] = [
  "The people's voice ended the reign of {name} — {days} days, {seasons}, and then the crowd made its choice known.",
  "{name} ruled for {days} days across {seasons}. When the uprising reached the gate, the throne was yielded to those who had built it.",
  "After {days} days and {seasons}, {name} stepped down as the population demanded. The chronicle notes the date. The people note the reason.",
  "The reign of {name}: {days} days, {seasons}. Ended not by age or rival but by the kingdom's own voice rising.",
];

const CLOSING_BY_REP: Record<string, string> = {
  beloved: "The people kept a candle lit for three days.",
  "well-regarded": "The kingdom did not stop. It paused, briefly, and continued.",
  steady: "The chronicle recorded the reign, closed the page, and opened a new one.",
  austere: "Few said much. The work continued, as it always had.",
  feared: "The halls were quieter than they had been, which most people found a relief.",
};

// ── Helper ────────────────────────────────────────────────────────────────────

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

function seasonsLabel(days: number): string {
  const seasons = Math.floor(days / 14); // 14 days per season
  if (seasons < 2) return "a single season";
  if (seasons < 5) return `${seasons} seasons`;
  const years = Math.floor(days / 56);
  if (years < 1) return `${seasons} seasons`;
  return `${years} year${years === 1 ? "" : "s"}`;
}

function ordinalSuffix(n: number): string {
  const abs = Math.abs(Math.floor(n));
  const lastTwo = abs % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (abs % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Compose and record the legacy of a departing monarch.
 *
 * @param world         Live world state (for reputation, population, vault).
 * @param oldName       The monarch's display name.
 * @param reignDays     How many in-world days they reigned.
 * @param reignStartYear The year their reign began.
 * @param context       How they left the throne.
 */
export function writeMonarchLegacy(
  world: World,
  oldName: string,
  reignDays: number,
  reignStartYear: number,
  context: LegacyContext,
): ReignSummary {
  const repDesc = world.reputation.descriptor();
  const pop = world.npcs.length;
  const vaultSize = world.treasury.count();
  const dynastyStreak = world.succession.state.dynastyStreak;
  const generation = world.succession.state.generation;
  const seed = (reignDays * 7 + reignStartYear * 13);

  // Pick opening template.
  const openingPool =
    context === "natural"  ? OPENING_NATURAL  :
    context === "usurper"  ? OPENING_USURPER  :
                             OPENING_UPRISING;
  const opening = pick(openingPool, seed)
    .replace("{name}", oldName)
    .replace("{days}", String(reignDays))
    .replace("{seasons}", seasonsLabel(reignDays))
    .replace("{ordinal}", ordinalSuffix(generation));

  // Middle: key stats.
  const repLine = `Reputation at the end: ${repDesc}.`;
  const popLine = `The kingdom held ${pop} souls when they departed.`;
  const vaultLine = vaultSize > 0
    ? `The royal vault contains ${vaultSize} artifact${vaultSize === 1 ? "" : "s"} accumulated across all reigns.`
    : "The royal vault was still sparse.";
  const dynastyLine = dynastyStreak >= 3
    ? `The unbroken dynasty held for ${dynastyStreak} successive reign${dynastyStreak === 1 ? "" : "s"} before this one.`
    : "";

  // Closing line by reputation.
  const closing = CLOSING_BY_REP[repDesc] ?? CLOSING_BY_REP.steady;

  // Assemble full scroll text.
  const parts = [opening, repLine, popLine, vaultLine];
  if (dynastyLine) parts.push(dynastyLine);
  parts.push(closing);
  const scrollText = parts.join(" ");

  const castle = world.map.structures.find((s) => s.kind === "castle");

  // Write milestone journal entry.
  world.journal.write(scrollText, "milestone", castle?.id);

  // Place a scroll in the vault. The origin is kept short so it renders
  // cleanly in the vault UI; the full text lives in the journal.
  world.treasury.acquire(
    "scroll",
    `the reign of ${oldName} — year ${reignStartYear} to ${world.state.year}`,
  );

  // For natural successions, also generate a personal letter from the
  // departing monarch to whoever takes the throne next. Intimate prose,
  // not chronicler's summary.
  if (context === "natural") {
    writeMonarchLetter(world, oldName, reignDays, repDesc);
  }

  // Structured summary for the capstone modal — the *moment* a reign ends,
  // not the archived scroll. Computed from the same end-of-reign state.
  const moodTier = world.mood.tier();
  return {
    name: oldName,
    epithet: reignEpithet({ context, reignDays, reputation: repDesc, moodTier }),
    context,
    generation,
    reignDays,
    seasons: seasonsLabel(reignDays),
    population: pop,
    reputation: repDesc,
    vaultSize,
    dynastyStreak,
    moodTier,
    headline: opening,
  };
}

// ── Personal letter prose ─────────────────────────────────────────────────────

const LETTER_OPENINGS: readonly string[] = [
  "To whoever takes this seat after me — ",
  "If you are reading this you are the new monarch. I was the old one. A few notes:",
  "I had hoped to say this in person. Failing that — ",
  "The chronicler will tell you the official version. Here is the unofficial one.",
];

const LETTER_BODIES_BY_REP: Record<string, readonly string[]> = {
  beloved: [
    "The kingdom was kind to me. I tried to be kind back. It is a fair exchange.",
    "I ruled for {seasons}. None of it was hard, but none of it was easy. Both of those statements are true.",
    "Be generous. Generosity costs less than people say and earns more than gold.",
  ],
  "well-regarded": [
    "I made fewer enemies than I expected and more friends than I deserved. Try to do the same.",
    "I ruled {seasons}. The kingdom is roughly where I found it, plus or minus the names on the wall.",
    "Trust the chancellor. Most of the time. Not always. You will learn the difference.",
  ],
  steady: [
    "Most days the work is small. The small days are the ones that matter.",
    "I ruled {seasons}. I made decisions. Some were correct. The rest are buried with me.",
    "Listen more than you speak. The throne projects your voice further than you think.",
  ],
  austere: [
    "I was a hard ruler. The kingdom needed it then. Read the chronicle and decide for yourself if it needs the same from you.",
    "I ruled {seasons}. Few mourned. None starved. I take both as victories.",
    "Discipline is a tool. Do not let it become an identity. I forgot this once. Do not.",
  ],
  feared: [
    "They will tell you I was harsh. Some of it I will not deny.",
    "I ruled {seasons}. The kingdom endured. I did not require it to be more than that.",
    "If you wish to be loved instead of feared — start now. The first season is the only easy one.",
  ],
};

const LETTER_CLOSINGS: readonly string[] = [
  "The crown is heavier than they let on. Set it down sometimes.",
  "Good luck. You will not need as much as you think.",
  "Take care of the kingdom. Take care of yourself. The order matters.",
  "I will not haunt the keep. You have it to yourself now.",
];

/**
 * Compose a personal letter from the departing monarch and place it in
 * the vault as a distinct artifact. The full letter text lives in the
 * artifact's `origin` field so the vault tooltip shows it.
 */
function writeMonarchLetter(
  world: World,
  oldName: string,
  reignDays: number,
  repDesc: string,
): void {
  const seed = (reignDays * 17 + Math.floor(reignDays / 56)) | 0;
  const opening = pick(LETTER_OPENINGS, seed);
  const bodyPool = LETTER_BODIES_BY_REP[repDesc] ?? LETTER_BODIES_BY_REP.steady;
  const body = pick(bodyPool, seed + 1).replace("{seasons}", seasonsLabel(reignDays));
  const closing = pick(LETTER_CLOSINGS, seed + 2);
  const letterText = `${opening} ${body} ${closing} — ${oldName}.`;

  // Letter goes into the vault with the full text in the origin so it
  // surfaces in tooltips/the VaultPanel. Name is identifying.
  world.treasury.acquire(
    "scroll",
    letterText,
  );
  // Also write a brief journal entry pointing to the letter.
  world.journal.write(
    `A sealed letter was found on the late monarch's desk, addressed to whoever would take the throne next. It was placed unopened in the royal vault, where it now waits.`,
    "milestone",
  );
}
