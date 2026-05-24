import type { World } from "../World";
import type { Journal } from "./Journal";

/**
 * Cult subplot — a quiet religious schism forms in the kingdom.
 *
 * Three phases:
 *   DORMANT → ROUMOURS — first whispers surface over weeks
 *   ROUMOURS → DECISION — three rumour entries spread; the player must answer
 *   RESOLVED — tolerate (faction hit) / investigate (gold cost, names exposed)
 *              / suppress (rep -5, the cult vanishes)
 *
 * After resolution, returns to DORMANT for a long cooldown.
 *
 * Triggers: year 5+, 60-day cooldown after a resolution.
 */

const MIN_YEAR = 5;
const COOLDOWN_DAYS = 60;
const BASE_CHANCE_PER_DAY = 0.005;
const RUMOUR_INTERVAL_DAYS = 6;
const RUMOURS_BEFORE_DECISION = 3;

const RUMOUR_LINES: readonly string[] = [
  "An unusual gathering was reported at the old shrine last night. Six people, by lamplight. They dispersed before the watch could ask their business.",
  "The chronicler has noticed a new symbol scratched onto stones near the south gate. A circle with a slash through it. Twice in three days.",
  "Two trusted villagers were overheard arguing about a 'new way of seeing' that the kingdom hasn't endorsed. They stopped when they realised they were heard.",
  "A small offering — bread, salt, and a coin — was found in a place where no offering should be left. The watch was called. No one was nearby.",
  "An elder asked the chancellor today whether the kingdom's official rites were the only true ones. The chancellor said yes. The elder did not look satisfied.",
  "Someone has been quietly removing kingdom-issued prayer pamphlets from the central square's notice board. The replacements appear unsigned.",
];

const DECISION_BODY =
  "Whispers have hardened into something the court can no longer ignore. A heretical group is meeting at the old shrine, growing quietly. They claim to know a truth the kingdom does not teach. How does the crown respond?";

const TOLERATE_LINES: readonly string[] = [
  "By royal decision, the heretics will be allowed to continue without official interference. The chronicler approves. The scholars do not.",
  "The crown chose to tolerate. The group continues meeting at the shrine. They have not disturbed the peace. They have, however, divided the kingdom into those who know and those who would rather not.",
];

const INVESTIGATE_LINES: readonly string[] = [
  "Investigators spent the week with the group. Names were taken. Conclusions remain private. The chancellor briefed the crown in a closed room. The cult is, for now, accounted for.",
  "The court's investigators returned today with a full account of the heretical group: ten members, six of them long-time villagers. The crown has the names. It has not yet acted on them.",
];

const SUPPRESS_LINES: readonly string[] = [
  "The group was suppressed by royal order today. The shrine was cleansed. The members were dispersed — some leaving the kingdom, some swearing fealty in a hurry. The chronicler did not enjoy writing this entry.",
  "The cult was broken up at dawn. No deaths, but the kingdom is harsher for it. The shrine stands locked. The court is quieter than it was yesterday.",
];

export type CultPhase = "dormant" | "rumouring" | "resolved";

export interface CultSnapshot {
  phase: CultPhase;
  rumoursFired: number;
  lastRumourDay: number;
  lastResolvedDay: number;
}

function fresh(): CultSnapshot {
  return { phase: "dormant", rumoursFired: 0, lastRumourDay: 0, lastResolvedDay: -COOLDOWN_DAYS };
}

export class Cult {
  state: CultSnapshot = fresh();

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): CultSnapshot { return { ...this.state }; }
  restore(s: CultSnapshot): void { this.state = { ...s }; }

  tick(): void {
    if (this.world.state.year < MIN_YEAR) return;
    const day = this.world.state.day;

    if (this.state.phase === "dormant") {
      if (day - this.state.lastResolvedDay < COOLDOWN_DAYS) return;
      if (this.rand() > BASE_CHANCE_PER_DAY) return;
      // Start the rumour phase.
      this.state.phase = "rumouring";
      this.state.rumoursFired = 0;
      this.state.lastRumourDay = day - RUMOUR_INTERVAL_DAYS; // fire first one now
    }

    if (this.state.phase === "rumouring") {
      if (day - this.state.lastRumourDay < RUMOUR_INTERVAL_DAYS) return;
      this.state.lastRumourDay = day;
      this.state.rumoursFired++;
      const line = RUMOUR_LINES[Math.floor(this.rand() * RUMOUR_LINES.length)];
      this.journal.write(line, "event");
      if (this.state.rumoursFired >= RUMOURS_BEFORE_DECISION) {
        this._fireDecision();
      }
    }
  }

  private _fireDecision(): void {
    this.world.decisions.propose({
      id: `cult_${this.world.state.day}`,
      title: "A quiet schism",
      body: DECISION_BODY,
      options: [
        {
          id: "tolerate",
          label: "Tolerate the group",
          hint: "scholars -1 · the group will grow",
          onChoose: (w) => {
            w.factions.adjust("scholars", -1);
            const line = TOLERATE_LINES[Math.floor(this.rand() * TOLERATE_LINES.length)];
            this.journal.write(line, "milestone");
            // Downstream chain: the kingdom is going to feel this for
            // months. Two growth echoes, then a forced follow-on
            // decision at +90 days.
            const toleratedDay = w.state.day;
            w.consequences.schedule({
              kind: "cult_tolerate_growth",
              fireInDays: 30,
              data: { toleratedDay },
              sourceId: `cult_${w.state.day}`,
            });
            w.consequences.schedule({
              kind: "cult_tolerate_growth",
              fireInDays: 60,
              data: { toleratedDay },
              sourceId: `cult_${w.state.day}`,
            });
            w.consequences.schedule({
              kind: "cult_tolerate_decision",
              fireInDays: 90,
              data: { toleratedDay },
              sourceId: `cult_${w.state.day}`,
            });
            this._resolved();
          },
        },
        {
          id: "investigate",
          label: "Investigate (10 gold)",
          hint: "-10g · the chancellor reports back over weeks",
          onChoose: (w) => {
            if (w.economy.state.gold >= 10) w.economy.state.gold -= 10;
            const line = INVESTIGATE_LINES[Math.floor(this.rand() * INVESTIGATE_LINES.length)];
            this.journal.write(line, "milestone");
            // Downstream: investigation produces reports for the crown
            // over the next month. No decision required, but the player
            // sees the work happening.
            w.consequences.schedule({
              kind: "cult_investigate_report",
              fireInDays: 14,
              sourceId: `cult_${w.state.day}`,
            });
            w.consequences.schedule({
              kind: "cult_investigate_report",
              fireInDays: 30,
              sourceId: `cult_${w.state.day}`,
            });
            this._resolved();
          },
        },
        {
          id: "suppress",
          label: "Suppress them",
          hint: "rep -5 · the kingdom remembers",
          onChoose: (w) => {
            w.reputation.adjust(-5);
            const line = SUPPRESS_LINES[Math.floor(this.rand() * SUPPRESS_LINES.length)];
            this.journal.write(line, "milestone");
            // Downstream: the shrine stands locked. Two quiet echoes
            // over the next month so the choice isn't forgotten the
            // moment it's made.
            w.consequences.schedule({
              kind: "cult_suppress_echo",
              fireInDays: 14,
              sourceId: `cult_${w.state.day}`,
            });
            w.consequences.schedule({
              kind: "cult_suppress_echo",
              fireInDays: 30,
              sourceId: `cult_${w.state.day}`,
            });
            this._resolved();
          },
        },
      ],
      expiresAt: Date.now() + 240_000,
      defaultOnExpire: true, // silence → tolerate
    });
  }

  private _resolved(): void {
    this.state.phase = "resolved";
    this.state.lastResolvedDay = this.world.state.day;
    this.state.rumoursFired = 0;
    // Drop back to dormant immediately so the next cooldown can run.
    this.state.phase = "dormant";
  }
}
