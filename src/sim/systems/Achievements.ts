import type { World } from "../World";
import type { Journal } from "./Journal";

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  /** returns true on the tick this should unlock */
  check: (ctx: AchievementContext) => boolean;
  /**
   * Hidden achievements appear as "???" in the stats panel until unlocked.
   * Use sparingly — reserve for secret/rare/unusual feats that reward discovery.
   */
  hidden?: boolean;
}

interface AchievementContext {
  world: World;
  totalCouriers: number;
  totalForges: number;
  totalStorms: number;
  totalMarriages: number;
  totalBirths: number;
  totalDeaths: number;
  lifetimeSec: number;
}

const DEFINITIONS: AchievementDef[] = [
  {
    id: "first_courier",
    title: "First Dispatch",
    description: "A courier rode out for the first time.",
    check: (c) => c.totalCouriers >= 1,
  },
  {
    id: "first_forge",
    title: "Hammer and Anvil",
    description: "The forge rang with its first strike.",
    check: (c) => c.totalForges >= 1,
  },
  {
    id: "first_storm",
    title: "The Storm Passes",
    description: "Weathered the kingdom's first storm.",
    check: (c) => c.totalStorms >= 1,
  },
  {
    id: "couriers_50",
    title: "The Royal Post",
    description: "Fifty couriers dispatched across the realm.",
    check: (c) => c.totalCouriers >= 50,
  },
  {
    id: "couriers_500",
    title: "Wings of the Crown",
    description: "Five hundred couriers — the post never sleeps.",
    check: (c) => c.totalCouriers >= 500,
  },
  {
    id: "first_marriage",
    title: "Bound at the Hearth",
    description: "The kingdom celebrated its first wedding.",
    check: (c) => c.totalMarriages >= 1,
  },
  {
    id: "first_birth",
    title: "A New Voice",
    description: "A child was born to the kingdom.",
    check: (c) => c.totalBirths >= 1,
  },
  {
    id: "first_death",
    title: "The Old Pass On",
    description: "Lost the kingdom's first elder.",
    check: (c) => c.totalDeaths >= 1,
  },
  {
    id: "day_7",
    title: "A Week in the Realm",
    description: "Seven days under the same banner.",
    check: (c) => c.world.state.day >= 7,
  },
  {
    id: "day_30",
    title: "Master of the Realm",
    description: "Thirty days — a full lunar cycle.",
    check: (c) => c.world.state.day >= 30,
  },
  {
    id: "year_1",
    title: "First Anniversary",
    description: "One full year sat on the throne.",
    check: (c) => c.world.state.year >= 2,
  },
  {
    id: "population_25",
    title: "A Bustling Realm",
    description: "Twenty-five souls call your kingdom home.",
    check: (c) => c.world.npcs.length >= 25,
  },
  {
    id: "succession_2",
    title: "Long Live the Crown",
    description: "Witnessed the ascension of a second monarch.",
    check: (c) => c.world.succession.state.generation >= 2,
  },
  {
    id: "succession_5",
    title: "A Lineage Remembered",
    description: "Five monarchs have ruled in this kingdom.",
    check: (c) => c.world.succession.state.generation >= 5,
  },
  {
    id: "vault_3",
    title: "A Collection Begins",
    description: "Three artifacts now rest in the royal vault.",
    check: (c) => c.world.treasury.count() >= 3,
  },
  {
    id: "vault_10",
    title: "Treasures of the Realm",
    description: "Ten artifacts adorn the royal vault.",
    check: (c) => c.world.treasury.count() >= 10,
  },
  {
    id: "first_building",
    title: "A Realm in Growth",
    description: "Commissioned the kingdom's first new building.",
    check: (c) =>
      c.world.map.structures.some(
        (s) => s.kind === "watchtower" || s.kind === "mill" || s.kind === "shrine",
      ),
  },
  // ---- LifeCycle achievements ----------------------------------------------
  {
    id: "first_coming_of_age",
    title: "A New Generation",
    description: "The first child born to the kingdom came of age and found their calling.",
    check: (c) => c.world.lifeCycle.snapshot().cameOfAgeIds.length >= 1,
  },
  {
    id: "first_retirement",
    title: "A Life Well Worked",
    description: "A veteran worker retired and became an elder of the realm.",
    check: (c) => c.world.lifeCycle.snapshot().retiredIds.length >= 1,
  },
  // ---- Usurper + Uprising achievements ------------------------------------
  {
    id: "usurper_faced",
    title: "The Pretender",
    description: "A court figure challenged your throne.",
    check: (c) => c.world.usurper.state.totalChallenges >= 1,
  },
  {
    id: "usurper_repelled",
    title: "The Crown Holds",
    description: "Successfully repelled a usurper challenge.",
    check: (c) => c.world.usurper.state.totalRepelled >= 1,
  },
  {
    id: "uprising_faced",
    title: "The People Speak",
    description: "A peasant uprising rose in your kingdom.",
    check: (c) => c.world.uprising.state.totalUprisings >= 1,
  },
  {
    id: "dynasty_3",
    title: "Unbroken Line",
    description: "Three consecutive natural heirs ruled without usurpation.",
    check: (c) => c.world.succession.state.dynastyStreak >= 3,
  },
  // ---- Hidden achievements (appear as "???" until unlocked) ----------------
  {
    id: "hidden_midnight_oil",
    title: "Midnight Oil",
    description: "Watched the kingdom through a full hour past midnight (real time).",
    hidden: true,
    check: (c) => {
      const h = new Date().getHours();
      // true between 1am and 2am local time, after at least 1h of session
      return h >= 1 && h < 2 && c.lifetimeSec >= 3600;
    },
  },
  {
    id: "hidden_marathon",
    title: "Long Live the King",
    description: "Kept the kingdom running for six hours in a single session.",
    hidden: true,
    check: (c) => c.lifetimeSec >= 6 * 3600,
  },
  {
    id: "hidden_full_dynasty",
    title: "A Dynasty Carved in Stone",
    description: "Ten monarchs have ruled. The throne is older than memory now.",
    hidden: true,
    check: (c) => c.world.succession.state.generation >= 10,
  },
  {
    id: "hidden_no_storms",
    title: "Kind Skies",
    description: "Lived through seven full days without a single storm.",
    hidden: true,
    check: (c) => c.world.state.day >= 7 && c.totalStorms === 0,
  },
  {
    id: "hidden_vault_full",
    title: "The Hoard",
    description: "Twenty-five artifacts rest in the royal vault.",
    hidden: true,
    check: (c) => c.world.treasury.count() >= 25,
  },
  {
    id: "hidden_population_50",
    title: "A Capital Rising",
    description: "Fifty souls call your kingdom home.",
    hidden: true,
    check: (c) => c.world.npcs.length >= 50,
  },
  {
    id: "hidden_century",
    title: "Of Legend",
    description: "One hundred days under the same banner.",
    hidden: true,
    check: (c) => c.world.state.day >= 100,
  },
  {
    id: "hidden_funeral_pyre",
    title: "Long Memory",
    description: "Witnessed ten souls return to the earth.",
    hidden: true,
    check: (c) => c.totalDeaths >= 10,
  },
  {
    id: "hidden_courier_legend",
    title: "Wings Untiring",
    description: "Two thousand couriers — the post is now myth.",
    hidden: true,
    check: (c) => c.totalCouriers >= 2000,
  },
  {
    id: "hidden_dynasty_5",
    title: "A Dynasty Endures",
    description: "Five consecutive natural heirs — no blood was spilled for the throne.",
    hidden: true,
    check: (c) => c.world.succession.state.dynastyStreak >= 5,
  },
  {
    id: "hidden_usurper_exile",
    title: "Cast Out",
    description: "Repelled three separate usurper challenges.",
    hidden: true,
    check: (c) => c.world.usurper.state.totalRepelled >= 3,
  },
  {
    id: "hidden_people_monarch",
    title: "From the Crowd",
    description: "A peasant took the throne — the first of their kind.",
    hidden: true,
    check: (c) =>
      c.world.succession.state.dynastyStreak === 0 &&
      c.world.uprising.state.totalUprisings >= 1,
  },
  {
    id: "hidden_year_5",
    title: "Five Years Standing",
    description: "The kingdom survived into its fifth year.",
    hidden: true,
    check: (c) => c.world.state.year >= 5,
  },
  {
    id: "hidden_year_10",
    title: "A Decade of Rule",
    description: "Ten years. The kingdom is now part of the landscape.",
    hidden: true,
    check: (c) => c.world.state.year >= 10,
  },
  {
    id: "hidden_beloved",
    title: "The Beloved Crown",
    description: "Earned a reputation score of +8 — the people call the monarch beloved.",
    hidden: true,
    check: (c) => c.world.reputation.score >= 8,
  },
  {
    id: "hidden_three_generations",
    title: "Three Generations",
    description: "A child born to the kingdom grew up, had children, and lived to see grandchildren.",
    hidden: true,
    check: (c) => {
      // Find an NPC who has parentIds AND has children who also have children
      for (const npc of c.world.npcs) {
        if (!npc.parentIds?.length) continue;
        const children = c.world.npcs.filter((n) => n.parentIds?.includes(npc.id));
        if (children.some((ch) => c.world.npcs.some((n) => n.parentIds?.includes(ch.id)))) {
          return true;
        }
      }
      return false;
    },
  },
  {
    id: "hidden_thrice_blessed",
    title: "Thrice-Blessed",
    description: "Three new buildings stand where there was nothing.",
    hidden: true,
    check: (c) =>
      c.world.map.structures.filter(
        (s) => s.kind === "watchtower" || s.kind === "mill" || s.kind === "shrine",
      ).length >= 3,
  },
];

/**
 * Tracks event counters and unlocks achievements. Counters are persisted
 * via the save system; achievements themselves are an id→ISO timestamp map.
 */
export class Achievements {
  totalCouriers = 0;
  totalForges = 0;
  totalStorms = 0;
  totalMarriages = 0;
  totalBirths = 0;
  totalDeaths = 0;

  constructor(
    private world: World,
    private journal: Journal,
    private alreadyUnlocked: Record<string, string>,
    private onUnlock: (id: string, title: string, description: string) => void,
  ) {
    this.world.bus.subscribe((ev) => {
      switch (ev.kind) {
        case "courier": this.totalCouriers++; break;
        case "forge": this.totalForges++; break;
        case "storm": this.totalStorms++; break;
      }
    });
  }

  /** Called from App on a low-cadence tick (every few seconds). */
  evaluate(lifetimeSec: number) {
    const ctx: AchievementContext = {
      world: this.world,
      totalCouriers: this.totalCouriers,
      totalForges: this.totalForges,
      totalStorms: this.totalStorms,
      totalMarriages: this.totalMarriages,
      totalBirths: this.totalBirths,
      totalDeaths: this.totalDeaths,
      lifetimeSec,
    };
    for (const def of DEFINITIONS) {
      if (this.alreadyUnlocked[def.id]) continue;
      if (def.check(ctx)) {
        this.alreadyUnlocked[def.id] = new Date().toISOString();
        this.onUnlock(def.id, def.title, def.description);
        this.journal.write(`Achievement: ${def.title} — ${def.description}`, "milestone");
      }
    }
  }

  recordMarriage() { this.totalMarriages++; }
  recordBirth() { this.totalBirths++; }
  recordDeath() { this.totalDeaths++; }

  static definitions(): AchievementDef[] { return DEFINITIONS; }
}
