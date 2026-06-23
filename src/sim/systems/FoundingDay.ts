import type { World } from "../World";
import type { Journal } from "./Journal";
import { makeEvent } from "../events/EventSchema";

/**
 * The first 90 seconds of a new kingdom.
 *
 * A 99-cent buyer who founds a kingdom and sees nothing happen for two
 * minutes refunds the game. This system exists to make sure that
 * doesn't happen — it fires a guaranteed event sequence the moment the
 * kingdom is founded:
 *
 *   - A festival event publishes immediately (engine renders fireworks
 *     over the castle for ~40 seconds)
 *   - A courier event publishes after a short delay (visible rider on
 *     the map, journal entry: "the seal of office was delivered")
 *   - The Welcome Petition fires IMMEDIATELY (not on a day +2 schedule —
 *     playtest showed players quit before a delayed first decision).
 *     The first thing the player touches in the world is a choice. Its
 *     options each schedule a +14-day follow-up, demonstrating the
 *     consequence-chain pattern within their first session.
 *
 * Idempotent: a `fired` flag prevents re-firing after save/load or
 * a second call. Survives the Persistence round-trip.
 */

export interface FoundingDaySnapshot {
  fired: boolean;
}

export class FoundingDay {
  state: FoundingDaySnapshot = { fired: false };

  constructor(
    private world: World,
    private journal: Journal,
  ) {}

  snapshot(): FoundingDaySnapshot { return { ...this.state }; }
  restore(s: FoundingDaySnapshot): void { this.state = { ...s }; }

  /**
   * Trigger the founding sequence. Called from App.tsx after the player
   * commits the character creator. No-op if already fired (defensive).
   */
  fire(): void {
    if (this.state.fired) return;
    this.state.fired = true;

    const castle = this.world.map.structures.find((s) => s.kind === "castle");
    if (!castle) return;

    // 1. Fireworks over the castle — festival event drives the visual.
    this.world.bus.publish(
      makeEvent("festival", {
        source: "internal",
        intensity: 1.0,
        duration_ms: 40_000,
        payload: { label: "founding" },
      }),
    );

    // 2. Courier ride into the castle — small narrative beat. Fired
    // via the bus so the EntityLayer animates a horse sprite arriving.
    this.world.bus.publish(
      makeEvent("courier", {
        source: "internal",
        intensity: 0.8,
        duration_ms: 8_000,
        payload: { label: "the seal of office", to: castle.name },
      }),
    );

    // 3. A flourish journal entry beyond the three the App writes at
    // founding — this one names the day specifically as the
    // beginning of the chronicle, so when the player opens the
    // journal in their first minute, the chronicle already reads
    // like a story.
    this.journal.write(
      "The first day. A messenger arrived with the seal of office before the bells had finished ringing. Fireworks were set off above the keep. The chronicler began this record.",
      "milestone",
      castle.id,
    );

    // 4. Propose the Welcome Petition IMMEDIATELY (not on a day +2
    //    schedule like the original implementation). Playtest signal
    //    from three first-time players: at 1× speed, day +2 = 1.5 real
    //    minutes of staring at a quiet world before anything
    //    interactive — and they all quit before then. Now the first
    //    thing they touch in the kingdom is a choice, not a wait.
    //
    //    The petition's onChoose still schedules a +14-day echo, so
    //    the consequence chain pattern shows itself within the first
    //    10 minutes of session (the original promise) — just without
    //    the dead-air opening.
    this.world.consequences.proposeWelcomePetitionNow("founding_day");

    // 5. Schedule the first hard call — a fever in the first reign (~day +4).
    //    Welcoming the family raises a cottage that STAYS; this is the other
    //    pole: a thin-stores dilemma that can cost a named villager their
    //    life, leaving a grave by the keep. The safe option is the default,
    //    so a passive player never loses anyone to silence — only an active
    //    trade-off does. Together they make the first session's choices
    //    visibly, permanently mark the world.
    this.world.consequences.schedule({
      kind: "first_fever",
      fireInDays: 4,
      sourceId: "founding_day",
    });
  }
}
