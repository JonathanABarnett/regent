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
];

const CAPTAIN_LINES: readonly string[] = [
  "{name} doubled the watch without being asked.",
  "{name} walked the wall at dusk; the watch stood straighter for it.",
  "{name} inspected every gate hinge before the rains.",
  "{name} drilled the new guards until their arms shook.",
  "{name} spent the afternoon teaching the children the storm bell.",
  "{name} reported a single set of tracks at the wood's edge — \"old, not fresh.\"",
];

const SCHOLAR_LINES: readonly string[] = [
  "{name} finished translating a fragment that had defeated three predecessors.",
  "{name} kept the scriptorium lit until dawn over a single line of Old Common.",
  "{name} cross-referenced two maps and found a road that wasn't on either.",
  "{name} took an apprentice. The apprentice looked terrified and pleased.",
  "{name} insisted a new word be entered into the kingdom's lexicon. The court agreed.",
  "{name} read aloud at the noon meal — a custom they have apparently invented.",
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
    this.journal.write(line, "event");
    this.lastFiredDay[role] = day;
  }
}
