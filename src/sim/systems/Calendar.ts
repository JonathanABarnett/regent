/**
 * Wall-clock calendar. The kingdom advances 1 in-world day every
 * `minutesPerDay` real-world minutes (default 48 — one in-world year ≈ 38h).
 * We track a "kingdom epoch" (real-world ms at the founding moment) so the
 * displayed Day-N tracks actual elapsed real time. Players who close the app
 * for a week return to a kingdom that is "a week older".
 *
 * Seasons rotate every 14 in-world days:
 *   at 48 min/day  →  ~11h 12min per season, ~44h 48min per year
 *   at 24 min/day  →  ~5h 36min per season,  ~22h 24min per year
 */

export type Season = "spring" | "summer" | "autumn" | "winter";

export interface CalendarSnapshot {
  /** in-world day, starting at 1 */
  day: number;
  /** day-of-week label */
  dayOfWeek: string;
  /** in-world year, starting at 1 */
  year: number;
  /** current season */
  season: Season;
  /** progress 0..1 through the current season */
  seasonProgress: number;
}

const DAYS_OF_WEEK = ["Moonday", "Forgeday", "Sunday", "Hearthday", "Riverday", "Stoneday", "Restday"];
const DAYS_PER_SEASON = 14;
const SEASONS_PER_YEAR = 4;
const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR;

const SEASON_ORDER: Season[] = ["spring", "summer", "autumn", "winter"];

export interface CalendarConfig {
  /** real-world ms at which day 1 began for this kingdom */
  foundedAtMs: number;
  /** real-time minutes per in-world day. Default 48. */
  minutesPerDay?: number;
  /** if true, season is taken from real wall-clock month instead of in-world day */
  followRealSeasons?: boolean;
}

export class Calendar {
  constructor(public cfg: CalendarConfig) {}

  snapshot(nowMs: number = Date.now()): CalendarSnapshot {
    const minutesPerDay = this.cfg.minutesPerDay ?? 48;
    const realMsPerDay = minutesPerDay * 60 * 1000;
    const elapsedMs = Math.max(0, nowMs - this.cfg.foundedAtMs);
    const daysElapsed = Math.floor(elapsedMs / realMsPerDay);
    const day = daysElapsed + 1;
    const year = Math.floor(daysElapsed / DAYS_PER_YEAR) + 1;
    const dayInYear = daysElapsed % DAYS_PER_YEAR;
    let season: Season;
    let seasonProgress: number;
    if (this.cfg.followRealSeasons) {
      season = seasonFromRealDate(new Date(nowMs));
      seasonProgress = realSeasonProgress(new Date(nowMs));
    } else {
      const seasonIndex = Math.floor(dayInYear / DAYS_PER_SEASON);
      season = SEASON_ORDER[seasonIndex % 4];
      seasonProgress = (dayInYear % DAYS_PER_SEASON) / DAYS_PER_SEASON;
    }
    const dayOfWeek = DAYS_OF_WEEK[daysElapsed % 7];
    return { day, dayOfWeek, year, season, seasonProgress };
  }
}

function seasonFromRealDate(d: Date): Season {
  const m = d.getMonth(); // 0..11
  if (m < 2 || m === 11) return "winter";
  if (m < 5) return "spring";
  if (m < 8) return "summer";
  return "autumn";
}

function realSeasonProgress(d: Date): number {
  const m = d.getMonth();
  const day = d.getDate();
  const seasonStartMonth =
    m < 2 || m === 11 ? 11 : m < 5 ? 2 : m < 8 ? 5 : 8;
  // approximation: (days since season start) / 90
  const monthsIntoSeason = (m - seasonStartMonth + 12) % 12;
  const daysIntoSeason = monthsIntoSeason * 30 + day;
  return Math.min(1, daysIntoSeason / 90);
}

export function seasonTint(season: Season): { r: number; g: number; b: number } {
  switch (season) {
    case "spring": return { r: 1.02, g: 1.06, b: 0.96 }; // vivid green-tinged
    case "summer": return { r: 1.06, g: 1.02, b: 0.88 }; // warm gold
    case "autumn": return { r: 1.10, g: 0.86, b: 0.72 }; // amber/rust
    case "winter": return { r: 0.88, g: 0.94, b: 1.10 }; // cool blue
  }
}
