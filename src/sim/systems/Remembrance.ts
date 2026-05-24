import type { World } from "../World";
import type { Journal } from "./Journal";

/**
 * Remembrance — track named deaths and fire quiet anniversary entries
 * on the in-world anniversary of each loss (1, 5, 10, 25 years out).
 *
 * Notable deaths are recorded via `record(name, day)` — called from
 * LifeEvents.tryDeath, LifeEvents.warDeath, and Disasters._plagueDeath.
 *
 * Anniversaries fire as quiet "life" kind entries. Cap at 200 stored
 * records; oldest fade out first.
 */

const ANNIVERSARY_OFFSETS = [365, 365 * 5, 365 * 10, 365 * 25];
// In-world days per year ≈ 56, so we use 56 * years for the actual offset:
const ANNIVERSARY_YEAR_OFFSETS = [1, 5, 10, 25];
const DAYS_PER_YEAR = 56;
const RECORDS_CAP = 200;

const REMEMBRANCE_LINES: readonly string[] = [
  "{year} year{s} ago today, {name} was lost. The kingdom does not forget.",
  "On this day {year} year{s} past, the chronicle was opened to record the passing of {name}. The page is now older than most of those who walk past it.",
  "{name} died on this day, {year} year{s} ago. A candle was lit at the keep this morning, quietly, by someone who remembered.",
  "The chronicler turned to an old page today — {name}, lost {year} year{s} ago this date. The ink has not faded as much as one might expect.",
  "An elder set a stone on the wall this morning. They did not say why. The chronicler checked the record: it was the day {name} died, {year} year{s} ago.",
];

interface DeathRecord {
  name: string;
  day: number;
  year: number;
}

export interface RemembranceSnapshot {
  records: DeathRecord[];
  /** Set of "name|year" keys for anniversaries we've already fired. */
  firedKeys: string[];
}

export class Remembrance {
  state: RemembranceSnapshot = { records: [], firedKeys: [] };
  private fired = new Set<string>();

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): RemembranceSnapshot {
    return {
      records: this.state.records.map((r) => ({ ...r })),
      firedKeys: [...this.fired],
    };
  }
  restore(s: RemembranceSnapshot): void {
    this.state.records = s.records.map((r) => ({ ...r }));
    this.fired = new Set(s.firedKeys);
  }

  /** Called by death systems to register a notable named loss. */
  record(name: string, day: number, year: number): void {
    if (!name) return;
    this.state.records.push({ name, day, year });
    if (this.state.records.length > RECORDS_CAP) {
      this.state.records.shift();
    }
  }

  /** Called once per in-world day from World.tick. */
  tick(): void {
    const today = this.world.state.day;
    for (const rec of this.state.records) {
      for (const yearsAgo of ANNIVERSARY_YEAR_OFFSETS) {
        const targetDay = rec.day + yearsAgo * DAYS_PER_YEAR;
        if (targetDay !== today) continue;
        const key = `${rec.name}|${yearsAgo}`;
        if (this.fired.has(key)) continue;
        this.fired.add(key);
        const yearStr = String(yearsAgo);
        const s = yearsAgo === 1 ? "" : "s";
        const line = REMEMBRANCE_LINES[Math.floor(this.rand() * REMEMBRANCE_LINES.length)]
          .replaceAll("{name}", rec.name)
          .replaceAll("{year}", yearStr)
          .replaceAll("{s}", s);
        this.journal.write(line, "life");
      }
    }
  }
}
