import type { World } from "../World";
import type { Journal } from "./Journal";

/**
 * Comet sighting — once per decade-ish, a comet hangs in the night sky for
 * 7 in-world days. Citizens reference the previous comet ("the last time
 * the comet came was the year my mother was born"). Pushes reputation
 * drift toward whichever extreme the kingdom is already leaning — comets
 * have always been read as omens, good or ill.
 *
 * Persistence: lastCometYear so we can compute "the last comet was N years
 * ago" prose. activeUntilDay so we render the comet's tail across
 * multiple nights consistently.
 */

const COMET_DURATION_DAYS = 7;
const COMET_MIN_YEAR_GAP = 9;
const COMET_BASE_CHANCE_PER_YEAR = 0.18; // checked once per year

const COMET_ARRIVAL_LINES: readonly string[] = [
  "A new star burns in the night sky — pale, with a long tail. The old say it is a comet, and they have been waiting.",
  "A comet has appeared above the keep. The watch saw it first. Within an hour the whole kingdom was outside, looking up.",
  "Tonight the sky has a visitor. The comet's tail points north, which is read as significant by people who read such things.",
];

const COMET_RETURN_LINES: readonly string[] = [
  "A comet has returned to the sky — the first since year {prevYear}. The eldest in the kingdom remember the last one. They are quieter than usual tonight.",
  "The comet has come back. {prevYear} was a memorable year for those old enough to recall it. They are gathering in small groups by the gate, speaking in low voices.",
  "It is the same comet. {age}-year cycle, says the chronicler, who has been waiting to use that fact for some time.",
];

const COMET_DEPARTURE_LINES: readonly string[] = [
  "The comet's tail has faded into the south. The kingdom has held its breath for seven nights. It can let it out now.",
  "The comet is gone. The kingdom will speak of it for years. The youngest were carried up to the wall to see it — they will not forget.",
  "Last night the comet was the brightest object in the sky. Tonight it is gone. That is how comets are.",
];

const COMET_GOOD_OMEN: readonly string[] = [
  "The chronicler notes that the kingdom prospered in the year of the last comet. The omen feels favorable.",
  "Old wives say a comet over a beloved kingdom is a blessing. The court is, by all accounts, beloved.",
];

const COMET_ILL_OMEN: readonly string[] = [
  "The chronicler notes that the year of the last comet brought hard winters and harder choices. Some are anxious.",
  "Children who have heard the old stories whisper that a comet over a feared kingdom is a warning. The court does not deny it.",
];

export interface CometSnapshot {
  active: boolean;
  startedYear: number;
  startedDay: number;
  activeUntilDay: number;
  lastCometYear: number;
  lastCheckedYear: number;
}

function fresh(): CometSnapshot {
  return {
    active: false,
    startedYear: 0,
    startedDay: 0,
    activeUntilDay: 0,
    lastCometYear: -COMET_MIN_YEAR_GAP, // permit a first comet at year ~9+
    lastCheckedYear: 0,
  };
}

export class Comet {
  state: CometSnapshot = fresh();

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): CometSnapshot { return { ...this.state }; }
  restore(s: CometSnapshot): void { this.state = { ...s }; }

  /** True when the renderer should draw a comet streak in the night sky. */
  isActive(): boolean {
    if (!this.state.active) return false;
    return this.world.state.day <= this.state.activeUntilDay;
  }

  /** Called once per in-world day. */
  tick(): void {
    const day = this.world.state.day;
    const year = this.world.state.year;

    // End an active comet when its window closes.
    if (this.state.active && day > this.state.activeUntilDay) {
      this._endComet();
      return;
    }
    if (this.state.active) return;

    // Year check — only roll once per new year crossing.
    if (year === this.state.lastCheckedYear) return;
    this.state.lastCheckedYear = year;

    if (year - this.state.lastCometYear < COMET_MIN_YEAR_GAP) return;
    if (this.rand() > COMET_BASE_CHANCE_PER_YEAR) return;
    this._startComet(year, day);
  }

  private _startComet(year: number, day: number): void {
    const isFirst = this.state.lastCometYear < 0;
    this.state.active = true;
    this.state.startedYear = year;
    this.state.startedDay = day;
    this.state.activeUntilDay = day + COMET_DURATION_DAYS;

    if (isFirst) {
      const line = COMET_ARRIVAL_LINES[Math.floor(this.rand() * COMET_ARRIVAL_LINES.length)];
      this.journal.write(line, "milestone");
    } else {
      const age = year - this.state.lastCometYear;
      const line = COMET_RETURN_LINES[Math.floor(this.rand() * COMET_RETURN_LINES.length)]
        .replace("{prevYear}", String(this.state.lastCometYear))
        .replace("{age}", String(age));
      this.journal.write(line, "milestone");
    }

    // Omen prose based on current reputation drift.
    const rep = this.world.reputation.score;
    if (rep >= 2) {
      const omen = COMET_GOOD_OMEN[Math.floor(this.rand() * COMET_GOOD_OMEN.length)];
      this.journal.write(omen, "event");
      this.world.reputation.adjust(1); // amplify the prevailing direction
    } else if (rep <= -2) {
      const omen = COMET_ILL_OMEN[Math.floor(this.rand() * COMET_ILL_OMEN.length)];
      this.journal.write(omen, "event");
      this.world.reputation.adjust(-1);
    }
  }

  private _endComet(): void {
    const line = COMET_DEPARTURE_LINES[Math.floor(this.rand() * COMET_DEPARTURE_LINES.length)];
    this.journal.write(line, "milestone");
    this.state.lastCometYear = this.state.startedYear;
    this.state.active = false;
  }
}
