import type { World } from "../World";
import type { Journal } from "./Journal";
import { portraitSeedFromName } from "./Decisions";
import { raiseHomestead } from "./Homestead";
import { takeNpcLife } from "./Mortality";

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
  | "welcome_petition_echo"
  /** First-reign mortality dilemma (~day +4): a named villager has taken
   *  a fever. The player can spend to save them, or conserve and lose
   *  them — the choice that can leave a permanent grave by the keep. */
  | "first_fever";

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
      case "first_fever":
        this._fireFirstFever(c);
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
    // fromDecision: deferred echoes ARE the player's choice playing out —
    // badge them so the causality thread is visible in the journal.
    this.journal.write(line, "event", { fromDecision: true });
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
    this.journal.write(line, "event", { fromDecision: true });
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
    this.journal.write(line, "event", { fromDecision: true });
  }

  // ── Founding: Welcome Petition ──────────────────────────────────────
  // The player's FIRST decision in any new kingdom. Called directly
  // from FoundingDay.fire() so the choice arrives in the same beat as
  // the fireworks — playtest signal was "nothing I do matters," and
  // having the first interaction be a passive 90-second wait absolutely
  // confirmed that read. Now the first thing the player touches is a
  // choice, not a wait.
  //
  // All three options are warm; all three schedule a +14-day echo so
  // the player sees the consequence chain pattern in their first
  // session. That's the proof that choices echo forward — the headline
  // pitch made visible.

  proposeWelcomePetitionNow(sourceId?: string): void {
    if (this.world.decisions.current()) {
      // Don't stack on top of another decision (vanishingly unlikely
      // this early, but be defensive — reschedule to retry next day).
      this.schedule({ kind: "welcome_petition", fireInDays: 1, sourceId });
      return;
    }
    this._proposeWelcomePetition(sourceId);
  }

  private _fireWelcomePetition(c: ScheduledConsequence): void {
    if (this.world.decisions.current()) {
      // Reschedule rather than drop.
      this.schedule({ kind: "welcome_petition", fireInDays: 1, sourceId: c.sourceId });
      return;
    }
    this._proposeWelcomePetition(c.sourceId);
  }

  private _proposeWelcomePetition(sourceId?: string): void {
    void sourceId; // accepted for symmetry; the prompt doesn't currently use it
    const monarch = this.world.npcs.find((n) => n.role === "monarch");
    const monarchName = monarch?.name ?? "the monarch";
    // Pick a random new-arrival surname for the family.
    const surnames = ["Marlow", "Hollis", "Greaves", "Penn", "Thatch", "Brae", "Linde"];
    const surname = surnames[Math.floor(this.rand() * surnames.length)];

    this.world.decisions.propose({
      id: `welcome_petition_${this.world.state.day}`,
      title: "A family at the gate",
      body:
        `A young family — the ${surname}s — have walked a long road to reach the new keep. Their newborn arrived the same week as the founding. They ask, shyly, whether there might be a place for them here.`,
      portraitSeed: portraitSeedFromName(surname),
      options: [
        {
          id: "home",
          label: "Grant them a home by the keep",
          hint: "a cottage rises · rep +2",
          onChoose: (w) => {
            const cottage = raiseHomestead(w, surname);
            w.reputation.adjust(2);
            if (cottage) {
              this.journal.write(
                `By week's end a cottage stood within sight of the keep, its first chimney-smoke rising. The ${surname}s moved in before the thatch had settled. ${monarchName} could see its window lit from the tower.`,
                "milestone",
                { targetStructureId: cottage.id, fromDecision: true },
              );
            } else {
              // No room found — fall back to a warm welcome without a build.
              this.journal.write(
                `The ${surname}s were given lodging by the keep and a promise of land come spring. The child slept that night under a real roof for the first time in weeks.`,
                "milestone",
                { fromDecision: true },
              );
            }
            w.consequences.schedule({
              kind: "welcome_petition_echo",
              fireInDays: 14,
              data: { surname, choice: "home" },
            });
          },
        },
        {
          id: "gift",
          label: "Send them on with a purse and a blessing",
          hint: "-5g · they settle elsewhere",
          onChoose: (w) => {
            if (w.economy.state.gold >= 5) w.economy.state.gold -= 5;
            w.reputation.adjust(1);
            this.journal.write(
              `A small purse and a note in ${monarchName}'s hand were pressed into the ${surname}s' hands at the gate. They settled a half-day's walk to the south. They speak well of the crown to anyone who passes.`,
              "milestone",
              { fromDecision: true },
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
          label: "Turn them away — the keep is not ready",
          hint: "no change · a colder beginning",
          onChoose: (_w) => {
            this.journal.write(
              `The crown sent the ${surname}s on. The keep was only days old, the stores thin. They understood, or said they did. The gate closed behind them. The chronicler noted the date.`,
              "event",
              { fromDecision: true },
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
    const choice = String(c.data?.choice ?? "home");
    let line: string;
    if (choice === "home") {
      line = `Smoke rises from the ${surname} cottage each morning now. The child was seen at the door this week, holding to the frame, watching the guards pass. It is, already, a fixed part of the kingdom's small skyline.`;
    } else if (choice === "gift") {
      line = `Word came north that the ${surname}s have planted their first field. They sent a wheel of cheese to the keep with a passing carter, "for the crown's kindness." It was good cheese.`;
    } else {
      line = `No word has come of the ${surname}s since they were turned from the gate. The chronicler left a blank line in the record where their story would have gone.`;
    }
    this.journal.write(line, "life", { fromDecision: true });
  }

  // ── Founding: the first hard call (a fever in the first reign) ──────────
  // Scheduled by FoundingDay a few days in. The other half of "choices
  // change the world": welcoming a family raised a cottage that stays;
  // here a thin-stores dilemma can cost a named villager their life, with a
  // gravestone that stays by the keep. The SAFE option is the default —
  // inaction never kills anyone; only an active trade-off does. This keeps
  // the cozy/ambient player unpunished while giving the engaged player real
  // stakes within their first session.

  private _fireFirstFever(c: ScheduledConsequence): void {
    if (this.world.decisions.current()) {
      // Don't stack — try again tomorrow.
      this.schedule({ kind: "first_fever", fireInDays: 1, sourceId: c.sourceId });
      return;
    }
    // Pick a non-monarch named villager to be the one who falls ill.
    const candidates = this.world.npcs.filter((n) => n.role !== "monarch" && !!n.name);
    if (candidates.length === 0) return; // nobody to lose — skip quietly
    const ill = candidates[Math.floor(this.rand() * candidates.length)];
    const name = ill.name!;
    const roleWord =
      ill.role === "blacksmith" ? "smith"
      : ill.role === "scholar" ? "scholar"
      : ill.role === "miner" ? "miner"
      : ill.role === "guard" ? "guard"
      : "villager";

    this.world.decisions.propose({
      id: `first_fever_${this.world.state.day}`,
      title: "A fever in the night",
      body:
        `${name}, a ${roleWord} of the new kingdom, has taken a hard fever. The kingdom keeps one healer, and the stores are thin this first season. Sending the healer — with what medicine remains — would cost dearly. Holding back would conserve what little the crown has.`,
      portraitSeed: portraitSeedFromName(name),
      options: [
        {
          id: "send_healer",
          label: "Send the healer and the last of the medicine",
          hint: "-12g · they may yet live",
          onChoose: (w) => {
            if (w.economy.state.gold >= 12) w.economy.state.gold -= 12;
            else w.economy.state.gold = 0;
            w.reputation.adjust(1);
            this.journal.write(
              `The healer went to ${name}'s bedside before dawn and did not leave for three days. The medicine is gone now — but the fever broke. ${name} is weak, and alive. The household will not forget who sent help.`,
              "milestone",
              { fromDecision: true },
            );
          },
        },
        {
          id: "hold_back",
          label: "Hold back — the kingdom cannot spare it",
          hint: "keep the stores · a hard, final cost",
          onChoose: (w) => {
            const taken = takeNpcLife(
              w,
              ill.id,
              `The crown held back, and the stores stayed full. ${name} died on the third night of the fever, in the cold of the kingdom's first season.`,
            );
            if (!taken) {
              // Villager already gone (edge case) — note the relief quietly.
              this.journal.write(
                `The fever passed of its own accord before the crown's decision could matter. ${name} survived. The stores held.`,
                "event",
                { fromDecision: true },
              );
            }
          },
        },
      ],
      // Generous window; defaults to SAVING them (option 0) on timeout —
      // a player who never answers never loses anyone to silence.
      expiresAt: Date.now() + 300_000,
      defaultOnExpire: true,
    });
  }
}
