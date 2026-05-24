import type { World } from "../World";
import type { NPC, NPCTrait } from "../types";

/**
 * Quote of the day — picks a random NPC and pairs them with a line that
 * matches their trait. Deterministic for a given (day + seed), so the same
 * quote shows all day. Refreshes at day rollover.
 *
 * Pure helper, no state. Called once per stats update from App.tsx.
 */

const TRAIT_LINES: Record<NPCTrait, readonly string[]> = {
  joyful: [
    "{name} said today: \"the bread was better than yesterday's. The day is already worth it.\"",
    "{name} laughed at something the carpenter said this morning. The whole street is in a slightly better mood now.",
    "{name} sang on the way to work. They are not a good singer. Everyone forgave them.",
    "{name}: \"if I die today, tell the next world I had a good run.\" They are 38.",
  ],
  grim: [
    "{name} said today: \"don't celebrate before the harvest is in.\" They were not asked.",
    "{name} watched the horizon for a long while at dawn and said nothing about it.",
    "{name}: \"it could be worse, and probably will be.\" They said this while passing the bread.",
    "{name} predicted rain. There were no clouds. They are usually right.",
  ],
  curious: [
    "{name} took apart a hinge today to understand how it worked. They put it back together with the wrong screws and went looking for the right ones.",
    "{name} asked the scholar three questions before noon. They got two answers and a promise of a third.",
    "{name} was found studying an ant trail. They were late to dinner. They have a theory now.",
    "{name}: \"there are eleven different birdcalls just from this courtyard. I counted.\"",
  ],
  stoic: [
    "{name} did not comment on the new appointment. Their silence is its own commentary.",
    "{name} arrived at their post on time. {name} left at the appointed hour. Between those two facts: their entire day.",
    "{name}: \"complaining doesn't move the stones.\" They had been carrying stones all morning.",
    "{name} accepted the news at midday without changing expression. They have been chopping firewood with great precision since.",
  ],
  kind: [
    "{name} stopped to help someone they didn't know with a load too heavy for one person. They were already late for their own work.",
    "{name} left an extra cloak on the bench by the gate. The recipient is unknown. The cloak is gone.",
    "{name}: \"you don't have to thank me. I would prefer if you passed it on, though.\"",
    "{name} brought soup to the apprentice with the cough. They didn't say it was from them.",
  ],
  ambitious: [
    "{name} drafted a plan for the kingdom on the back of a meal ledger. It is, surprisingly, not a bad plan.",
    "{name}: \"if you don't want my opinion, you should not have asked.\" They were not asked.",
    "{name} stayed after hours to talk to the captain about \"opportunities.\" The captain went home early.",
    "{name} has been seen with a longer stride than usual this week. Something is afoot.",
  ],
  anxious: [
    "{name} checked the bolt on the gate three times before going to sleep. They will be fine.",
    "{name}: \"I'm sure it's nothing. But.\" The sentence trailed off and was not picked back up.",
    "{name} wrote a list of every concerning thing they noticed today. The list was twenty-four items long.",
    "{name} woke at the third hour worried about something specific. They cannot now remember what.",
  ],
  wise: [
    "{name} said today: \"the question is rarely as urgent as the people asking it.\"",
    "{name} listened to the entire complaint without interrupting. Their answer was four words long.",
    "{name}: \"if it can wait until morning, it should.\"",
    "{name} reminded the court that this is not the first time this issue has come up, and named the previous three instances.",
  ],
};

const FALLBACK_LINES: readonly string[] = [
  "{name} got on with their day, which is what most people do most days.",
  "{name} kept to themselves today. They have done this every day this week.",
  "{name} was in good spirits this morning, by whatever measure they use.",
];

/**
 * Short bubble lines for the world-canvas floating speech. Trait-keyed
 * one-liners — fewer than a dozen words, no NPC name (the bubble is over
 * the speaker so identification is implicit).
 */
export const SHORT_BUBBLE_LINES: Record<NPCTrait, readonly string[]> = {
  joyful: [
    "lovely day!",
    "ha!",
    "look at that.",
    "bread was good.",
    "good morning!",
  ],
  grim: [
    "could be worse.",
    "knew it.",
    "rain coming.",
    "told you.",
    "mm.",
  ],
  curious: [
    "huh.",
    "wait, what?",
    "interesting...",
    "how does that work?",
    "let me see.",
  ],
  stoic: [
    "carry on.",
    "noted.",
    "...",
    "as expected.",
    "fine.",
  ],
  kind: [
    "after you.",
    "let me help.",
    "thank you.",
    "no trouble.",
    "are you alright?",
  ],
  ambitious: [
    "I'll handle it.",
    "watch this.",
    "give me a year.",
    "we'll see.",
    "I have an idea.",
  ],
  anxious: [
    "is that... ok?",
    "did I lock the gate?",
    "what was that?",
    "I should check.",
    "hm.",
  ],
  wise: [
    "patience.",
    "it'll keep.",
    "let it lie.",
    "and so.",
    "as it must.",
  ],
};

/** Pick a short bubble line for an NPC based on trait + a random seed. */
export function shortBubbleLine(trait: NPCTrait | undefined, rand: () => number): string {
  const pool = SHORT_BUBBLE_LINES[trait ?? "stoic"] ?? SHORT_BUBBLE_LINES.stoic;
  return pool[Math.floor(rand() * pool.length)];
}

/** Stateless hash so the same (day, seed) returns the same quote. */
function hashPick(seed: number, day: number, mod: number): number {
  let h = (seed | 0) ^ ((day * 2654435761) | 0);
  h = (h ^ (h >>> 16)) | 0;
  h = Math.imul(h, 0x85ebca6b);
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 0xc2b2ae35);
  h = (h ^ (h >>> 16)) | 0;
  return ((h >>> 0) % mod);
}

/** Generate today's quote-of-day. Returns null if no eligible NPCs. */
export function quoteOfDay(world: World): string | null {
  // Eligible: any named non-monarch NPC. Monarch quotes feel weird since
  // the player's monarch is silent in the HUD already.
  const candidates: NPC[] = world.npcs.filter(
    (n) => n.name && n.name.length > 0 && n.role !== "monarch",
  );
  if (candidates.length === 0) return null;

  const day = world.state.day;
  const seed = world.state.seed;
  const npc = candidates[hashPick(seed, day, candidates.length)];
  const trait = (npc.trait as NPCTrait | undefined) ?? "stoic";
  const pool = TRAIT_LINES[trait] ?? FALLBACK_LINES;
  // Use day*7 as secondary salt so the same NPC on different days quotes differently.
  const line = pool[hashPick(seed, day * 7, pool.length)];
  return line.replaceAll("{name}", npc.name!);
}
