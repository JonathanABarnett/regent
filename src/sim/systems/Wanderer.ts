import type { World } from "../World";
import type { Journal } from "./Journal";

/**
 * The Wanderer — a single named character who keeps reappearing across the
 * kingdom's lifetime. Different role each visit (bard, scholar, knight,
 * old soul) but the SAME name. Visibly ages between visits. By their last
 * appearance they're elderly and the kingdom recognises them.
 *
 * Cadence: first visit at year 3-5, then every 5-8 years. Maximum 5
 * appearances per kingdom (after which "they did not return").
 *
 * Persistence is critical — the name and appearance count survive saves.
 */

const WANDERER_NAMES = [
  "Belen", "Castor", "Eira", "Halix", "Joren", "Mira", "Quill",
  "Sable", "Tova", "Wren",
];

const FIRST_INTERVAL_MIN_YEARS = 3;
const FIRST_INTERVAL_MAX_YEARS = 5;
const FOLLOWUP_MIN_YEARS = 5;
const FOLLOWUP_MAX_YEARS = 8;
const MAX_APPEARANCES = 5;

interface AppearanceTemplate {
  /** Which appearance number (1 = first, 5 = final). */
  appearance: number;
  /** Approximate Wanderer age. */
  ageAtTime: number;
  /** Journal kind for this visit. */
  kind: "event" | "milestone";
  /** Prose template with {name} and {years} placeholders. */
  prose: readonly string[];
}

const APPEARANCES: AppearanceTemplate[] = [
  {
    appearance: 1,
    ageAtTime: 22,
    kind: "event",
    prose: [
      "A young traveller arrived at the keep tonight — bright-eyed, road-tired, and going by the name {name}. They asked for a meal and a bed. Both were granted. They left at dawn after writing their name in the chronicle as a courtesy.",
      "{name} came down the eastern road this evening — young, alone, carrying a single leather pack. They stayed one night, told a story, and rode on. The chronicler liked them.",
    ],
  },
  {
    appearance: 2,
    ageAtTime: 32,
    kind: "event",
    prose: [
      "{name} returned today. The same {name} — older now, sun-darkened, with a small scar at the brow that wasn't there before. They asked if the keep still kept their old journal entry. It did. They smiled and stayed for supper.",
      "An older {name} arrived at the south gate. {years} years since the last time. They were quiet about where they'd been. They asked after specific people by name — most were still here. Some were not.",
    ],
  },
  {
    appearance: 3,
    ageAtTime: 45,
    kind: "milestone",
    prose: [
      "{name} returned to the kingdom for the third time today. {years} years since the last visit. They are middle-aged now and walk with a slight limp. They were greeted by name at the gate. The watch had been told to look out for them.",
      "{name} arrived this afternoon — the same {name} from {years} years ago, and {years_total} from their first visit. The kingdom is fond of them now. They are no longer a stranger.",
    ],
  },
  {
    appearance: 4,
    ageAtTime: 58,
    kind: "milestone",
    prose: [
      "{name} returned, much grayer than the last time. The keep made up their old room without asking. They stayed for a week and told stories the children had never heard. The elders had heard them before, told differently.",
      "{name} walked into the keep yesterday after {years} years away. They are old now. They cannot pretend otherwise, and do not try. They will stay through the season.",
    ],
  },
  {
    appearance: 5,
    ageAtTime: 72,
    kind: "milestone",
    prose: [
      "{name} returned for what they said would be the last time. They are old now — properly old. They asked to be shown the chronicle, and read the entry from their first visit, {years_total} years ago. They closed the book gently and said: \"a good kingdom remembers.\"",
      "{name} arrived this morning, very slowly, walking with a staff. The kingdom turned out to greet them at the gate — children who had never met them, and elders who had known them since they were both young. {name} stayed the day. They left without ceremony at dawn.",
    ],
  },
];

export interface WandererSnapshot {
  name: string;
  /** How many times they've appeared (0-5). */
  appearances: number;
  /** Year of the last appearance. */
  lastAppearanceYear: number;
  /** Year of the first appearance — used for "{years_total}" prose. */
  firstAppearanceYear: number;
  /** Year by which they should next appear (otherwise tick is a no-op). */
  nextEligibleYear: number;
}

function freshState(): WandererSnapshot {
  return {
    name: "",
    appearances: 0,
    lastAppearanceYear: 0,
    firstAppearanceYear: 0,
    nextEligibleYear: 0,
  };
}

export class Wanderer {
  state: WandererSnapshot = freshState();

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): WandererSnapshot { return { ...this.state }; }
  restore(s: WandererSnapshot): void { this.state = { ...s }; }

  tick(): void {
    const year = this.world.state.year;
    if (this.state.appearances >= MAX_APPEARANCES) return;

    // Initialise on first call: pick a name and a target year for the first visit.
    if (!this.state.name) {
      this.state.name = WANDERER_NAMES[Math.floor(this.rand() * WANDERER_NAMES.length)];
      this.state.nextEligibleYear =
        FIRST_INTERVAL_MIN_YEARS +
        Math.floor(this.rand() * (FIRST_INTERVAL_MAX_YEARS - FIRST_INTERVAL_MIN_YEARS + 1));
    }

    if (year < this.state.nextEligibleYear) return;
    // Roll once per year-cross (small chance, so the year isn't deterministic).
    if (this.rand() > 0.4) return;
    this._appear();
  }

  private _appear(): void {
    this.state.appearances++;
    const appearance = this.state.appearances;
    if (this.state.firstAppearanceYear === 0) {
      this.state.firstAppearanceYear = this.world.state.year;
    }
    const yearsSinceLast =
      this.state.lastAppearanceYear === 0 ? 0 : this.world.state.year - this.state.lastAppearanceYear;
    const yearsTotal = this.world.state.year - this.state.firstAppearanceYear;
    this.state.lastAppearanceYear = this.world.state.year;
    this.state.nextEligibleYear =
      this.world.state.year +
      FOLLOWUP_MIN_YEARS +
      Math.floor(this.rand() * (FOLLOWUP_MAX_YEARS - FOLLOWUP_MIN_YEARS + 1));

    const tpl = APPEARANCES[appearance - 1] ?? APPEARANCES[APPEARANCES.length - 1];
    const line = tpl.prose[Math.floor(this.rand() * tpl.prose.length)]
      .replaceAll("{name}", this.state.name)
      .replaceAll("{years_total}", String(yearsTotal))
      .replaceAll("{years}", String(yearsSinceLast));
    this.journal.write(line, tpl.kind);
  }
}
