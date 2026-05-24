import type { World } from "../World";
import type { Journal } from "./Journal";
import { makeEvent } from "../events/EventSchema";

/**
 * In-world calendar holidays — themed festivals on fixed in-world dates.
 *
 *   FOUNDING DAY     — day 1 of every in-world year (kingdom's birthday)
 *   MIDSUMMER         — day 7 of summer (longest days)
 *   HARVEST FESTIVAL  — day 1 of autumn (year's bounty in)
 *   MIDWINTER         — day 7 of winter (week into the cold)
 *
 * Distinct from the real-world Holidays.ts (which fires on player's local
 * date like Christmas, Halloween, etc.). These are in-world recurring.
 *
 * Each fires once per kingdom-year. Small reputation boost + festival
 * visual effect + unique milestone prose.
 */

const DAYS_PER_SEASON = 14;
const DAYS_PER_YEAR = DAYS_PER_SEASON * 4; // 56

const FOUNDING_DAY_OFFSET   = 0;                       // day 1 of year
const MIDSUMMER_DAY_OFFSET  = DAYS_PER_SEASON + 6;     // day 21
const HARVEST_DAY_OFFSET    = DAYS_PER_SEASON * 2;     // day 29
const MIDWINTER_DAY_OFFSET  = DAYS_PER_SEASON * 3 + 6; // day 49

const FOUNDING_LINES: readonly string[] = [
  "Founding Day! The kingdom marks another year on its banner. Children carry small flags through the courtyard. Elders raise quiet cups at the keep.",
  "It is Founding Day. The chronicler reads aloud from the first volume, as has become tradition. The new pages will fill themselves.",
];

const HARVEST_LINES: readonly string[] = [
  "The Harvest Festival begins today. The granaries are full, the wagons decorated, and the keep's kitchen has been baking since dawn.",
  "Harvest. The year's bounty rolls in by cart and basket. The kingdom feasts tonight — even those who declined the invitation.",
];

const MIDWINTER_LINES: readonly string[] = [
  "Midwinter. A bonfire burns in the courtyard tonight. People who do not normally speak find themselves shoulder-to-shoulder, looking at the flames.",
  "Midwinter has come. The watch sings a song that is older than the keep itself. The cold listens.",
];

const MIDSUMMER_LINES: readonly string[] = [
  "Midsummer — the longest day. The kingdom stays awake to see it through. Children fall asleep where they sit. No one moves them.",
  "Midsummer light pours through the keep all evening. The shadows are long and the kingdom is, for an hour, entirely golden.",
];

export interface InWorldHolidaysSnapshot {
  /** Keys "name|year" already fired so we don't double-fire after a save. */
  firedKeys: string[];
}

interface HolidayDef {
  name: string;
  dayOffset: number;
  lines: readonly string[];
}

const HOLIDAY_DEFS: readonly HolidayDef[] = [
  { name: "founding",  dayOffset: FOUNDING_DAY_OFFSET,  lines: FOUNDING_LINES  },
  { name: "midsummer", dayOffset: MIDSUMMER_DAY_OFFSET, lines: MIDSUMMER_LINES },
  { name: "harvest",   dayOffset: HARVEST_DAY_OFFSET,   lines: HARVEST_LINES   },
  { name: "midwinter", dayOffset: MIDWINTER_DAY_OFFSET, lines: MIDWINTER_LINES },
];

export class InWorldHolidays {
  state: InWorldHolidaysSnapshot = { firedKeys: [] };
  private fired = new Set<string>();

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): InWorldHolidaysSnapshot { return { firedKeys: [...this.fired] }; }
  restore(s: InWorldHolidaysSnapshot): void { this.fired = new Set(s.firedKeys); }

  tick(): void {
    const day = this.world.state.day;
    const year = this.world.state.year;
    const dayOfYear = (day - 1) % DAYS_PER_YEAR;
    for (const h of HOLIDAY_DEFS) {
      if (dayOfYear !== h.dayOffset) continue;
      const key = `${h.name}|${year}`;
      if (this.fired.has(key)) continue;
      // Don't fire Founding Day in year 1 — that's the founding itself, not an anniversary.
      if (h.name === "founding" && year === 1) {
        this.fired.add(key);
        continue;
      }
      this.fired.add(key);
      this._fire(h);
    }
  }

  private _fire(h: HolidayDef): void {
    const line = h.lines[Math.floor(this.rand() * h.lines.length)];
    this.journal.write(line, "milestone");
    this.world.reputation.adjust(1);
    const castle = this.world.map.structures.find((s) => s.kind === "castle");
    this.world.bus.publish(
      makeEvent("festival", {
        source: "internal",
        intensity: 0.7,
        duration_ms: 18_000,
        payload: { label: h.name, structure: castle?.id },
      }),
    );
  }
}
