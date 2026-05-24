import type { World } from "../World";
import type { Journal } from "./Journal";

/**
 * Scheduled-effects queue. The missing piece that turns this from
 * "a kingdom of independent flavor events" into "a kingdom where
 * choices have downstream weight."
 *
 * A decision's `onChoose` handler calls `world.consequences.schedule(...)`
 * to drop a deferred effect onto the queue. The effect fires N in-world
 * days later — could be a journal entry, a new decision, a faction
 * adjustment, anything the kind handler knows how to do.
 *
 * Two key design choices:
 *
 * 1. **Discriminated-union of kinds.** Functions can't serialize, so we
 *    can't store `fire: (world) => void` directly. Instead, each
 *    consequence is a data shape with a `kind` field; a dispatch table
 *    maps each kind to the actual effect at fire time. This means new
 *    consequence kinds need a one-line entry in two places (the union
 *    and the dispatch) — trade-off accepted for save/load safety.
 *
 * 2. **Day-scheduled, not tick-scheduled.** Fire-time precision is days
 *    in-world, not real-world milliseconds. Keeps the queue tiny (most
 *    chains have 2-4 entries spread over weeks), survives sim-speed
 *    changes naturally, and means "60 days later" reads identically
 *    regardless of player speed setting.
 *
 * Failure semantics: a fire handler that throws records via crashLog
 * but does NOT block the queue. Other consequences still fire.
 * The failing entry is dropped (not retried) — we don't want a
 * deterministic bug to crash on every tick.
 */

/**
 * Every consequence kind is a serializable data shape. To add a new
 * kind: extend this union, then add a `case` in `Consequences._fire()`.
 */
export type ConsequenceKind =
  // ── Cult arc ──────────────────────────────────────────────────────
  /** Echo of a suppressed cult — locked shrine, quiet aftermath. */
  | "cult_suppress_echo"
  /** Growth notice for a tolerated cult — they're getting bigger. */
  | "cult_tolerate_growth"
  /** Decision: "the group has tripled in size." Follow-on for TOLERATE. */
  | "cult_tolerate_decision"
  /** Investigation update — the chancellor's report fragments. */
  | "cult_investigate_report"
  // ── Founding ──────────────────────────────────────────────────────
  /** First decision after founding — gates the player's first choice
   *  loop within 2 in-world days of starting a new kingdom. */
  | "welcome_petition"
  /** Echo of the welcome-petition's outcome at +14 days. */
  | "welcome_petition_echo";

export interface ScheduledConsequence {
  /** Unique id (e.g. "csq_cult_echo_42" — keyed by source + counter). */
  id: string;
  /** Discriminator for the dispatch table. */
  kind: ConsequenceKind;
  /** In-world day this consequence fires. */
  fireDay: number;
  /** Optional bag of kind-specific data (names, ids, prior choices). */
  data?: Record<string, string | number | boolean>;
  /** Source decision id, for traceability + debugging. */
  sourceId?: string;
}

export interface ConsequencesSnapshot {
  pending: ScheduledConsequence[];
  /** Monotonic counter for unique consequence ids. */
  idCounter: number;
}

function fresh(): ConsequencesSnapshot {
  return { pending: [], idCounter: 0 };
}

const MAX_PENDING = 200;

export class Consequences {
  state: ConsequencesSnapshot = fresh();

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): ConsequencesSnapshot {
    return {
      pending: this.state.pending.map((c) => ({ ...c, data: c.data ? { ...c.data } : undefined })),
      idCounter: this.state.idCounter,
    };
  }

  restore(s: ConsequencesSnapshot): void {
    this.state = {
      pending: Array.isArray(s.pending) ? s.pending.slice(0, MAX_PENDING).map((c) => ({ ...c })) : [],
      idCounter: typeof s.idCounter === "number" && Number.isFinite(s.idCounter) ? s.idCounter : 0,
    };
  }

  /**
   * Add a deferred consequence. Returns the auto-generated id so callers
   * can later cancel it if needed (rare). Idempotent on (sourceId, kind)
   * via natural duplication tolerance — same source can schedule the
   * same kind multiple times if the chain naturally repeats.
   */
  schedule(input: {
    kind: ConsequenceKind;
    fireInDays: number;
    data?: ScheduledConsequence["data"];
    sourceId?: string;
  }): string {
    if (this.state.pending.length >= MAX_PENDING) {
      // Hard cap — drop oldest to make room. In practice we never
      // approach this; a runaway scheduler is a bug.
      this.state.pending.shift();
    }
    const id = `csq_${this.state.idCounter++}`;
    const fireDay = this.world.state.day + Math.max(1, Math.floor(input.fireInDays));
    this.state.pending.push({
      id,
      kind: input.kind,
      fireDay,
      data: input.data,
      sourceId: input.sourceId,
    });
    return id;
  }

  /** Cancel a pending consequence by id. No-op if not found. */
  cancel(id: string): boolean {
    const before = this.state.pending.length;
    this.state.pending = this.state.pending.filter((c) => c.id !== id);
    return this.state.pending.length < before;
  }

  /** How many consequences are currently scheduled (test/debug helper). */
  pendingCount(): number {
    return this.state.pending.length;
  }

  /**
   * Called from World.tickDay on each in-world day rollover. Fires any
   * consequence whose `fireDay <= currentDay` and removes it from the
   * queue. Order is insertion-order so two consequences scheduled for
   * the same day fire in the order they were scheduled.
   */
  tickDay(): void {
    const day = this.world.state.day;
    const ready: ScheduledConsequence[] = [];
    const remaining: ScheduledConsequence[] = [];
    for (const c of this.state.pending) {
      if (c.fireDay <= day) ready.push(c);
      else remaining.push(c);
    }
    this.state.pending = remaining;
    for (const c of ready) {
      try {
        this._fire(c);
      } catch (err) {
        console.warn(`[Consequences] fire failed for ${c.kind}:`, err);
        // Don't block the queue — other consequences still fire.
      }
    }
  }

  /**
   * Dispatch table — maps a consequence kind to the actual effect.
   * Adding a new kind: add it to the union above, then add a case here.
   *
   * Each handler may:
   *   - write journal entries
   *   - schedule further consequences (chains)
   *   - propose decisions
   *   - adjust factions / reputation / treasury / mood
   *
   * Handlers should be self-contained and assume the world might have
   * changed significantly since scheduling — guard for "the structure
   * is gone now," "the NPC died," etc.
   */
  private _fire(c: ScheduledConsequence): void {
    switch (c.kind) {
      case "cult_suppress_echo":
        this._fireCultSuppressEcho(c);
        break;
      case "cult_tolerate_growth":
        this._fireCultTolerateGrowth(c);
        break;
      case "cult_tolerate_decision":
        this._fireCultTolerateDecision(c);
        break;
      case "cult_investigate_report":
        this._fireCultInvestigateReport(c);
        break;
      case "welcome_petition":
        this._fireWelcomePetition(c);
        break;
      case "welcome_petition_echo":
        this._fireWelcomePetitionEcho(c);
        break;
    }
  }

  // ── Cult: SUPPRESS aftermath ────────────────────────────────────────
  // The shrine stands locked. People still leave offerings. The kingdom
  // remembers what happened, even though nobody talks about it directly.

  private _fireCultSuppressEcho(_c: ScheduledConsequence): void {
    const lines = [
      "Someone left bread and salt at the locked shrine door overnight. The watch swept it up at dawn. By dusk, fresh offerings had returned.",
      "Two villagers were seen lingering by the cleansed shrine this evening. They did not speak. They did not light a candle. They stood, and then they went home.",
      "A child asked at supper what the locked door at the old shrine was for. Their parents changed the subject. The child did not believe them.",
    ];
    const line = lines[Math.floor(this.rand() * lines.length)];
    this.journal.write(line, "event");
  }

  // ── Cult: TOLERATE aftermath ────────────────────────────────────────
  // The group meets openly. It grows. Eventually the question recurs.

  private _fireCultTolerateGrowth(c: ScheduledConsequence): void {
    const day = this.world.state.day;
    const sinceTolerated = day - Number(c.data?.toleratedDay ?? day);
    const lines = sinceTolerated < 45
      ? [
          "The shrine gathering met again last night. Twelve people now, by lamplight. The new symbol is being scratched onto more stones — quietly, but more often.",
          "A second pamphlet from the heretical group has been quietly circulating. It is better written than the first. The chancellor read it twice.",
        ]
      : [
          "The shrine group now meets in the open at midday. Some merchants have started shutting their stalls on the days they gather. It is becoming difficult to ignore.",
          "Two more elders have stopped attending the kingdom's official rites. They have not been confronted. The chancellor noticed. The chronicler noticed. Neither said anything.",
        ];
    const line = lines[Math.floor(this.rand() * lines.length)];
    this.journal.write(line, "event");
  }

  private _fireCultTolerateDecision(c: ScheduledConsequence): void {
    // Don't stack on top of an already-pending decision.
    if (this.world.decisions.current()) {
      // Reschedule for tomorrow rather than dropping the chain entirely.
      this.schedule({
        kind: "cult_tolerate_decision",
        fireInDays: 1,
        data: c.data,
        sourceId: c.sourceId,
      });
      return;
    }
    this.world.decisions.propose({
      id: `cult_tolerate_followup_${this.world.state.day}`,
      title: "The group has tripled",
      body:
        "The heretical group the crown chose to tolerate has grown threefold since the decision. They now meet openly at the shrine, draw quiet sympathy from the kingdom's elders, and have begun teaching the new way to children. The chancellor presses for a second decision.",
      options: [
        {
          id: "continue",
          label: "Continue tolerating",
          hint: "scholars -2 · they grow further",
          onChoose: (w) => {
            w.factions.adjust("scholars", -2);
            this.journal.write(
              "The crown reaffirmed its tolerance today. The shrine group received the news at their next gathering. They were calm about it, which somehow made it worse.",
              "milestone",
            );
            // Chain continues — schedule another check in 90 days.
            this.schedule({
              kind: "cult_tolerate_growth",
              fireInDays: 30,
              data: c.data,
            });
            this.schedule({
              kind: "cult_tolerate_growth",
              fireInDays: 60,
              data: c.data,
            });
          },
        },
        {
          id: "reverse",
          label: "Reverse the decision (suppress now)",
          hint: "rep -8 · scholars +1 · they vanish",
          onChoose: (w) => {
            w.reputation.adjust(-8);
            w.factions.adjust("scholars", 1);
            this.journal.write(
              "The crown reversed itself today. The shrine was suppressed at dawn after months of being tolerated. The dispersal was harder than it would have been before. Some of the kingdom will not forgive the reversal.",
              "milestone",
            );
            // The arc resolves with echoes, same as a fresh suppression.
            this.schedule({
              kind: "cult_suppress_echo",
              fireInDays: 14,
              sourceId: c.sourceId,
            });
            this.schedule({
              kind: "cult_suppress_echo",
              fireInDays: 30,
              sourceId: c.sourceId,
            });
          },
        },
      ],
      expiresAt: Date.now() + 240_000,
      defaultOnExpire: true, // silence → keep tolerating
    });
  }

  // ── Cult: INVESTIGATE aftermath ────────────────────────────────────
  // The chancellor's people work the case. Names accumulate. The crown
  // is privately aware of the membership but takes no public action.

  private _fireCultInvestigateReport(_c: ScheduledConsequence): void {
    const lines = [
      "The chancellor delivered a second report on the shrine group today. Three more names were added — a smith's apprentice, an off-duty guard, and one of the chronicler's own scribes. The crown read it without comment.",
      "An investigator has been embedded with the shrine group for several weeks now. They report that the meetings are quieter than expected. The doctrine is harder to pin down than expected. The members are warmer than expected.",
      "The full investigation file was placed on the chancellor's desk this evening. Nine names, an address, and a list of dates. The chancellor locked it in the lower drawer. The crown has not asked to see it again.",
    ];
    const line = lines[Math.floor(this.rand() * lines.length)];
    this.journal.write(line, "event");
  }

  // ── Founding: Welcome Petition ──────────────────────────────────────
  // The player's first decision. Fires ~2 in-world days after founding
  // so a new player sees the choice loop within a real minute or two.
  // All three options are warm, all three schedule a +14-day echo so
  // the player feels the consequence chain immediately in their first
  // session — that's the refund-prevention payload.

  private _fireWelcomePetition(c: ScheduledConsequence): void {
    if (this.world.decisions.current()) {
      // Don't stack on top of another decision (vanishingly unlikely
      // this early, but be defensive).
      this.schedule({ kind: "welcome_petition", fireInDays: 1, sourceId: c.sourceId });
      return;
    }
    const monarch = this.world.npcs.find((n) => n.role === "monarch");
    const monarchName = monarch?.name ?? "the monarch";
    // Pick a random new-arrival surname for the family.
    const surnames = ["Marlow", "Hollis", "Greaves", "Penn", "Thatch", "Brae", "Linde"];
    const surname = surnames[Math.floor(this.rand() * surnames.length)];

    this.world.decisions.propose({
      id: `welcome_petition_${this.world.state.day}`,
      title: "A petition at the gate",
      body:
        `A young family — the ${surname}s — have come to the keep. Their newborn arrived the same week as the founding, and they have named the child after ${monarchName}. They ask, shyly, whether the crown might mark the occasion.`,
      options: [
        {
          id: "attend",
          label: "Attend the naming ceremony",
          hint: "rep +2 · the kingdom will remember",
          onChoose: (w) => {
            w.reputation.adjust(2);
            this.journal.write(
              `${monarchName} stood in the ${surname}s' small courtyard this afternoon and held the child for a moment. The neighbours were quietly proud. The chronicler wrote down what the baby was wearing.`,
              "milestone",
            );
            w.consequences.schedule({
              kind: "welcome_petition_echo",
              fireInDays: 14,
              data: { surname, choice: "attend" },
            });
          },
        },
        {
          id: "gift",
          label: "Send a silver cup as a gift",
          hint: "-5g · a token, kindly meant",
          onChoose: (w) => {
            if (w.economy.state.gold >= 5) w.economy.state.gold -= 5;
            this.journal.write(
              `A silver cup, hammered the night before, was sent to the ${surname} household with a brief note in ${monarchName}'s hand. The family wept a little when it arrived. Then they put it on the mantle.`,
              "milestone",
            );
            w.consequences.schedule({
              kind: "welcome_petition_echo",
              fireInDays: 14,
              data: { surname, choice: "gift" },
            });
          },
        },
        {
          id: "decline",
          label: "Decline modestly — too soon for ceremony",
          hint: "no change · a quiet beginning",
          onChoose: (_w) => {
            this.journal.write(
              `The crown sent back a kind note thanking the ${surname}s and asking after the child's health, but declining the ceremony — the kingdom was, after all, only days old. The family understood. They named the child anyway.`,
              "event",
            );
            this.world.consequences.schedule({
              kind: "welcome_petition_echo",
              fireInDays: 14,
              data: { surname, choice: "decline" },
            });
          },
        },
      ],
      // Generous timer — this is the first decision a new player ever
      // sees. We don't want to penalize someone who's reading slowly.
      expiresAt: Date.now() + 360_000, // 6 min
      defaultOnExpire: false,
    });
  }

  private _fireWelcomePetitionEcho(c: ScheduledConsequence): void {
    const surname = String(c.data?.surname ?? "the family");
    const choice = String(c.data?.choice ?? "attend");
    let line: string;
    if (choice === "attend") {
      line = `The ${surname} child walks now, almost. They were seen in the courtyard this morning, holding on to their mother's skirt. The naming-day painting still hangs by the door.`;
    } else if (choice === "gift") {
      line = `The silver cup at the ${surname}s' is on the mantle still. It's already a little tarnished from being handled. The child has begun to grab at it whenever they're carried past.`;
    } else {
      line = `The ${surname}s' child is healthy. The family sent word of thanks for the kind note. They have not asked for anything else.`;
    }
    this.journal.write(line, "life");
  }
}
