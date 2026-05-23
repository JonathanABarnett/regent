import type { World } from "../World";
import type { Journal } from "./Journal";

/**
 * Old Days — when the kingdom is 20+ years old, periodic journal anchors
 * frame the founding monarch and the founding years as mythic ancestry.
 * Children born in-sim grew up never having met the founders; the world
 * has shifted from "current events" to "history."
 *
 * Fires every ~25 in-world days when year >= 20, with a cooldown.
 */

const MIN_YEAR_FOR_MYTH = 20;
const COOLDOWN_DAYS = 25;
const CHANCE_PER_CHECK = 0.45;

const OLD_DAYS_LINES: readonly string[] = [
  "A child asked the elder today what the first monarch was like. The elder thought for a long moment and said: \"taller, in the stories.\"",
  "The chronicler closed a volume on the founding years today. The new one starts \"and so the old days end.\" The ink was still wet by evening.",
  "Someone asked why a particular stone in the keep wall has a name carved on it. No one alive knew. The chronicler wrote it down and intends to find out.",
  "The bell that was rung at the founding has not been rung since. It sits in the tower, polished, untouched. The youngest guards have started calling it \"the old bell.\"",
  "An elder told a child today that {founder} once stood at the very same gate. The child looked at the gate, then at the elder, and asked if {founder} had been tall. The elder said yes.",
  "A song that was sung at the founding has slowly become unrecognisable. Each new generation sings it slightly differently. It is still beautiful. It is no longer the same song.",
  "The chronicler noted today that the kingdom has now existed for more years than {founder} did. The kingdom is older than its founder ever became.",
  "A child today pointed at the founder's painting and asked \"who is that?\" — without knowing. The elder who answered did not correct the child's tone. There is no need anymore. The founder is history.",
  "An old hand traced the original boundary marker today. They were the last living person to remember the day it was placed. After today they are not so sure they remember it correctly.",
  "The founding monarch's chair in the great hall has not been sat in for years. No one decided this. It simply became one of those things.",
  "The phrase \"in the old days\" entered the chronicle today, written by a scholar who was born after the old days had already ended.",
];

export interface OldDaysSnapshot {
  lastFiredDay: number;
}

export class OldDays {
  state: OldDaysSnapshot = { lastFiredDay: -COOLDOWN_DAYS };

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): OldDaysSnapshot { return { ...this.state }; }
  restore(s: OldDaysSnapshot): void { this.state = { ...s }; }

  tick(): void {
    if (this.world.state.year < MIN_YEAR_FOR_MYTH) return;
    const day = this.world.state.day;
    if (day - this.state.lastFiredDay < COOLDOWN_DAYS) return;
    if (this.rand() > CHANCE_PER_CHECK) return;

    this.state.lastFiredDay = day;
    // Look up the founding monarch name (saved on identity, but easier:
    // the legacy/history system has it). Fallback to "the first monarch".
    const founderName = this._founderName();
    const line = OLD_DAYS_LINES[Math.floor(this.rand() * OLD_DAYS_LINES.length)]
      .replaceAll("{founder}", founderName);
    this.journal.write(line, "milestone");
  }

  private _founderName(): string {
    // Look at the journal for a "founded under the rule of X" entry.
    // The Founding system writes one on day 1; we don't have direct
    // access to it here, so we use a generic fallback. Specific founder
    // names would require an identity hook, which can be wired later.
    return "the first monarch";
  }
}
