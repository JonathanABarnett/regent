/**
 * In-world day = 24 in-world hours = `dayDurationSeconds` real seconds (default 24 min).
 * Returns hour 0..24 floating-point.
 */
export class DayNight {
  constructor(public dayDurationSeconds = 24 * 60, public startHour = 7) {}

  hourAt(simSeconds: number): number {
    const cycle = (simSeconds / this.dayDurationSeconds) * 24 + this.startHour;
    return ((cycle % 24) + 24) % 24;
  }

  /** Visual phase 0..1 over a full day, useful for palette LUT lerp. */
  phaseAt(simSeconds: number): number {
    return this.hourAt(simSeconds) / 24;
  }

  /** "dawn" | "day" | "dusk" | "night" — useful for soundtrack and NPC schedules. */
  bandAt(simSeconds: number): "dawn" | "day" | "dusk" | "night" {
    const h = this.hourAt(simSeconds);
    if (h >= 5 && h < 8) return "dawn";
    if (h >= 8 && h < 18) return "day";
    if (h >= 18 && h < 21) return "dusk";
    return "night";
  }
}
