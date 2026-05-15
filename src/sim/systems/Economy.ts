/**
 * Tiny tick-driven economy. Resources accumulate at workplaces; events fire when
 * thresholds cross. Keeps the world feeling productive even with no external input.
 */
export interface EconomyState {
  /** ore at the mine */
  ore: number;
  /** finished items at the forge */
  ironwork: number;
  /** books written in the library */
  tomes: number;
  /** gold in the treasury */
  gold: number;
}

export class Economy {
  state: EconomyState = { ore: 0, ironwork: 0, tomes: 0, gold: 50 };

  /**
   * Court Scholar seated — when true, tome production rate is boosted by 50%.
   * Set by `World.setCourt`. Defaults off.
   */
  scholarBonus = false;

  /** dt in sim seconds */
  tick(dt: number, miners: number, smiths: number, scholars: number) {
    // miners produce ore, smiths consume ore to make ironwork (+ gold), scholars produce tomes
    const oreRate = 0.08 * miners;
    const smithRate = Math.min(0.05 * smiths, this.state.ore * 0.5);
    const scholarRate = 0.02 * scholars * (this.scholarBonus ? 1.5 : 1);

    this.state.ore += oreRate * dt;
    this.state.ore -= smithRate * dt;
    this.state.ironwork += smithRate * dt;
    this.state.tomes += scholarRate * dt;
    this.state.gold += smithRate * dt * 2;

    // soft caps so numbers stay bounded
    this.state.ore = Math.min(this.state.ore, 999);
    this.state.ironwork = Math.min(this.state.ironwork, 999);
    this.state.tomes = Math.min(this.state.tomes, 999);
    this.state.gold = Math.min(this.state.gold, 99999);
  }
}
