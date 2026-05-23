import type { World } from "../World";
import type { Journal } from "./Journal";

/**
 * Sagas — multi-generation quest arcs that span years.
 *
 * Each saga is a 2-stage arc:
 *   PLANT  — a "seed" entry is written in the chronicle in an early year
 *            (a prophecy, a buried object, a missing person, etc.)
 *   PAYOFF — N years later, a follow-up entry resolves the seed —
 *            often involving the grandchild of someone present at the plant.
 *
 * Each saga fires at most once per kingdom. Stored by id in `firedSeeds`
 * and `firedPayoffs` so we never double-fire across saves.
 */

interface SagaDef {
  id: string;
  /** Earliest year this saga can plant. */
  minSeedYear: number;
  /** Years between plant and payoff. */
  yearsToPayoff: number;
  seed: readonly string[];
  payoff: readonly string[];
}

const SAGAS: readonly SagaDef[] = [
  {
    id: "sunken_road",
    minSeedYear: 2,
    yearsToPayoff: 12,
    seed: [
      "A bard at the keep tonight sang of a road that lies submerged just south of the river. The chronicler wrote it down. \"To be checked in a generation,\" they added in their own hand.",
    ],
    payoff: [
      "Scouts confirmed it today — a stone road, half-buried under silt, runs south from the river. The bard's song from {years} years ago was not metaphor. The kingdom now has a forgotten causeway it can use.",
    ],
  },
  {
    id: "lost_bell",
    minSeedYear: 3,
    yearsToPayoff: 15,
    seed: [
      "An old elder told the children today about a bronze bell that was lost in the founding chaos. \"Hidden, not stolen,\" they insisted. \"And someone alive today will hear it ring before they die.\"",
    ],
    payoff: [
      "The lost bell from the founding was unearthed today during well-digging in the south quarter. {years} years to the day, more or less, since the elder's prophecy. The bell still rings. The elder is no longer alive to hear it. Their grandchild rang it for them.",
    ],
  },
  {
    id: "hidden_well",
    minSeedYear: 2,
    yearsToPayoff: 10,
    seed: [
      "A traveller passing through the keep last week claimed there was an old well, sealed in the founding years for reasons no one would say. They were laughed at. The chronicler wrote it down anyway.",
    ],
    payoff: [
      "Workers laying new foundations found the sealed well today. There was a small box inside, weighted down with stones. The contents are being examined. The traveller's story from {years} years back has, it seems, paid out.",
    ],
  },
  {
    id: "stranger_in_the_wood",
    minSeedYear: 3,
    yearsToPayoff: 14,
    seed: [
      "A hunter brought back word today of a small grave deep in the eastern woods, marked only with a name no one in the kingdom recognises. The chronicler entered it as 'unknown — to be revisited.'",
    ],
    payoff: [
      "A traveller arrived today from {years_ago_partner} bearing a name that matches the unknown grave from {years} years ago. They came to pay respects. The kingdom does not know the story, but it knows enough to keep silent and let them.",
    ],
  },
  {
    id: "comet_prophecy",
    minSeedYear: 4,
    yearsToPayoff: 18,
    seed: [
      "A wandering prophet preached at the south gate today: \"a comet will return, and a child not yet born will name it.\" Most ignored them. The chronicler did not.",
    ],
    payoff: [
      "Today a small child at the gate, watching the night sky, said the comet's name aloud as if reciting something they had always known. The chronicler turned a page back {years} years and underlined a line they had written without believing it.",
    ],
  },
];

const NEIGHBOR_KINGDOMS = ["the Verdant League", "Kestmark", "the Hollow Hills"];

export interface SagasSnapshot {
  /** ID → year the seed was planted. */
  planted: Record<string, number>;
  firedPayoffs: string[];
}

export class Sagas {
  state: SagasSnapshot = { planted: {}, firedPayoffs: [] };
  private payoffs = new Set<string>();

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): SagasSnapshot {
    return { planted: { ...this.state.planted }, firedPayoffs: [...this.payoffs] };
  }
  restore(s: SagasSnapshot): void {
    this.state.planted = { ...s.planted };
    this.payoffs = new Set(s.firedPayoffs);
  }

  tick(): void {
    const year = this.world.state.year;

    // 1) Try to plant a new seed (rarely — once every few in-world years).
    if (this.rand() < 0.04) this._tryPlant(year);

    // 2) Resolve any sown saga whose payoff year has arrived.
    for (const def of SAGAS) {
      if (this.payoffs.has(def.id)) continue;
      const plantedYear = this.state.planted[def.id];
      if (plantedYear === undefined) continue;
      if (year < plantedYear + def.yearsToPayoff) continue;
      this._firePayoff(def, year - plantedYear);
    }
  }

  private _tryPlant(year: number): void {
    const eligible = SAGAS.filter(
      (s) => year >= s.minSeedYear && this.state.planted[s.id] === undefined,
    );
    if (eligible.length === 0) return;
    const def = eligible[Math.floor(this.rand() * eligible.length)];
    this.state.planted[def.id] = year;
    const line = def.seed[Math.floor(this.rand() * def.seed.length)];
    this.journal.write(line, "event");
  }

  private _firePayoff(def: SagaDef, yearsElapsed: number): void {
    this.payoffs.add(def.id);
    const partnerForPayoff = NEIGHBOR_KINGDOMS[Math.floor(this.rand() * NEIGHBOR_KINGDOMS.length)];
    const line = def.payoff[Math.floor(this.rand() * def.payoff.length)]
      .replaceAll("{years}", String(yearsElapsed))
      .replaceAll("{years_ago_partner}", partnerForPayoff);
    this.journal.write(line, "milestone");
  }
}
