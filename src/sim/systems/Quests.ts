import type { World } from "../World";
import type { Journal } from "./Journal";
import { makeEvent } from "../events/EventSchema";
import { traitFor } from "./Traits";
import { backstoryFor } from "./Backstories";

/**
 * Multi-day quest arcs. Each arc has a beginning, a middle (1-3 days), and
 * an end — all written into the Journal so the player feels a story
 * unfolding rather than a stream of isolated events.
 *
 * Arcs are intentionally low-stakes (this is a cozy app), but they thread
 * across multiple in-world days so the kingdom feels narratively rich
 * even with zero external integrations.
 *
 * Activation policy:
 *   - One active arc at a time.
 *   - New arc rolls ~every 3 in-world days with 35% chance.
 *   - Arc state persists in the save (lastRolledDay only; the journal
 *     itself carries the narrative).
 */

interface ArcDef {
  id: string;
  title: string;
  /** Phases play out on day-N relative to start. */
  phases: Array<{
    onDay: number;
    write: (ctx: ArcContext) => void;
  }>;
}

interface ArcContext {
  world: World;
  journal: Journal;
  /** Name of the traveler / antagonist / event focus. */
  flavor: string;
  /** Seeded RNG — phases that need random town pickers use this. */
  rand: () => number;
}

const FLAVOR_NAMES = [
  "Bram", "Tessa", "Old Reed", "Sister Ila", "the southern caravan",
  "a wandering bard", "the Greycloaks", "a herald from afar", "a curious priest",
];

const ARCS: ArcDef[] = [
  {
    id: "traveler",
    title: "A traveler from afar",
    phases: [
      {
        onDay: 0,
        write: ({ journal, flavor, world, rand }) => {
          journal.write(
            `${capitalize(flavor)} arrived at the gates of ${pick(world, rand)} bearing news from distant lands.`,
            "event",
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, flavor }) => {
          journal.write(
            `${capitalize(flavor)} stayed by the tavern fire, trading stories for ale.`,
            "event",
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, flavor, world }) => {
          world.bus.publish(
            makeEvent("courier", {
              source: "narrative",
              intensity: 0.4,
              payload: { from: "rivermouth", to: "highkeep", label: `${flavor} departs` },
            }),
          );
          journal.write(
            `${capitalize(flavor)} left at dawn with a fresh horse, bound for the next horizon.`,
            "event",
          );
        },
      },
    ],
  },
  {
    id: "festival_prep",
    title: "Festival preparations",
    phases: [
      {
        onDay: 0,
        write: ({ journal, flavor, world, rand }) => {
          journal.write(
            `Preparations began for a festival; ${flavor} took charge in ${pick(world, rand)}.`,
            "milestone",
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal }) => {
          journal.write(
            `Banners were hung. The blacksmiths hammered late, finishing commemorative tokens.`,
            "event",
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, world }) => {
          world.bus.publish(
            makeEvent("festival", {
              source: "narrative",
              intensity: 0.8,
              duration_ms: 45_000,
              payload: { structure: "highkeep", label: "the festival begins" },
            }),
          );
          journal.write(
            `The festival arrived! Music carried from the keep, and lanterns swayed above every street.`,
            "milestone",
          );
        },
      },
    ],
  },
  {
    id: "rival_banner",
    title: "A banner on the horizon",
    phases: [
      {
        onDay: 0,
        write: ({ journal }) => {
          journal.write(
            "A scout returned at dusk: a strange banner had been raised on the eastern hills.",
            "weather",
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal }) => {
          journal.write(
            "Three more days of silence from the east. The guards doubled their watch.",
            "weather",
          );
        },
      },
      {
        onDay: 4,
        write: ({ journal, world }) => {
          world.bus.publish(
            makeEvent("celebration", {
              source: "narrative",
              intensity: 0.7,
              payload: { structure: "highkeep", label: "the banner fell" },
            }),
          );
          journal.write(
            "Word came at dawn — the banner had been struck down, by what hand no one could say. The kingdom breathed easier.",
            "milestone",
          );
          // A pennant from the fallen rival makes it home.
          world.treasury.acquire("relic", "from the eastern banner");
        },
      },
    ],
  },
  {
    id: "wandering_cat",
    title: "The cat that would not leave",
    phases: [
      {
        onDay: 0,
        write: ({ journal, world, rand }) => {
          journal.write(
            `A grey cat with one chipped ear appeared at the gates of ${pick(world, rand)} and refused to leave.`,
            "life",
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal }) => {
          journal.write(
            "The cat caught two mice in the granary overnight. The miller fed it a strip of bacon and tried to look stern.",
            "life",
          );
        },
      },
      {
        onDay: 3,
        write: ({ journal, world }) => {
          journal.write(
            "By the third day the cat had a name (no one would say who chose it) and a place on the keep's south windowsill. The kingdom had quietly grown by one.",
            "milestone",
          );
          // A small token for the chronicle.
          world.treasury.acquire("treasure", "the cat's first whisker, kept in a tin");
        },
      },
    ],
  },
  {
    id: "river_flood",
    title: "The river ran high",
    phases: [
      {
        onDay: 0,
        write: ({ journal }) => {
          journal.write(
            "Rain in the highlands swelled the river overnight. The watch warned of flooding before noon.",
            "weather",
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, world }) => {
          // A miner shift gets called in to lift sandbags.
          world.bus.publish(
            makeEvent("mining", {
              source: "narrative",
              intensity: 0.4,
              payload: { structure: "deeprock", label: "sandbags for the dike" },
            }),
          );
          journal.write(
            "Villagers worked the dike all day. The smiths reinforced gate hinges that hadn't been touched in years.",
            "event",
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal }) => {
          journal.write(
            "The river crested in the morning and began to drop by dusk. No homes were lost. A few sheep were less fortunate.",
            "milestone",
          );
        },
      },
    ],
  },
  {
    id: "lost_child",
    title: "A child lost in the woods",
    phases: [
      {
        onDay: 0,
        write: ({ journal, world, rand }) => {
          journal.write(
            `A small commotion in ${pick(world, rand)} — a child had wandered into the wood and not come back by dark.`,
            "event",
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal }) => {
          journal.write(
            "Half the village went out at first light with lanterns and a dog. The kingdom held its breath.",
            "event",
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, world }) => {
          journal.write(
            "Found! Asleep under a fallen oak, hugging a stray fox kit. The kingdom celebrated quietly — too tired for loud joy.",
            "milestone",
          );
          if (Math.random() < 0.5) {
            world.treasury.acquire("treasure", "a small wooden fox, carved by the child later that winter");
          }
        },
      },
    ],
  },
  {
    id: "old_friend_returns",
    title: "An old friend returns",
    phases: [
      {
        onDay: 0,
        write: ({ journal, flavor }) => {
          journal.write(
            `${capitalize(flavor)}, who had ridden out years ago and not been heard from, was seen at the southern gate.`,
            "event",
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, flavor }) => {
          journal.write(
            `${capitalize(flavor)} took supper at the keep and spoke of foreign coastlines. The court listened past midnight.`,
            "event",
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, flavor, world }) => {
          journal.write(
            `${capitalize(flavor)} left at dawn with a fresh cloak and a promise to send a letter — which they probably won't.`,
            "milestone",
          );
          world.treasury.acquire("relic", `a sailor's compass left by ${flavor}`);
        },
      },
    ],
  },
  {
    id: "village_well",
    title: "The well runs dry",
    phases: [
      {
        onDay: 0,
        write: ({ journal, world, rand }) => {
          journal.write(
            `The main well in ${pick(world, rand)} ran dry overnight. The town drew water from the river all morning.`,
            "weather",
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, world }) => {
          // A miner-style event as the well-diggers go to work.
          world.bus.publish(
            makeEvent("mining", {
              source: "narrative",
              intensity: 0.3,
              payload: { structure: "deeprock", label: "well-deepening" },
            }),
          );
          journal.write(
            "Well-diggers worked the old shaft deeper. By evening it was producing again — colder, sweeter water than before.",
            "milestone",
          );
        },
      },
    ],
  },
  {
    id: "scholar_discovery",
    title: "A discovery at the scriptorium",
    phases: [
      {
        onDay: 0,
        write: ({ journal, flavor }) => {
          journal.write(
            `${capitalize(flavor)} uncovered an old map in the Scriptorium's lower vault. The scholars were quietly excited.`,
            "event",
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal }) => {
          journal.write(
            "Translation work continued through the night. The candles burned low.",
            "event",
          );
        },
      },
      {
        onDay: 3,
        write: ({ journal, world }) => {
          world.bus.publish(
            makeEvent("research", {
              source: "narrative",
              intensity: 0.6,
              payload: { structure: "scriptorium", label: "the map's secret" },
            }),
          );
          journal.write(
            "The map's secret was laid bare: a freshwater spring, undiscovered, three days' ride to the north. A small mercy in a quiet age.",
            "milestone",
          );
          // Reward — the translated scroll itself becomes a vault piece.
          world.treasury.acquire("scroll", "the translated vault map");
        },
      },
    ],
  },
];

interface ActiveArc {
  arcId: string;
  startDay: number;
  flavor: string;
  /**
   * `onDay` values of phases that have already fired for this arc.
   * Without this, `tick()` running at 10 Hz would write the same phase's
   * journal line 10×/second, spamming the chronicle in seconds.
   */
  firedPhases: number[];
}

export class Quests {
  private active: ActiveArc | null = null;
  private lastRolledDay = -1;
  /** Monotonic counter used to mint stable, collision-free decision/quest ids. */
  private idCounter = 0;

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number = Math.random,
  ) {}

  /** Mint a stable id that doesn't collide even at high sim speed. */
  private nextId(prefix: string): string {
    this.idCounter++;
    return `${prefix}_${this.world.state.day}_${this.idCounter}`;
  }

  tick() {
    const day = this.world.state.day;
    // Process the active arc's current-day phase. Critical: only fire each
    // phase ONCE per arc — `tick()` runs at 10 Hz so without this guard the
    // same line spams the journal 10 times a second.
    if (this.active) {
      const def = ARCS.find((a) => a.id === this.active!.arcId);
      const elapsed = day - this.active.startDay;
      const phase = def?.phases.find((p) => p.onDay === elapsed);
      if (phase && !this.active.firedPhases.includes(elapsed)) {
        phase.write({
          world: this.world,
          journal: this.journal,
          flavor: this.active.flavor,
          rand: this.rand,
        });
        this.active.firedPhases.push(elapsed);
      }
      const lastPhaseDay = Math.max(...(def?.phases.map((p) => p.onDay) ?? [0]));
      if (elapsed >= lastPhaseDay) {
        this.active = null;
      }
    }
    // roll new arc no more than once per day
    if (day === this.lastRolledDay) return;
    this.lastRolledDay = day;
    if (!this.active && day > 0 && this.rand() < 0.35) {
      const def = ARCS[Math.floor(this.rand() * ARCS.length)];
      const flavor = FLAVOR_NAMES[Math.floor(this.rand() * FLAVOR_NAMES.length)];
      // Start with phase 0 marked as fired since we run it right below.
      this.active = { arcId: def.id, startDay: day, flavor, firedPhases: [0] };
      const phase = def.phases.find((p) => p.onDay === 0);
      phase?.write({
        world: this.world,
        journal: this.journal,
        flavor,
        rand: this.rand,
      });
    }

    // Decision proposals — 25% chance per new day, mutually exclusive with arc starts.
    if (day > 0 && this.rand() < 0.25) {
      this.proposeRandomDecision();
    }
  }

  private proposeRandomDecision() {
    // Capture `rand` into a local so the onChoose closures below can call
    // through the seeded RNG instead of falling back to Math.random — keeps
    // decision outcomes reproducible against the world seed.
    const rand = this.rand;
    const flavor = FLAVOR_NAMES[Math.floor(rand() * FLAVOR_NAMES.length)];
    // Royal Advisor seat extends the decision window so the player has more
    // time before auto-expiry. 90s base, 180s with advisor.
    const expiresAt = Date.now() +
      (this.world.courtEffects.advisorSeated ? 180_000 : 90_000);
    const roll = rand();
    const decId = this.nextId("dec");
    // ~10 decision archetypes share the [0, 1) space.
    //   0.00 – 0.17  Petition at the gates
    //   0.17 – 0.30  Merchant's offer
    //   0.30 – 0.43  Festival proposal
    //   0.43 – 0.54  Suspicious stranger
    //   0.54 – 0.62  Tax season
    //   0.62 – 0.71  Pilgrim's request
    //   0.71 – 0.80  Boundary dispute
    //   0.80 – 0.86  Astronomer's portent
    //   0.86 – 0.93  Stray dog at the kitchens
    //   0.93 – 1.00  An anonymous gift
    if (roll < 0.17) {
      this.world.decisions.propose({
        id: decId,
        title: "A petition at the gates",
        body: `${capitalize(flavor)} stands at the gates asking for shelter. The guards await your word.`,
        expiresAt,
        defaultOnExpire: true,
        options: [
          {
            id: "decline",
            label: "Send them away",
            onChoose: (w) =>
              w.journal.write(
                `${capitalize(flavor)} was turned away from the gates. The kingdom moves on.`,
                "event",
              ),
          },
          {
            id: "welcome",
            label: "Welcome them in",
            onChoose: (w) => {
              const homes = w.map.structures.filter(
                (s) => s.kind === "town" || s.kind === "castle",
              );
              const home = homes[Math.floor(rand() * homes.length)];
              if (home) {
                const center = {
                  x: home.pos.x + Math.floor(home.size.x / 2),
                  y: home.pos.y + Math.floor(home.size.y / 2),
                };
                const npcSeed = Math.floor(rand() * 2 ** 31);
                const added = w.pushNpc({
                  id: `npc_${decId}`,
                  role: "villager",
                  name: flavor,
                  age: 22,
                  pos: { ...center },
                  prevPos: { ...center },
                  facing: "s",
                  homeId: home.id,
                  workId: home.id,
                  activity: "idle",
                  path: [],
                  activityTimer: 2,
                  seed: npcSeed,
                  trait: traitFor(npcSeed),
                });
                if (added) {
                  w.journal.write(
                    `${capitalize(flavor)} was welcomed into ${home.name} and given a small house.`,
                    "life",
                  );
                  // One-line backstory so the new villager reads as a person.
                  w.journal.write(backstoryFor(capitalize(flavor), npcSeed), "event");
                }
              }
            },
          },
        ],
      });
    } else if (roll < 0.30) {
      this.world.decisions.propose({
        id: decId,
        title: "A merchant's offer",
        body: `${capitalize(flavor)} offers a cart of fine wares for 50 gold. The treasury holds enough.`,
        expiresAt,
        defaultOnExpire: true,
        options: [
          {
            id: "decline",
            label: "Refuse politely",
            onChoose: (w) =>
              w.journal.write(
                `The crown declined ${flavor}'s offer. They left disappointed.`,
                "event",
              ),
          },
          {
            id: "accept",
            label: "Buy the cart",
            onChoose: (w) => {
              w.economy.state.gold = Math.max(0, w.economy.state.gold - 50);
              w.economy.state.ironwork = Math.min(999, w.economy.state.ironwork + 8);
              w.journal.write(
                `The crown bought ${flavor}'s cart — 50 gold spent, 8 fine ironwork stored.`,
                "event",
              );
              // 25% chance of a hidden gem in the cart.
              if (rand() < 0.25) {
                w.treasury.acquire("gem", `hidden in ${flavor}'s cart`);
              }
            },
          },
        ],
      });
    } else if (roll < 0.43) {
      this.world.decisions.propose({
        id: decId,
        title: "A festival is proposed",
        body: `Townsfolk in ${flavor === "the southern caravan" ? "Rivermouth" : "the central square"} ask for permission to hold a feast tonight.`,
        expiresAt,
        defaultOnExpire: false,
        options: [
          {
            id: "decline",
            label: "Another time",
            onChoose: (w) =>
              w.journal.write(
                `The proposed feast was postponed by royal decree.`,
                "event",
              ),
          },
          {
            id: "approve",
            label: "Let it be a feast",
            onChoose: (w) => {
              const town = w.map.structures.find((s) => s.kind === "town");
              if (town) {
                w.publish({
                  v: 1,
                  id: `q_feast_${decId}`,
                  ts: Math.floor(Date.now() / 1000),
                  kind: "festival",
                  source: "narrative",
                  intensity: 0.9,
                  duration_ms: 45_000,
                  payload: { structure: town.id, label: "royal feast" },
                });
              }
              // 35% chance the night's celebrations yield a commemorative item.
              if (rand() < 0.35) {
                w.treasury.acquire("treasure", "a token of the royal feast");
              }
            },
          },
        ],
      });
    } else if (roll < 0.54) {
      // Suspicious stranger — wear a cloak, won't give a name.
      this.world.decisions.propose({
        id: decId,
        title: "A stranger in a long cloak",
        body: `A figure who calls themselves only "${capitalize(flavor)}" asks for a private audience. The guards are uneasy.`,
        expiresAt,
        defaultOnExpire: true,
        options: [
          {
            id: "decline",
            label: "Send them away",
            onChoose: (w) =>
              w.journal.write(
                `The stranger was turned away at the gate. They left without a word.`,
                "event",
              ),
          },
          {
            id: "audience",
            label: "Grant audience",
            onChoose: (w) => {
              // 50/50: friendly information vs. costly distraction
              if (rand() < 0.5) {
                w.treasury.acquire("scroll", `a warning from ${flavor}`);
                w.journal.write(
                  `${capitalize(flavor)} left a sealed scroll on the throne and vanished into the night.`,
                  "milestone",
                );
              } else {
                w.economy.state.gold = Math.max(0, w.economy.state.gold - 30);
                w.journal.write(
                  `${capitalize(flavor)} pocketed 30 gold "for the road" and was never seen again.`,
                  "event",
                );
              }
            },
          },
        ],
      });
    } else if (roll < 0.62) {
      // Tax season — modest civic decision.
      this.world.decisions.propose({
        id: decId,
        title: "The treasury proposes a levy",
        body: `The accountants suggest a modest tax — 20 gold from the people now, more goodwill spent than coin.`,
        expiresAt,
        defaultOnExpire: false,
        options: [
          {
            id: "decline",
            label: "Skip this season",
            onChoose: (w) =>
              w.journal.write(
                `The crown waived the season's levy. The towns breathed easier.`,
                "event",
              ),
          },
          {
            id: "tax",
            label: "Collect the levy",
            onChoose: (w) => {
              w.economy.state.gold = Math.min(99999, w.economy.state.gold + 40);
              w.journal.write(
                `The crown's accountants gathered 40 gold from the towns. Grumbling, but compliant.`,
                "event",
              );
            },
          },
        ],
      });
    } else if (roll < 0.71) {
      // Pilgrim's request — short quest tied to the shrine.
      this.world.decisions.propose({
        id: decId,
        title: "A pilgrim's request",
        body: `${capitalize(flavor)}, dust on their boots, asks the crown to bless their journey north.`,
        expiresAt,
        defaultOnExpire: false,
        options: [
          {
            id: "decline",
            label: "Wish them well, no escort",
            onChoose: (w) =>
              w.journal.write(
                `${capitalize(flavor)} bowed and continued north alone.`,
                "event",
              ),
          },
          {
            id: "escort",
            label: "Send a guard with them",
            onChoose: (w) => {
              w.journal.write(
                `A guard rode with ${flavor} as far as the foothills. The pilgrim left a token of thanks.`,
                "event",
              );
              if (rand() < 0.55) {
                w.treasury.acquire("relic", `a pilgrim's token from ${flavor}`);
              }
            },
          },
        ],
      });
    } else if (roll < 0.80) {
      // Boundary dispute — two villagers, one quarrel.
      const other = FLAVOR_NAMES[Math.floor(rand() * FLAVOR_NAMES.length)];
      this.world.decisions.propose({
        id: decId,
        title: "A boundary dispute",
        body: `Two villagers, ${flavor} and ${other}, argue over the line between their fields. They ask for a ruling.`,
        expiresAt,
        defaultOnExpire: true,
        options: [
          {
            id: "favor_a",
            label: `Side with ${capitalize(flavor)}`,
            onChoose: (w) =>
              w.journal.write(
                `The crown ruled in ${flavor}'s favor. ${capitalize(other)} accepted the decision in silence.`,
                "event",
              ),
          },
          {
            id: "favor_b",
            label: `Side with ${capitalize(other)}`,
            onChoose: (w) =>
              w.journal.write(
                `The crown ruled in ${other}'s favor. ${capitalize(flavor)} muttered all the way home.`,
                "event",
              ),
          },
          {
            id: "split",
            label: "Split the difference",
            onChoose: (w) =>
              w.journal.write(
                `The crown drew a new line midway. Both villagers grumbled, but both kept land.`,
                "event",
              ),
          },
        ],
      });
    } else if (roll < 0.86) {
      // Astronomer's portent — flavor-only decision with no mechanical effect.
      this.world.decisions.propose({
        id: decId,
        title: "A portent in the sky",
        body: `${capitalize(flavor)}, the court astronomer, reports a strange light low on the horizon. They ask what to record.`,
        expiresAt,
        defaultOnExpire: false,
        options: [
          {
            id: "good_omen",
            label: "Call it a good omen",
            onChoose: (w) =>
              w.journal.write(
                `The court recorded the light as a blessing. Mothers wove ribbons for their newborns.`,
                "milestone",
              ),
          },
          {
            id: "ill_omen",
            label: "Call it an ill omen",
            onChoose: (w) =>
              w.journal.write(
                `The court recorded the light as a warning. The guards doubled their watch and the priest fasted three days.`,
                "weather",
              ),
          },
          {
            id: "no_comment",
            label: "Record nothing",
            onChoose: (w) =>
              w.journal.write(
                `The crown told ${flavor} to keep their notes private until the lights were better understood.`,
                "event",
              ),
          },
        ],
      });
    } else if (roll < 0.93) {
      // A stray dog — quiet, cozy decision. No mechanical cost, small reward
      // for the welcoming choice.
      this.world.decisions.propose({
        id: decId,
        title: "A stray at the kitchens",
        body: `A thin dog has been hanging around the kitchens for three days. The cooks have started leaving scraps.`,
        expiresAt,
        defaultOnExpire: false,
        options: [
          {
            id: "shoo",
            label: "Shoo it away",
            onChoose: (w) =>
              w.journal.write(
                `The cooks chased the stray off with a broom. It limped back the next morning. They shooed it again, more gently.`,
                "event",
              ),
          },
          {
            id: "adopt",
            label: "Let it stay",
            onChoose: (w) => {
              w.journal.write(
                `The cooks declared the stray was now "kitchen staff." Its name was decided by committee within an hour.`,
                "life",
              );
              if (rand() < 0.4) {
                w.treasury.acquire("treasure", "the kitchen dog's first collar, woven by a kitchen girl");
              }
            },
          },
        ],
      });
    } else {
      // An anonymous gift — small treasury gain or a strange artifact.
      this.world.decisions.propose({
        id: decId,
        title: "An anonymous gift",
        body: `A wrapped parcel was found at the keep's door this morning. No note, no name. The guards are uncertain.`,
        expiresAt,
        defaultOnExpire: true,
        options: [
          {
            id: "open",
            label: "Open it",
            onChoose: (w) => {
              // 60/40: a useful gift vs. a strange one
              if (rand() < 0.6) {
                w.economy.state.gold = Math.min(99999, w.economy.state.gold + 25);
                w.journal.write(
                  `The parcel held 25 gold coins, a small note in an unfamiliar hand reading only "from a friend."`,
                  "milestone",
                );
              } else {
                w.treasury.acquire("relic", "an unmarked gift, opened in the throne room");
                w.journal.write(
                  `The parcel held a small bronze figurine of a creature no one in the kingdom could name. It rests in the vault now.`,
                  "milestone",
                );
              }
            },
          },
          {
            id: "burn",
            label: "Burn it unopened",
            onChoose: (w) =>
              w.journal.write(
                `The parcel was burned in the courtyard. The smoke smelled briefly of cedar, then of nothing.`,
                "event",
              ),
          },
        ],
      });
    }
  }
}

function pick(world: World, rand: () => number = Math.random): string {
  const towns = world.map.structures.filter((s) => s.kind === "town");
  if (!towns.length) return "the keep";
  const t = towns[Math.floor(rand() * towns.length)];
  return t.name;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
