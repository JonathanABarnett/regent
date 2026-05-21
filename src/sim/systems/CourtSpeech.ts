import type { World } from "../World";
import type { Journal } from "./Journal";

/**
 * Court speech — occasional one-line journal entries from seated court members.
 *
 * Each seated role fires its own rotating line every few in-world days. Lines
 * reference the appointee's actual name so the seat feels populated rather
 * than purely mechanical. Lines are determined by `world.rand` so a given
 * seed + day produces the same speech (helps determinism for replay).
 *
 * Cadence: roughly once per 3 in-world days per seated role, capped at one
 * line per role per day so a long-absent player doesn't return to 30 stacked
 * Advisor entries.
 */

const ADVISOR_LINES: readonly string[] = [
  "{name} counseled patience, as is the advisor's habit.",
  "{name} sat late at the petition table, reading every name aloud.",
  "{name} reviewed the year's grain accounts and pronounced them honest.",
  "{name} settled a feud over a fence by drawing the new line themselves.",
  "{name} reminded the court that haste makes hungry winters.",
  "{name} kept a small fire in the council chamber all night, alone.",
  "{name} listened — to a complaint, to a confession, to a long silence — and said only \"go on\" four times.",
  "{name} returned an unsigned petition to its author with a brief note pinned to it: \"sign your name and I will sign mine.\"",
  "{name} declined a gift of wine from a visiting merchant; the court took note, and so did the merchant.",
  "{name} closed council a full hour early, citing that no one in the room could remember what the third item had been.",
  "{name} read every open petition before bed. That is their entire personality, and it is sufficient.",
  "{name} spent three hours with a family whose complaint turned out not to be about the fence at all.",
  "{name} said, at the end of a long day: \"the right answer and the popular answer are rarely neighbours.\" No one disagreed.",
  "{name} asked the court a question no one had thought to ask, then sat back and waited.",
  "{name} compiled a list of every decision made this year. The list was shorter than expected. That troubled them.",
  "{name} sat in the market for an afternoon without identifying themselves. They came back knowing three things the court did not.",
  "{name} refused to raise their voice in council, even when the room was loud. Especially when the room was loud.",
];

const CAPTAIN_LINES: readonly string[] = [
  "{name} doubled the watch without being asked.",
  "{name} walked the wall at dusk; the watch stood straighter for it.",
  "{name} inspected every gate hinge before the rains.",
  "{name} drilled the new guards until their arms shook.",
  "{name} spent the afternoon teaching the children the storm bell.",
  "{name} reported a single set of tracks at the wood's edge — \"old, not fresh.\"",
  "{name} stood at the eastern road from first light until noon, watching nothing in particular and seeing it well.",
  "{name} refused to discipline a guard who had fallen asleep on duty; instead they walked the rest of the shift in her place.",
  "{name} ordered new boots issued to every guard, paid out of their own ration of court silver.",
  "{name} returned a recovered horse to a farmer who had not yet learned it was missing.",
  "{name} redrawn the watch routes after finding two overlapping blind spots that had existed for years.",
  "{name} ate in the barracks three nights in a row, without ceremony.",
  "{name} found a gap in the south wall's footing. It was repaired before noon. No report was filed. There was no need.",
  "{name} said: \"the best security is people who trust each other.\" Then went back to checking the locks.",
  "{name} spent an afternoon interviewing everyone who had been on watch the night of the last incident. The incident was a fox.",
  "{name} marked every weak hinge, loose latch, and uncertain board on the castle's south face. The list was two pages.",
];

const SCHOLAR_LINES: readonly string[] = [
  "{name} finished translating a fragment that had defeated three predecessors.",
  "{name} kept the scriptorium lit until dawn over a single line of Old Common.",
  "{name} cross-referenced two maps and found a road that wasn't on either.",
  "{name} took an apprentice. The apprentice looked terrified and pleased.",
  "{name} insisted a new word be entered into the kingdom's lexicon. The court agreed.",
  "{name} read aloud at the noon meal — a custom they have apparently invented.",
  "{name} catalogued the library shelf by shelf and announced — with some satisfaction — that nothing was missing.",
  "{name} wrote a letter to a scholar three kingdoms away and admitted afterward they did not expect a reply.",
  "{name} found an error in a chronicle written before the founding, corrected it in margin ink, and signed it twice.",
  "{name} sat with a child who could not yet read and named every animal on the page until the child fell asleep.",
  "{name} started a new index. The existing one was, they noted, technically correct but spiritually wrong.",
  "{name} asked the chronicle to be re-copied. The handwriting, they explained, was losing nuance.",
  "{name} translated a word for which no equivalent exists in Common. The new word has been used seventeen times this week.",
  "{name} observed that the kingdom has made exactly the same mistake three times in fifty years. They looked pleased to have confirmed it.",
  "{name} added a footnote to a footnote to a footnote and was unreachable for the rest of the afternoon.",
  "{name} said: \"everything that has happened is still happening, somewhere in a book.\" Then went back to work.",
  "{name} found a recipe for bread in the margin of a military treatise. They were delighted. The bread was also good.",
];

export interface CourtSpeechOptions {
  /** Days between possible speeches per role. Default 3. */
  cadenceDays?: number;
}

export class CourtSpeech {
  private lastFiredDay: Record<"advisor" | "captain" | "scholar", number> = {
    advisor: -1,
    captain: -1,
    scholar: -1,
  };
  private readonly cadenceDays: number;
  private courtIds: { advisorId?: string; captainId?: string; scholarId?: string } = {};

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
    opts: CourtSpeechOptions = {},
  ) {
    this.cadenceDays = Math.max(1, opts.cadenceDays ?? 3);
  }

  /** Mirror of identity.court ids — set when court changes. */
  setCourtIds(ids: { advisorId?: string; captainId?: string; scholarId?: string }) {
    this.courtIds = { ...ids };
  }

  /**
   * Called on day rollover. Considers each seated role and may write a single
   * journal line per role per day. Silent if the appointee is no longer alive
   * (the seat is treated as vacant).
   */
  tick() {
    const day = this.world.state.day;
    if (this.world.courtEffects.advisorSeated && this.courtIds.advisorId) {
      this.maybeFire("advisor", this.courtIds.advisorId, ADVISOR_LINES, day);
    }
    if (this.world.courtEffects.captainSeated && this.courtIds.captainId) {
      this.maybeFire("captain", this.courtIds.captainId, CAPTAIN_LINES, day);
    }
    if (this.world.courtEffects.scholarSeated && this.courtIds.scholarId) {
      this.maybeFire("scholar", this.courtIds.scholarId, SCHOLAR_LINES, day);
    }
  }

  private maybeFire(
    role: "advisor" | "captain" | "scholar",
    npcId: string,
    lines: readonly string[],
    day: number,
  ) {
    if (day - this.lastFiredDay[role] < this.cadenceDays) return;
    // Random gate so it's not strictly periodic — feels organic.
    if (this.rand() < 0.5) return;
    const npc = this.world.npcs.find((n) => n.id === npcId);
    if (!npc) return;
    const line = lines[Math.floor(this.rand() * lines.length)].replace(
      "{name}",
      npc.name ?? "the unnamed court member",
    );
    // Court members speak from / are framed against the castle. Pin the
    // entry there so clicking "go to" snaps the camera to the throne room.
    const castle = this.world.map.structures.find((s) => s.kind === "castle");
    this.journal.write(line, "event", castle?.id);
    this.lastFiredDay[role] = day;
  }
}
