/**
 * Threats system — a rare, low-stakes monster siege.
 *
 * Every in-world day there is a small chance (~1.5% baseline) that a "threat"
 * arises: a beast comes out of the wood, a bandit camp sets up nearby, a
 * wolf-pack tracks the southern flocks. A threat fires:
 *   1. A `monster` event on the bus (with a structure target for the visual)
 *   2. A journal entry in the "weather" kind
 *   3. A decision asking the player how to respond
 *      — "send the guard" (small treasury/gold cost, succeeds)
 *      — "rouse the militia" (small population risk, succeeds)
 *      — "let it pass" (cheap, may worsen)
 *
 * Captain of the Guard seated dramatically reduces the threat chance, mirroring
 * the existing storm dampening — same flavor, different mechanic.
 *
 * Cozy-appropriate stakes: no NPC actually dies from a threat by default;
 * the worst case is small gold loss and a stern journal entry. The point is
 * narrative texture, not loss-aversion gameplay.
 */

import type { World } from "../World";
import type { Journal } from "./Journal";
import { makeEvent } from "../events/EventSchema";

/**
 * Threat kinds, each with multiple opening flavor lines. One opening is
 * picked at fire-time via the seeded RNG so the same threat kind reads
 * differently across its repeat appearances.
 */
const THREAT_LINES: ReadonlyArray<{ kind: string; openings: readonly string[] }> = [
  {
    kind: "wolves",
    openings: [
      "Wolves came down from the high pines tonight — three sheep are missing.",
      "A wolf-pack tracked the south flocks at dusk. The shepherds counted heads twice and were short.",
      "Old hunters say the wolves are bolder this season. A pup was seen sitting on a fencepost in daylight.",
    ],
  },
  {
    kind: "bandits",
    openings: [
      "A bandit camp was spotted on the eastern road. The merchants are spooked.",
      "A merchant arrived missing a wagon and one shoe, with a story that does not quite add up.",
      "Smoke rose from a clearing where there shouldn't be a clearing. The watch sent two riders to confirm.",
    ],
  },
  {
    kind: "beast",
    openings: [
      "Something large left tracks at the wood's edge — too big for a wolf, too small for a bear.",
      "A trapper returned with an empty bag and a face the color of cold ash.",
      "Three separate witnesses described the same impossible shape moving along the ridge at dawn.",
    ],
  },
  {
    kind: "raiders",
    openings: [
      "Riders in unmarked colors were seen testing the kingdom's borders.",
      "A scout returned with a count of fires — too many for any patrol the kingdom recognizes.",
      "Hoofprints crossed the north road in a single column. The watch counted forty.",
    ],
  },
  {
    kind: "haunting",
    openings: [
      "A few villagers swear they saw lights moving in the old quarry. No one will go near it.",
      "The chapel bell rang three times at midnight. No one was inside the chapel.",
      "Two children came home with the same story about a figure in the orchard. Their parents were already not sleeping well.",
    ],
  },
  {
    kind: "smugglers",
    openings: [
      "Smugglers were seen unloading sealed crates at the south cove at midnight.",
      "A fisher reported a boat with no flag and no lanterns running the coast on a moonless night.",
      "An empty crate washed up at first light, branded with a sigil no one in the kingdom recognized.",
    ],
  },
  {
    kind: "wraith",
    openings: [
      "A pale figure was seen at the chapel gate three nights running. No one has seen it leave.",
      "An old well, dry for forty years, was found wet at dawn. The water tasted of metal.",
      "A grave-marker at the south burial ground was found facing the wrong way. The sexton swears she set it right.",
    ],
  },
];

export class Threats {
  /** Day of the last threat fire — keeps cadence sane. */
  private lastFiredDay = -1;
  private readonly minDaysBetween: number;
  private readonly baseChance: number;
  private idCounter = 0;

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
    opts: { minDaysBetween?: number; baseChance?: number } = {},
  ) {
    this.minDaysBetween = opts.minDaysBetween ?? 4;
    this.baseChance = opts.baseChance ?? 0.015;
  }

  /** Called on day rollover. May fire a threat. */
  tick(): void {
    const day = this.world.state.day;
    if (day - this.lastFiredDay < this.minDaysBetween) return;
    // Captain seated → 60% reduction in threat chance
    const chance = this.world.courtEffects.captainSeated
      ? this.baseChance * 0.4
      : this.baseChance;
    if (this.rand() >= chance) return;

    // Pick a flavor + target town. The flavor object now carries a small pool
    // of opening sentences per kind, picked here so repeat encounters with the
    // same threat type don't read identically.
    const flavor = THREAT_LINES[Math.floor(this.rand() * THREAT_LINES.length)];
    const opening = flavor.openings[Math.floor(this.rand() * flavor.openings.length)];
    const towns = this.world.map.structures.filter((s) => s.kind === "town");
    if (!towns.length) return;
    const target = towns[Math.floor(this.rand() * towns.length)];

    this.lastFiredDay = day;
    this.idCounter++;
    const decId = `threat_${day}_${this.idCounter}`;

    // Visual + chronicle
    this.world.bus.publish(
      makeEvent("monster", {
        source: "narrative",
        intensity: 0.55,
        duration_ms: 30_000,
        payload: { structure: target.id, label: flavor.kind },
      }),
    );
    this.journal.write(opening, "weather", target.id);

    // Decision
    const expiresAt = Date.now() +
      (this.world.courtEffects.advisorSeated ? 180_000 : 90_000);
    const flavorKind = flavor.kind;
    const rand = this.rand;
    this.world.decisions.propose({
      id: decId,
      title: `A threat near ${target.name}`,
      body: `${opening} The court awaits your direction.`,
      expiresAt,
      defaultOnExpire: true,
      options: [
        {
          id: "send_guard",
          label: "Send the guard",
          onChoose: (w) => {
            const cost = 15;
            w.economy.state.gold = Math.max(0, w.economy.state.gold - cost);
            w.journal.write(
              `The guard rode out and resolved the ${flavorKind} matter at ${target.name}. The captain's purse was lighter by ${cost} gold.`,
              "milestone",
            );
            // 30% chance of a small treasure recovered.
            if (rand() < 0.3) {
              w.treasury.acquire("relic", `recovered after the ${flavorKind} incident`);
            }
          },
        },
        {
          id: "rouse_militia",
          label: "Rouse the militia",
          onChoose: (w) => {
            w.journal.write(
              `Every able body in ${target.name} took up a hayfork for a night. The ${flavorKind} threat moved on. The town slept poorly.`,
              "milestone",
            );
          },
        },
        {
          id: "let_pass",
          label: "Let it pass",
          onChoose: (w) => {
            // 40% chance the situation worsens: another threat may fire sooner.
            if (rand() < 0.4) {
              this.lastFiredDay = day - Math.floor(this.minDaysBetween / 2);
              w.journal.write(
                `The ${flavorKind} threat near ${target.name} was left alone. By dawn, two more sheep were missing. The shepherds will not forget.`,
                "weather",
              );
            } else {
              w.journal.write(
                `The ${flavorKind} threat near ${target.name} drifted off on its own. Some called it cowardice; the wise just called it luck.`,
                "event",
              );
            }
          },
        },
      ],
    });
  }
}
