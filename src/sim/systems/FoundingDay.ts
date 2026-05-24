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
 *   - A "welcome_petition" Consequence is scheduled for day +2 so the
 *     player sees their FIRST DECISION within ~2 in-world minutes at
 *     standard speed. The petition's options each schedule +14-day
 *     follow-ups, demonstrating the chain pattern within their first
 *     session.
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

    // 4. Schedule the welcome petition — fires in 2 in-world days,
    // which is roughly 1.5 real minutes at standard speed. Demonstrates
    // the choice → consequence loop before the player decides whether
    // to refund.
    this.world.consequences.schedule({
      kind: "welcome_petition",
      fireInDays: 2,
      sourceId: "founding_day",
    });
  }
}
