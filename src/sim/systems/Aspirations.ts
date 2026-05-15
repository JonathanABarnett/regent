import type { World } from "../World";

/**
 * Aspirations — soft player-facing goals.
 *
 * Different from Achievements:
 *   - Achievements are retroactive (you accomplished a thing; it unlocks).
 *   - Aspirations are *prospective* (here is a goal; work toward it).
 *
 * Three aspirations are active at any time, drawn from a pool. When one
 * completes, a new one rolls in to take its place. Players who want a sense
 * of direction get it; players who want pure ambience can ignore them.
 *
 * Progress is recomputed on demand (`evaluate(world)`) so there's no tick
 * cost in the hot path. The UI calls `getActive()` to render the panel and
 * `evaluate()` after meaningful events.
 */

export interface AspirationDef {
  id: string;
  title: string;
  description: string;
  /** 0..1 current progress; >=1 means complete. */
  progress: (world: World) => number;
}

const ALL_ASPIRATIONS: AspirationDef[] = [
  {
    id: "pop_25",
    title: "A Bustling Realm",
    description: "Reach 25 villagers.",
    progress: (w) => w.npcs.length / 25,
  },
  {
    id: "pop_50",
    title: "A Capital",
    description: "Reach 50 villagers.",
    progress: (w) => w.npcs.length / 50,
  },
  {
    id: "vault_10",
    title: "A Collector's Vault",
    description: "Gather 10 artifacts in the royal vault.",
    progress: (w) => w.treasury.count() / 10,
  },
  {
    id: "vault_25",
    title: "A Hoard Worth Visiting",
    description: "Gather 25 artifacts in the royal vault.",
    progress: (w) => w.treasury.count() / 25,
  },
  {
    id: "gen_3",
    title: "A Line of Three",
    description: "See three different monarchs rule.",
    progress: (w) => w.succession.state.generation / 3,
  },
  {
    id: "gen_5",
    title: "A Lineage Remembered",
    description: "See five different monarchs rule.",
    progress: (w) => w.succession.state.generation / 5,
  },
  {
    id: "year_2",
    title: "Past the First Year",
    description: "Carry the kingdom into a second year.",
    progress: (w) => w.state.year / 2,
  },
  {
    id: "year_5",
    title: "A Five-Year Reign",
    description: "See the kingdom into its fifth year.",
    progress: (w) => w.state.year / 5,
  },
  {
    id: "gold_500",
    title: "A Healthy Treasury",
    description: "Hold 500 gold at once.",
    progress: (w) => w.economy.state.gold / 500,
  },
  {
    id: "ironwork_100",
    title: "A Well-Stocked Forge",
    description: "Accumulate 100 ironwork.",
    progress: (w) => w.economy.state.ironwork / 100,
  },
  {
    id: "tomes_50",
    title: "A Library of Note",
    description: "Fill the library with 50 tomes.",
    progress: (w) => w.economy.state.tomes / 50,
  },
  {
    id: "couples_5",
    title: "A Kingdom of Households",
    description: "See five married couples in the realm.",
    progress: (w) => {
      const married = w.npcs.filter((n) => n.partnerId).length / 2;
      return married / 5;
    },
  },
  {
    id: "births_3",
    title: "A Generation Born",
    description: "Welcome three children born under your reign.",
    progress: (w) => {
      const children = w.npcs.filter((n) => n.parentIds && n.parentIds.length > 0).length;
      return children / 3;
    },
  },
  {
    id: "construction_2",
    title: "A Realm in Growth",
    description: "Commission two new buildings.",
    progress: (w) => {
      const built = w.map.structures.filter(
        (s) => s.kind === "watchtower" || s.kind === "mill" || s.kind === "shrine",
      ).length;
      return built / 2;
    },
  },
  {
    id: "court_full",
    title: "A Full Court",
    description: "Seat an Advisor, Captain, and Court Scholar at once.",
    progress: (w) => {
      let n = 0;
      if (w.courtEffects.advisorSeated) n++;
      if (w.courtEffects.captainSeated) n++;
      if (w.courtEffects.scholarSeated) n++;
      return n / 3;
    },
  },
];

/** A snapshot used by the store + UI. */
export interface AspirationSnapshot {
  id: string;
  title: string;
  description: string;
  /** Clamped to [0, 1]; >= 1 means complete. */
  progress: number;
  complete: boolean;
}

/**
 * Aspirations holds three active goals at a time. When one completes it's
 * archived (id → completedAtIso) and a fresh one is drawn from the pool.
 * Persisted state is just two arrays of ids.
 */
export class Aspirations {
  /** Currently-active aspiration ids. Always length 3 (or fewer if the pool is exhausted). */
  active: string[] = [];
  /** id → ISO timestamp of completion */
  completed: Record<string, string> = {};

  /** rng for picking new aspirations from the pool. */
  constructor(private rand: () => number = Math.random) {}

  /** Pull fresh aspirations from the pool to refill `active` up to 3 slots. */
  seedInitial(): void {
    while (this.active.length < 3) {
      const next = this.pickFreshId();
      if (!next) break;
      this.active.push(next);
    }
  }

  /**
   * Recompute progress for each active aspiration. If any has reached 100%,
   * mark it complete, write a completion timestamp, and pick a replacement.
   *
   * Returns the ids of any aspirations that JUST completed on this call
   * (useful for UI toasts).
   */
  evaluate(world: World): string[] {
    const newlyCompleted: string[] = [];
    for (let i = 0; i < this.active.length; i++) {
      const id = this.active[i];
      const def = ALL_ASPIRATIONS.find((a) => a.id === id);
      if (!def) {
        // unknown id (e.g. removed in a code update) — silently drop
        this.active.splice(i, 1);
        i--;
        continue;
      }
      const p = def.progress(world);
      if (p >= 1) {
        this.completed[id] = new Date().toISOString();
        newlyCompleted.push(id);
        const replacement = this.pickFreshId();
        if (replacement) {
          this.active[i] = replacement;
        } else {
          // Pool exhausted — leave the slot empty
          this.active.splice(i, 1);
          i--;
        }
      }
    }
    return newlyCompleted;
  }

  /** UI-facing snapshot of the active list. */
  getActive(world: World): AspirationSnapshot[] {
    return this.active
      .map((id) => {
        const def = ALL_ASPIRATIONS.find((a) => a.id === id);
        if (!def) return null;
        const raw = def.progress(world);
        const progress = Math.max(0, Math.min(1, raw));
        return {
          id: def.id,
          title: def.title,
          description: def.description,
          progress,
          complete: progress >= 1,
        };
      })
      .filter((x): x is AspirationSnapshot => x !== null);
  }

  /** Hydrate from a save. */
  hydrate(active: string[], completed: Record<string, string>): void {
    this.active = active.filter((id) => ALL_ASPIRATIONS.some((a) => a.id === id));
    this.completed = { ...completed };
    if (this.active.length < 3) this.seedInitial();
  }

  /** Pick a random aspiration id that's neither active nor already completed. */
  private pickFreshId(): string | undefined {
    const pool = ALL_ASPIRATIONS.filter(
      (a) => !this.active.includes(a.id) && !this.completed[a.id],
    );
    if (!pool.length) return undefined;
    return pool[Math.floor(this.rand() * pool.length)].id;
  }

  static definitions(): AspirationDef[] {
    return ALL_ASPIRATIONS;
  }
}
