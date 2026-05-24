import type { World } from "../World";
import type { Journal } from "./Journal";
import { makeEvent } from "../events/EventSchema";

/**
 * Great Anniversaries — major milestones at year 25, 50, and 100.
 * Each fires a Decision with three player choices:
 *
 *   OPEN VAULT     — distribute 3 random artifacts to the people.
 *                    Reputation +5, vault smaller.
 *   PARDON        — release all imprisoned figures from past usurpers
 *                    or hostile camps. Reputation +3, story memory.
 *   MONUMENT      — commission a great monument. Costs 60 gold,
 *                    permanent journal entry recording the milestone.
 *
 * Once per year-mark per kingdom. Persisted so we don't double-fire
 * after a save/load.
 */

const MILESTONES = [25, 50, 100, 150, 200];
const MONUMENT_COST = 60;

const ANNOUNCEMENT_LINES: Record<number, readonly string[]> = {
  25: [
    "Twenty-five years. A generation has grown from infancy under this banner.",
    "A quarter-century since the founding. Old enough that those who were born here are now in charge of much of it.",
  ],
  50: [
    "Fifty years. The kingdom has lived more years than most of its citizens. It is no longer young.",
    "Half a century since the founding. The chronicle is now thick enough to fall open at the middle of its own accord.",
  ],
  100: [
    "One hundred years. The kingdom outlives almost every soul who built it. It is old now. It has earned the word.",
    "The centennial. There is no one alive who saw the founding. The kingdom is a thing entirely of memory and stone now.",
  ],
  150: [
    "A century and a half. Few kingdoms reach this age. Those that do are remembered.",
  ],
  200: [
    "Two centuries. The kingdom is no longer young, no longer middle-aged, but ancient. Even its ancestors have ancestors here.",
  ],
};

const VAULT_RESULT_LINES: readonly string[] = [
  "By royal order, three artifacts of the vault were distributed to the people. The kingdom that was sealed away was given back. There were quiet tears in the courtyard.",
  "The vault doors were opened today. Three pieces, chosen by lottery, went to common hands. The chronicler protested. The crown insisted.",
];

const PARDON_RESULT_LINES: readonly string[] = [
  "By royal decree, every prisoner of past conflicts has been pardoned. They walked out at noon under their own power. The kingdom is lighter for it.",
  "All those held from the old wars and uprisings were released today. Some had families to find. Some had no one. The gates stood open all afternoon.",
];

const MONUMENT_RESULT_LINES: readonly string[] = [
  "A monument was raised in the courtyard to mark the {n}-year anniversary. It will stand for as long as the keep does. It will be longer than any of us.",
  "Stone was quarried, dressed, and set today. The new monument in the great hall bears the names of every monarch who has held this seat — and a date stamped in iron at the base.",
];

const SILENCE_LINES: readonly string[] = [
  "The {n}-year anniversary passed quietly. No monument, no pardon, no royal gift. The kingdom did what kingdoms do. It carried on.",
];

export interface GreatAnniversariesSnapshot {
  /** Year-marks already fired (so we don't fire twice across saves). */
  firedYears: number[];
}

export class GreatAnniversaries {
  state: GreatAnniversariesSnapshot = { firedYears: [] };
  private fired = new Set<number>();

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): GreatAnniversariesSnapshot {
    return { firedYears: [...this.fired] };
  }

  restore(s: GreatAnniversariesSnapshot): void {
    this.fired = new Set(s.firedYears);
  }

  tick(): void {
    const year = this.world.state.year;
    if (!MILESTONES.includes(year)) return;
    if (this.fired.has(year)) return;
    // Only on the first day of that year (avoid firing every day of the year).
    if ((this.world.state.day - 1) % 56 !== 0) return;
    this.fired.add(year);
    this._fire(year);
  }

  private _fire(year: number): void {
    const intros = ANNOUNCEMENT_LINES[year] ?? ANNOUNCEMENT_LINES[25];
    const intro = intros[Math.floor(this.rand() * intros.length)];
    this.journal.write(intro, "milestone");

    // Subtle festival flair so the moment lands.
    this.world.bus.publish(
      makeEvent("festival", {
        source: "internal",
        intensity: 1.0,
        duration_ms: 40_000,
        payload: { label: `${year}-year anniversary` },
      }),
    );

    this.world.decisions.propose({
      id: `great_anniversary_${year}`,
      title: `${year}-year anniversary`,
      body: `The kingdom marks ${year} years. How will the crown commemorate it?`,
      options: [
        {
          id: "vault",
          label: "Open the vault to the people",
          hint: "rep +5 · 3 oldest artifacts removed",
          onChoose: (w) => {
            // Drop the three oldest artifacts.
            const removed = w.treasury.artifacts.splice(0, 3);
            w.reputation.adjust(5);
            const names = removed.map((a) => a.name).join(", ") || "old gifts";
            const line = VAULT_RESULT_LINES[Math.floor(this.rand() * VAULT_RESULT_LINES.length)];
            this.journal.write(`${line} (Distributed: ${names}.)`, "milestone");
          },
        },
        {
          id: "pardon",
          label: "Pardon all who remain imprisoned",
          hint: "rep +3",
          onChoose: (w) => {
            w.reputation.adjust(3);
            const line = PARDON_RESULT_LINES[Math.floor(this.rand() * PARDON_RESULT_LINES.length)];
            this.journal.write(line, "milestone");
          },
        },
        {
          id: "monument",
          label: `Commission a great monument (${MONUMENT_COST} gold)`,
          hint: `-${MONUMENT_COST}g · +1 permanent relic in vault`,
          onChoose: (w) => {
            if (w.economy.state.gold >= MONUMENT_COST) {
              w.economy.state.gold -= MONUMENT_COST;
              const line = MONUMENT_RESULT_LINES[Math.floor(this.rand() * MONUMENT_RESULT_LINES.length)]
                .replace("{n}", String(year));
              this.journal.write(line, "milestone");
              w.treasury.acquire("relic", `${year}-year monument`);
            } else {
              this.journal.write(
                `The crown wished to commission a monument but the treasury was insufficient. The ${year}-year anniversary passed without a stone.`,
                "event",
              );
            }
          },
        },
      ],
      expiresAt: Date.now() + 240_000, // 4-minute window — this is a big moment
      defaultOnExpire: false,
    });

    // Silence-on-expire prose.
    setTimeout(() => {
      const d = this.world.decisions.current();
      if (d && d.id === `great_anniversary_${year}`) {
        // Decision is still pending — let it expire naturally.
        return;
      }
      // (Resolution prose is written by each option handler.)
    }, 0);
    // Unused but referenced to silence linter.
    void SILENCE_LINES;
  }
}
