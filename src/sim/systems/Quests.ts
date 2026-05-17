import type { World } from "../World";
import type { Journal } from "./Journal";
import { makeEvent } from "../events/EventSchema";
import { traitFor } from "./Traits";
import { backstoryFor } from "./Backstories";
import { readArchive } from "../KingdomArchive";

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
  /**
   * Optional guard: if present and returns false, the picker skips this arc
   * and re-rolls. Used by arcs that depend on world state the kingdom may
   * not have yet (e.g. The Returning Bloodline needs at least one past
   * kingdom in the archive).
   */
  guard?: (world: World) => boolean;
  /**
   * Optional flavor picker. Defaults to a uniform pick from FLAVOR_NAMES.
   * Arcs that need richer per-arc state (e.g. a specific past kingdom)
   * encode that state into the returned string and unpack it in phases.
   */
  pickFlavor?: (world: World, rand: () => number) => string;
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
          const town = pickTown(world, rand);
          journal.write(
            `${capitalize(flavor)} arrived at the gates of ${town.name} bearing news from distant lands.`,
            "event",
            town.id,
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
          const town = pickTown(world, rand);
          journal.write(
            `Preparations began for a festival; ${flavor} took charge in ${town.name}.`,
            "milestone",
            town.id,
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, world }) => {
          const forge = world.map.structures.find((s) => s.kind === "forge");
          journal.write(
            `Banners were hung. The blacksmiths hammered late, finishing commemorative tokens.`,
            "event",
            forge?.id,
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          world.bus.publish(
            makeEvent("festival", {
              source: "narrative",
              intensity: 0.8,
              duration_ms: 45_000,
              payload: { structure: castle?.id ?? "highkeep", label: "the festival begins" },
            }),
          );
          journal.write(
            `The festival arrived! Music carried from the keep, and lanterns swayed above every street.`,
            "milestone",
            castle?.id,
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
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            "A scout returned at dusk: a strange banner had been raised on the eastern hills.",
            "weather",
            castle?.id,
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            "Three more days of silence from the east. The guards doubled their watch.",
            "weather",
            castle?.id,
          );
        },
      },
      {
        onDay: 4,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          world.bus.publish(
            makeEvent("celebration", {
              source: "narrative",
              intensity: 0.7,
              payload: { structure: castle?.id ?? "highkeep", label: "the banner fell" },
            }),
          );
          journal.write(
            "Word came at dawn — the banner had been struck down, by what hand no one could say. The kingdom breathed easier.",
            "milestone",
            castle?.id,
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
          const town = pickTown(world, rand);
          journal.write(
            `A grey cat with one chipped ear appeared at the gates of ${town.name} and refused to leave.`,
            "life",
            town.id,
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
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            "By the third day the cat had a name (no one would say who chose it) and a place on the keep's south windowsill. The kingdom had quietly grown by one.",
            "milestone",
            castle?.id,
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
          const town = pickTown(world, rand);
          journal.write(
            `A small commotion in ${town.name} — a child had wandered into the wood and not come back by dark.`,
            "event",
            town.id,
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
        write: ({ journal, flavor, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            `${capitalize(flavor)}, who had ridden out years ago and not been heard from, was seen at the southern gate.`,
            "event",
            castle?.id,
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, flavor, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            `${capitalize(flavor)} took supper at the keep and spoke of foreign coastlines. The court listened past midnight.`,
            "event",
            castle?.id,
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, flavor, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            `${capitalize(flavor)} left at dawn with a fresh cloak and a promise to send a letter — which they probably won't.`,
            "milestone",
            castle?.id,
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
          const town = pickTown(world, rand);
          journal.write(
            `The main well in ${town.name} ran dry overnight. The town drew water from the river all morning.`,
            "weather",
            town.id,
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, world }) => {
          const mine = world.map.structures.find((s) => s.kind === "mine");
          // A miner-style event as the well-diggers go to work.
          world.bus.publish(
            makeEvent("mining", {
              source: "narrative",
              intensity: 0.3,
              payload: { structure: mine?.id ?? "deeprock", label: "well-deepening" },
            }),
          );
          journal.write(
            "Well-diggers worked the old shaft deeper. By evening it was producing again — colder, sweeter water than before.",
            "milestone",
            mine?.id,
          );
        },
      },
    ],
  },
  {
    id: "fence_dispute",
    title: "The fence dispute",
    phases: [
      {
        onDay: 0,
        write: ({ journal, world, rand }) => {
          const town = pickTown(world, rand);
          journal.write(
            `Two neighbors in ${town.name} began a serious argument about where the fence between their gardens should run. Each cited the same dead grandfather as authority.`,
            "event",
            town.id,
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, world, rand }) => {
          const town = pickTown(world, rand);
          journal.write(
            `A village elder visited both houses in ${town.name} in turn, carrying a loaf of warm bread. They listened, said little, and left the bread on each kitchen table.`,
            "event",
            town.id,
          );
        },
      },
      {
        onDay: 4,
        write: ({ journal, world, rand }) => {
          const town = pickTown(world, rand);
          journal.write(
            `The fence in ${town.name} was redrawn straight down the middle by mutual consent. Both neighbors planted herbs along it the next morning, and now share rosemary.`,
            "milestone",
            town.id,
          );
        },
      },
    ],
  },
  {
    id: "letter_from_afar",
    title: "A letter from afar",
    phases: [
      {
        onDay: 0,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          world.bus.publish(
            makeEvent("courier", {
              source: "narrative",
              intensity: 0.45,
              payload: {
                from: "rivermouth",
                to: castle?.id ?? "highkeep",
                label: "a sealed letter",
              },
            }),
          );
          journal.write(
            "A courier arrived at the keep carrying a heavy letter with three seals — none of them familiar to the chamberlain.",
            "event",
            castle?.id,
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            "The court read the letter at noon. It described a fire in a city no one in the room could place on a map.",
            "event",
            castle?.id,
          );
        },
      },
      {
        onDay: 3,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            "A reply was sealed and sent by the same courier, who refused payment and asked only for road bread and water.",
            "milestone",
            castle?.id,
          );
        },
      },
    ],
  },
  {
    id: "tournament",
    title: "The Tournament",
    // Five days, pinned to the castle. Heralds → champions chosen →
    // practice → tournament day → celebration + a relic for the vault.
    // Champion + winner picked deterministically from the seeded RNG so the
    // arc round-trips through save/replay.
    phases: [
      {
        onDay: 0,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            "Heralds proclaimed a tournament. Every town will send a champion to the keep within the week.",
            "milestone",
            castle?.id,
          );
          if (castle) {
            world.bus.publish(
              makeEvent("festival", {
                source: "narrative",
                intensity: 0.45,
                duration_ms: 20_000,
                payload: { structure: castle.id, label: "tournament proclaimed" },
              }),
            );
          }
        },
      },
      {
        onDay: 1,
        write: ({ journal, world, rand }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          const champion = pickChampion(world, rand);
          journal.write(
            `Champions were named at the keep. ${champion} was chosen to ride first into the lists.`,
            "event",
            castle?.id,
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, world }) => {
          const forge = world.map.structures.find((s) => s.kind === "forge");
          journal.write(
            "The forge ran late into the evening; helms were polished, lances re-tipped, every shield re-painted in its town's colors.",
            "event",
            forge?.id,
          );
          if (forge) {
            world.bus.publish(
              makeEvent("forge", {
                source: "narrative",
                intensity: 0.6,
                payload: { structure: forge.id, label: "tournament arms" },
              }),
            );
          }
        },
      },
      {
        onDay: 3,
        write: ({ journal, world, rand }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          const winner = pickChampion(world, rand);
          journal.write(
            `The lists opened at noon and closed at dusk. After a dozen passes, ${winner} unhorsed every challenger and was named champion.`,
            "milestone",
            castle?.id,
          );
          if (castle) {
            world.bus.publish(
              makeEvent("festival", {
                source: "narrative",
                intensity: 0.85,
                duration_ms: 40_000,
                payload: { structure: castle.id, label: "the tournament" },
              }),
            );
          }
        },
      },
      {
        onDay: 4,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            "The champion's cup was placed in the vault — a small thing of beaten silver, but the kingdom's first.",
            "milestone",
            castle?.id,
          );
          world.treasury.acquire("relic", "the champion's cup");
        },
      },
    ],
  },
  {
    id: "wandering_bard",
    title: "The Wandering Bard",
    // 4-phase music-and-court arc over 5 days. The bard's name + song
    // title are packed into the flavor string at arc-start so every phase
    // narrates the same story. The final phase drops a "ballad" scroll
    // into the vault — a permanent record of the song that was left
    // behind, distinct from one-off festival events.
    pickFlavor: (_world, rand) => {
      const bards = [
        "Lenore of Three Roads", "Old Wynn", "Mira Quickfinger",
        "Bestal the Long-Walker", "Calla of the Sea-Glass Inn",
        "Roen Twice-Lost", "Sister Pipe", "the Marsh-Singer",
        "Ulin of the Mountain Pass", "Phael",
        "the Boy with the Cracked Lute", "Ysolde Greycloak",
      ];
      const songs = [
        "The Crow and the Coin", "Long Was the Road from Eastmarch",
        "What the Miller Saw", "Three Lamps at the Inn",
        "The Princess Who Stayed", "A Cup of Cold River-Water",
        "Bones Beneath the Apple Tree", "The Last Ship Out of Coldspring",
        "Wine in the Hayloft", "A Song for Late Winter",
        "The Smith's Daughter Says No", "The Wedding at the Mill",
        "Old Roads", "What the Bell Heard", "The Fox and the Glove",
        "Whoever Stole My Hat",
      ];
      const bard = bards[Math.floor(rand() * bards.length)];
      const song = songs[Math.floor(rand() * songs.length)];
      return `${bard}||${song}`;
    },
    phases: [
      {
        onDay: 0,
        write: ({ journal, world, flavor, rand }) => {
          const [bard] = flavor.split("||");
          const town = pickTown(world, rand);
          journal.write(
            `${bard} arrived at the gates of ${town.name} with a road-worn cloak and a lute slung crossways. They asked only for a quiet room and a window.`,
            "event",
            town.id,
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, world, flavor, rand }) => {
          const [bard] = flavor.split("||");
          const town = pickTown(world, rand);
          journal.write(
            `${bard} practiced in the tavern at ${town.name} all afternoon. The kitchen staff stopped chopping more than once.`,
            "event",
            town.id,
          );
        },
      },
      {
        onDay: 3,
        write: ({ journal, world, flavor }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          const [bard, song] = flavor.split("||");
          if (castle) {
            world.bus.publish(
              makeEvent("festival", {
                source: "narrative",
                intensity: 0.7,
                duration_ms: 35_000,
                payload: { structure: castle.id, label: `${bard} performs` },
              }),
            );
          }
          journal.write(
            `${bard} performed "${song}" for the court tonight. The keep was silent for a full half-minute after the last verse.`,
            "milestone",
            castle?.id,
          );
        },
      },
      {
        onDay: 4,
        write: ({ journal, world, flavor }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          const [bard, song] = flavor.split("||");
          journal.write(
            `${bard} left at dawn with a fresh loaf and the same lute, refusing payment. They left behind a copy of "${song}" — written on the back of a wine list, in a hand that nobody at court could later forget.`,
            "milestone",
            castle?.id,
          );
          world.treasury.acquire("scroll", `the ballad "${song}"`);
        },
      },
    ],
  },
  {
    id: "long_drought",
    title: "The Long Drought",
    // 4-phase weather/economy saga over 6 days. Pinned mostly to the castle
    // (the crown's response is the focal point), with a stop at the mill.
    // The crown spends 30 gold on grain stores in phase 2 — a real-but-mild
    // mechanical cost that makes the saga feel like more than flavor text.
    phases: [
      {
        onDay: 0,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            "The rains did not come this week. The shepherds watched the sky from the high pastures with a quiet they didn't want to name.",
            "weather",
            castle?.id,
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, world }) => {
          const mill = world.map.structures.find((s) => s.kind === "mill");
          journal.write(
            "Streams along the eastern road slackened to a thread. The miller halved her shifts and apologized to the bakers.",
            "weather",
            mill?.id,
          );
        },
      },
      {
        onDay: 3,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          const cost = 30;
          const spent = Math.min(cost, world.economy.state.gold);
          world.economy.state.gold = Math.max(0, world.economy.state.gold - cost);
          journal.write(
            `The crown released grain stores from the keep cellars. The treasury was lighter by ${spent} gold; no household went without bread.`,
            "milestone",
            castle?.id,
          );
        },
      },
      {
        onDay: 5,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          if (castle) {
            world.bus.publish(
              makeEvent("festival", {
                source: "narrative",
                intensity: 0.55,
                duration_ms: 25_000,
                payload: { structure: castle.id, label: "the rains return" },
              }),
            );
          }
          journal.write(
            "Rain came in the night, and was still falling at dawn. Children stood barefoot in the streets. The drought had broken.",
            "milestone",
            castle?.id,
          );
        },
      },
    ],
  },
  {
    id: "returning_bloodline",
    title: "The Returning Bloodline",
    // Closes the loop on the Past Kingdoms Vault: when an archived kingdom
    // exists, a descendant of its last monarch occasionally arrives at
    // the gates of the current kingdom. Three phases over four days.
    //   Day 0  A stranger arrives bearing a battered old seal.
    //   Day 2  They settle in; a new villager is added to the roster
    //          whose name carries the past monarch's last word as
    //          surname (so the bloodline is visibly in the journal).
    //   Day 3  The kingdom recognizes them; small milestone entry.
    guard: () => readArchive().length > 0,
    pickFlavor: (_world, rand) => {
      // Pack `<kingdomName>||<monarchName>` so every phase reads the same
      // archived kingdom (rand state would diverge between phases).
      const archive = readArchive();
      const picked = archive[Math.floor(rand() * archive.length)];
      return `${picked.kingdomName}||${picked.monarchName}`;
    },
    phases: [
      {
        onDay: 0,
        write: ({ journal, world, flavor }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          const [kingdomName, monarchName] = flavor.split("||");
          journal.write(
            `A stranger arrived at the gates carrying a battered seal of the old kingdom of ${kingdomName}. They name themselves of the line of ${monarchName}.`,
            "event",
            castle?.id,
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, world, flavor, rand }) => {
          const [, monarchName] = flavor.split("||");
          // Surname = last whitespace-separated word of the past monarch's
          // name, stripped of leading title ("King Elden" → "Elden").
          const surname =
            monarchName?.split(/\s+/).filter(Boolean).slice(-1)[0] || "of-the-line";
          // Pick a first name that ISN'T already in the kingdom (so the new
          // arrival reads as a distinct person).
          const taken = new Set(world.npcs.map((n) => n.name ?? "").map((s) => s.split(" ")[0]));
          const FIRSTS = [
            "Maren", "Theo", "Sable", "Wynn", "Iona", "Calla", "Roe", "Bek",
          ];
          const available = FIRSTS.filter((f) => !taken.has(f));
          const first = available.length
            ? available[Math.floor(rand() * available.length)]
            : "Maren";
          const fullName = `${first} ${surname}`;
          // Spawn the NPC. The first town is the destination; if there
          // isn't one, fall back to the castle.
          const home =
            world.map.structures.find((s) => s.kind === "town") ??
            world.map.structures.find((s) => s.kind === "castle");
          if (!home) return; // bizarre map; bail gracefully
          const seed = Math.floor(rand() * 2 ** 31);
          const pos = {
            x: home.pos.x + Math.floor(home.size.x / 2),
            y: home.pos.y + Math.floor(home.size.y / 2),
          };
          world.pushNpc({
            id: `npc_bl_${world.state.day}_${seed}`,
            role: "villager",
            name: fullName,
            age: 24,
            pos: { ...pos },
            prevPos: { ...pos },
            facing: "s",
            homeId: home.id,
            workId: home.id,
            activity: "idle",
            path: [],
            activityTimer: 4,
            seed,
            trait: traitFor(seed),
          });
          journal.write(
            `${fullName} took a room near the keep; a backstory the elders are still piecing together. ${backstoryFor(fullName, seed)}`,
            "life",
            home.id,
          );
        },
      },
      {
        onDay: 3,
        write: ({ journal, world, flavor }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          const [kingdomName] = flavor.split("||");
          journal.write(
            `The chronicler set a small mark in the margin: a thread of the old kingdom of ${kingdomName}, now living among us again.`,
            "milestone",
            castle?.id,
          );
        },
      },
    ],
  },
  // ── Late-game political arcs (year-gated) ───────────────────────────────
  {
    id: "succession_crisis",
    title: "The succession crisis",
    // Year >= 3: a noble presents a "rival heir" claim. Plays out over 4 days
    // as the court investigates, then resolves via the journal. The narrative
    // never actually changes the monarch — that's the Usurper system's job —
    // but it seeds tension and can drop a relic (the disputed charter).
    guard: (world) => world.state.year >= 3,
    pickFlavor: (world, rand) => {
      // Pick a living noble-type NPC for the rival claimant role.
      const candidates = world.npcs.filter(
        (n) => n.role !== "monarch" && (n.age ?? 30) >= 18,
      );
      if (candidates.length) {
        const c = candidates[Math.floor(rand() * candidates.length)];
        return c.name ?? "a rival claimant";
      }
      return "a rival claimant";
    },
    phases: [
      {
        onDay: 0,
        write: ({ journal, world, flavor }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            `A document appeared — sealed in three places — claiming that ${flavor} carries the blood of an older royal line than the current throne. The chamberlain locked it in the lower vault and told no one. By noon, everyone knew.`,
            "milestone",
            castle?.id,
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, world }) => {
          const lib = world.map.structures.find((s) => s.kind === "library");
          journal.write(
            "The scholars worked through the night comparing genealogies. The candles in the Scriptorium burned until dawn.",
            "event",
            lib?.id,
          );
          if (lib) {
            world.bus.publish(
              makeEvent("research", {
                source: "narrative",
                intensity: 0.5,
                payload: { structure: lib.id, label: "the disputed succession" },
              }),
            );
          }
        },
      },
      {
        onDay: 2,
        write: ({ journal, world, flavor }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            `The scholars presented their findings: the claim has merit — older merit than anyone comfortable with the current arrangement would prefer. ${flavor} has not left the capital.`,
            "event",
            castle?.id,
          );
        },
      },
      {
        onDay: 3,
        write: ({ journal, world, flavor }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          // Resolution: the claim is quietly absorbed.
          journal.write(
            `By the fourth day, ${flavor} accepted a formal title and a comfortable house — not the throne, but not nothing. The disputed charter was sealed in the vault. The court agreed, without quite saying so, to never open it again.`,
            "milestone",
            castle?.id,
          );
          world.treasury.acquire("scroll", "the disputed succession charter");
        },
      },
    ],
  },
  {
    id: "court_conspiracy",
    title: "A conspiracy in the court",
    guard: (world) => world.state.year >= 3,
    phases: [
      {
        onDay: 0,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            "The castle's night steward found a coded message tucked behind a tapestry. It was addressed to no one in the castle, but three members of court have the same unusual ink on their fingers.",
            "event",
            castle?.id,
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, world }) => {
          const lib = world.map.structures.find((s) => s.kind === "library");
          journal.write(
            "The scholars decoded half the message. What they found was not treason, exactly — but it described a plan to quietly redirect tax revenue for three seasons. The other half of the message was missing.",
            "event",
            lib?.id,
          );
          if (lib) {
            world.bus.publish(
              makeEvent("research", {
                source: "narrative",
                intensity: 0.4,
                payload: { structure: lib.id, label: "decoding the conspiracy" },
              }),
            );
          }
        },
      },
      {
        onDay: 3,
        write: ({ journal, world, rand }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          // 50/50: the conspiracy unravels with a reward, or is quietly buried.
          if (rand() < 0.5) {
            journal.write(
              "The conspirators were identified and quietly removed from their posts. They did not resist. One of them left behind a small iron chest with a note that read: 'We were not wrong about the problem. Only about the method.'",
              "milestone",
              castle?.id,
            );
            world.treasury.acquire("gem", "from the conspirators' iron chest");
          } else {
            journal.write(
              "The investigation stalled. The three ink-fingered courtiers resigned within the week for unrelated reasons. The kingdom filed the matter under 'unresolved' and moved on, which is what the conspirators had probably planned all along.",
              "milestone",
              castle?.id,
            );
          }
        },
      },
    ],
  },
  {
    id: "foreign_tribute",
    title: "The foreign envoy",
    guard: (world) => world.state.year >= 2,
    phases: [
      {
        onDay: 0,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          world.bus.publish(
            makeEvent("courier", {
              source: "narrative",
              intensity: 0.6,
              payload: { from: "rivermouth", to: castle?.id ?? "highkeep", label: "foreign delegation" },
            }),
          );
          journal.write(
            "A delegation arrived from across the eastern passes — richly dressed, cautiously worded. They bring gifts and a message whose weight is felt more than read.",
            "event",
            castle?.id,
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            "The envoy's true purpose emerged over supper: their sovereign claims a portion of the mountain passes and asks the crown to acknowledge it — in writing, with a seal.",
            "event",
            castle?.id,
          );
        },
      },
      {
        onDay: 3,
        write: ({ journal, world, rand }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          const choice = rand();
          if (choice < 0.4) {
            // Kingdom pays tribute — gets diplomatic peace + relic.
            const tribute = 30;
            world.economy.state.gold = Math.max(0, world.economy.state.gold - tribute);
            journal.write(
              `The crown signed a letter of partial acknowledgment — not quite a concession, not quite not one. ${tribute} gold changed hands, and the delegation rode home satisfied. A sealed treaty now rests in the vault.`,
              "milestone",
              castle?.id,
            );
            world.treasury.acquire("scroll", "the eastern passage treaty");
          } else if (choice < 0.75) {
            // Kingdom refuses — envoy leaves, nothing happens yet.
            journal.write(
              "The crown declined to sign anything. The envoy was given a formal farewell and three days' provisions for the road. They bowed without warmth and left. The matter has not been resolved — only deferred.",
              "event",
              castle?.id,
            );
          } else {
            // Kingdom counter-offers — earns gold + scroll.
            world.economy.state.gold = Math.min(99999, world.economy.state.gold + 25);
            journal.write(
              "The crown proposed a counter-treaty: the passes in exchange for guaranteed trade access. After two days of revision, the envoy agreed. The kingdom's negotiators were quietly pleased with themselves.",
              "milestone",
              castle?.id,
            );
            world.treasury.acquire("scroll", "the mountain trade compact");
          }
        },
      },
    ],
  },
  {
    id: "reform_movement",
    title: "The reform movement",
    guard: (world) => world.state.year >= 2,
    phases: [
      {
        onDay: 0,
        write: ({ journal, world, rand }) => {
          const town = pickTown(world, rand);
          journal.write(
            `A pamphlet appeared in ${town.name} — short, clear, and evidently well-read given the number of copies circulating. It proposed three changes to how the crown manages the grain stores.`,
            "event",
            town.id,
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, world, rand }) => {
          const town = pickTown(world, rand);
          journal.write(
            `The pamphlet's author was found: a retired miller in ${town.name} who had been keeping careful accounts for a decade. She presented her records to the town council without fanfare and then went home.`,
            "event",
            town.id,
          );
        },
      },
      {
        onDay: 4,
        write: ({ journal, world, rand }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          if (rand() < 0.6) {
            // Reform adopted — small gold cost, goodwill gain.
            const cost = 20;
            world.economy.state.gold = Math.max(0, world.economy.state.gold - cost);
            journal.write(
              `The crown adopted two of the three proposed reforms. The miller was invited to advise on implementation. She declined a title but accepted a small stipend. ${cost} gold from the treasury — and something harder to count.`,
              "milestone",
              castle?.id,
            );
            world.treasury.acquire("scroll", "the grain reform charter");
          } else {
            journal.write(
              "The crown thanked the miller and filed her records for future consideration. The pamphlet stopped circulating. The kingdom continued to manage the grain stores the old way, though the accountants now argued about it more.",
              "event",
              castle?.id,
            );
          }
        },
      },
    ],
  },
  // ── Generational + ecological arcs ──────────────────────────────────────
  {
    id: "plague_scare",
    title: "The fever in the south quarter",
    guard: (world) => world.state.year >= 2,
    phases: [
      {
        onDay: 0,
        write: ({ journal, world, rand }) => {
          const town = pickTown(world, rand);
          journal.write(
            `Fever came to ${town.name} overnight — a handful of households, children and elders alike, kept inside by morning. The healer is already at work.`,
            "weather",
            town.id,
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, world, rand }) => {
          const town = pickTown(world, rand);
          journal.write(
            `The fever moved to a second street in ${town.name}. The healer is sleeping in intervals. People are leaving food on doorsteps without knocking.`,
            "event",
            town.id,
          );
        },
      },
      {
        onDay: 4,
        write: ({ journal, world, rand }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          const expiresAt = Date.now() +
            (world.courtEffects.advisorSeated ? 180_000 : 90_000);
          const decId = `plague_${world.state.day}`;
          journal.write(
            `The crown must decide: quarantine the affected streets — costly but clean — or let the illness run its own course.`,
            "milestone",
            castle?.id,
          );
          world.decisions.propose({
            id: decId,
            title: "The fever is spreading",
            body: "Quarantine costs gold but ends the scare quickly. Letting it pass is cheaper — but not without risk.",
            expiresAt,
            defaultOnExpire: true,
            options: [
              {
                id: "quarantine",
                label: "Quarantine the streets",
                onChoose: (w) => {
                  const cost = 25;
                  w.economy.state.gold = Math.max(0, w.economy.state.gold - cost);
                  w.reputation.adjust(1);
                  w.journal.write(
                    `The crown sealed the affected streets and sent food through the gaps under the doors. It cost ${cost} gold and two weeks of tension, but no one else fell ill. The healer slept properly for the first time in days.`,
                    "milestone",
                    castle?.id,
                  );
                },
              },
              {
                id: "let_pass",
                label: "Let it run its course",
                onChoose: (w) => {
                  w.reputation.adjust(-1);
                  if (rand() < 0.4) {
                    // One elderly NPC dies from it
                    const elderly = w.npcs.filter((n) => (n.age ?? 0) > 50 && n.role !== "monarch");
                    if (elderly.length) {
                      const victim = elderly[Math.floor(rand() * elderly.length)];
                      const idx = w.npcs.indexOf(victim);
                      if (idx >= 0) w.npcs.splice(idx, 1);
                      w.journal.write(
                        `The fever passed on its own — but not before it took ${victim.name ?? "an elder"}. The town buried them quietly and did not say what they were thinking about the crown's silence.`,
                        "life",
                        victim.homeId,
                      );
                    } else {
                      w.journal.write(
                        `The fever passed on its own, but the town is quieter than it was. Some things are not forgotten quickly.`,
                        "event",
                      );
                    }
                  } else {
                    w.journal.write(
                      `The fever broke on its own after a tense week. No one died. The crown called it a natural recovery. The town called it luck.`,
                      "event",
                    );
                  }
                },
              },
            ],
          });
        },
      },
    ],
  },
  {
    id: "trade_caravan",
    title: "The merchant consortium arrives",
    phases: [
      {
        onDay: 0,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          world.bus.publish(
            makeEvent("courier", {
              source: "narrative",
              intensity: 0.5,
              payload: { from: "rivermouth", to: castle?.id ?? "highkeep", label: "trade delegation" },
            }),
          );
          journal.write(
            "Three wagons arrived at the gate bearing the colors of a merchant consortium from the south. They want to establish a regular trade route — and they want the crown's blessing first.",
            "event",
            castle?.id,
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          const expiresAt = Date.now() +
            (world.courtEffects.advisorSeated ? 180_000 : 90_000);
          const decId = `trade_${world.state.day}`;
          world.decisions.propose({
            id: decId,
            title: "The trade route proposal",
            body: "The consortium offers regular commerce in exchange for 40 gold to establish the route. The payback is steady over several seasons.",
            expiresAt,
            defaultOnExpire: true,
            options: [
              {
                id: "accept",
                label: "Fund the route (40 gold)",
                onChoose: (w) => {
                  w.economy.state.gold = Math.max(0, w.economy.state.gold - 40);
                  w.reputation.adjust(1);
                  // Pay back 60 gold over next 3 seasons via economy boost
                  w.economy.state.gold += 20; // immediate first shipment
                  w.journal.write(
                    `The crown funded the southern trade route. The first wagons returned within the season carrying 20 gold and a manifest of goods. The consortium's factor left a copy of the route map for the vault.`,
                    "milestone",
                    castle?.id,
                  );
                  w.treasury.acquire("scroll", `the southern trade compact of year ${w.state.year}`);
                },
              },
              {
                id: "decline",
                label: "Decline the offer",
                onChoose: (w) => {
                  w.journal.write(
                    `The consortium was thanked and sent on their way. They accepted the refusal with professional warmth and the unspoken implication that they would find another gate.`,
                    "event",
                    castle?.id,
                  );
                },
              },
            ],
          });
        },
      },
      {
        onDay: 3,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            "A rider from the consortium confirmed the route is running. The road south is a little busier and a little safer than it was last season.",
            "event",
            castle?.id,
          );
          world.economy.state.gold += 10; // second trickle payment
        },
      },
    ],
  },
  {
    id: "legendary_beast",
    title: "The thing in the eastern wood",
    guard: (world) => world.state.year >= 3,
    phases: [
      {
        onDay: 0,
        write: ({ journal, world, rand }) => {
          const town = pickTown(world, rand);
          journal.write(
            `A trapper returned from the eastern wood white-faced and short on words. Something large — larger than anything in the kingdom's records — left tracks in the mud and then vanished. The children are already naming it.`,
            "weather",
            town.id,
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, world }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          world.bus.publish(
            makeEvent("monster", {
              source: "narrative",
              intensity: 0.7,
              duration_ms: 30_000,
              payload: { structure: castle?.id ?? "highkeep", label: "the eastern beast" },
            }),
          );
          journal.write(
            `Three more sightings. A farmer swears it looked at her directly for a full minute before turning back into the trees. The scholars have started a new page in the bestiary and admit they have nothing to put on it.`,
            "event",
            castle?.id,
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, world, rand }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          const expiresAt = Date.now() +
            (world.courtEffects.advisorSeated ? 180_000 : 90_000);
          const decId = `beast_${world.state.day}`;
          world.decisions.propose({
            id: decId,
            title: "The thing in the eastern wood awaits a decision",
            body: "Send hunters to deal with it — costly but definitive. Or leave it alone and let the legend grow.",
            expiresAt,
            defaultOnExpire: false,
            options: [
              {
                id: "hunt",
                label: "Send hunters (20 gold)",
                onChoose: (w) => {
                  const cost = 20;
                  w.economy.state.gold = Math.max(0, w.economy.state.gold - cost);
                  w.reputation.adjust(-1);
                  if (rand() < 0.65) {
                    w.journal.write(
                      `The hunters returned after three days. They said very little about what they found. The ${cost} gold was well spent. A trophy — a single enormous claw — was placed in the vault as proof.`,
                      "milestone",
                      castle?.id,
                    );
                    w.treasury.acquire("relic", `claw of the eastern beast, year ${w.state.year}`);
                  } else {
                    w.journal.write(
                      `The hunters returned after three days, empty-handed and quieter than they left. Whatever it was, it is not gone. It just wasn't where they looked.`,
                      "event",
                      castle?.id,
                    );
                  }
                },
              },
              {
                id: "leave",
                label: "Leave it alone",
                onChoose: (w) => {
                  w.reputation.adjust(1);
                  w.journal.write(
                    `The crown elected to leave it be. The sightings stopped within the week. The children kept the name they had given it. The scholars published a careful, three-page account that concluded with "further observation required." The legend was placed in the vault.`,
                    "milestone",
                    castle?.id,
                  );
                  w.treasury.acquire("scroll", `the bestiary account of the eastern creature, year ${w.state.year}`);
                },
              },
              {
                id: "watch",
                label: "Post scouts and observe",
                onChoose: (w) => {
                  w.journal.write(
                    `Scouts were posted at the wood's edge for a fortnight. They filled six pages with careful notes and saw the creature twice more. On the final morning it walked past their camp without pausing and didn't return. The scouts described it as "deliberate."`,
                    "milestone",
                    castle?.id,
                  );
                  w.treasury.acquire("scroll", `the scout reports on the eastern creature, year ${w.state.year}`);
                },
              },
            ],
          });
        },
      },
    ],
  },
  {
    id: "diplomatic_marriage",
    title: "The emissary from the east",
    guard: (world) => world.state.year >= 2,
    pickFlavor: (_world, rand) => {
      const NAMES = [
        "House Valderin", "the Ashcroft line", "Clan Mourne",
        "the Silversea principality", "House Orren of the Coast",
      ];
      return NAMES[Math.floor(rand() * NAMES.length)];
    },
    phases: [
      {
        onDay: 0,
        write: ({ journal, world, flavor }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          world.bus.publish(
            makeEvent("courier", {
              source: "narrative",
              intensity: 0.6,
              payload: { from: "rivermouth", to: castle?.id ?? "highkeep", label: `emissary from ${flavor}` },
            }),
          );
          journal.write(
            `An emissary from ${flavor} arrived under a white banner. They carry a formal proposal of marriage alliance — sealed, witnessed, and very carefully worded. The court is reading it slowly.`,
            "event",
            castle?.id,
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, world, flavor }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          journal.write(
            `The court has been debating the proposal from ${flavor} since dawn. Three factions have formed: those who see opportunity, those who see obligation, and those who see a trap. The emissary is reading quietly in the guest wing.`,
            "event",
            castle?.id,
          );
        },
      },
      {
        onDay: 2,
        write: ({ journal, world, flavor, rand }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          const expiresAt = Date.now() +
            (world.courtEffects.advisorSeated ? 240_000 : 120_000);
          const decId = `marriage_${world.state.day}`;
          world.decisions.propose({
            id: decId,
            title: `The proposal from ${flavor}`,
            body: `The emissary waits. Three choices: accept and gain an ally; decline warmly and preserve relations; or refuse coldly and make a point.`,
            expiresAt,
            defaultOnExpire: false,
            options: [
              {
                id: "accept",
                label: "Accept the alliance",
                onChoose: (w) => {
                  w.reputation.adjust(1);
                  // Spawn a new high-status NPC representing the allied family.
                  const homes = w.map.structures.filter((s) => s.kind === "town" || s.kind === "castle");
                  const home = homes[Math.floor(rand() * homes.length)];
                  if (home) {
                    const seed = Math.floor(rand() * 2 ** 31);
                    const allyName = `${flavor.split(" ").pop() ?? "Ally"}`;
                    const center = { x: home.pos.x + Math.floor(home.size.x / 2), y: home.pos.y + Math.floor(home.size.y / 2) };
                    w.pushNpc({
                      id: `npc_ally_${w.state.day}_${seed}`,
                      role: "scholar",
                      name: allyName,
                      age: 24,
                      pos: { ...center }, prevPos: { ...center }, facing: "s",
                      homeId: home.id, workId: home.id, activity: "idle",
                      path: [], activityTimer: 4, seed,
                    });
                    w.economy.state.gold = Math.min(99999, w.economy.state.gold + 30);
                    w.journal.write(
                      `The crown accepted the proposal from ${flavor}. ${allyName} arrived within the week bearing gifts and thirty gold as a gesture of good faith. The alliance was sealed before the end of the season.`,
                      "milestone",
                      castle?.id,
                    );
                    w.treasury.acquire("scroll", `the treaty with ${flavor}, year ${w.state.year}`);
                  }
                },
              },
              {
                id: "decline_warm",
                label: "Decline with honors",
                onChoose: (w) => {
                  w.journal.write(
                    `The crown declined the proposal with warm words and a parting gift. The emissary departed satisfied that they had been treated well. ${flavor} will remember this kindness, when they choose to.`,
                    "event",
                    castle?.id,
                  );
                },
              },
              {
                id: "decline_cold",
                label: "Refuse outright",
                onChoose: (w) => {
                  w.reputation.adjust(-1);
                  const cost = 20;
                  w.economy.state.gold = Math.max(0, w.economy.state.gold - cost);
                  w.journal.write(
                    `The crown refused ${flavor}'s proposal without ceremony. The emissary left before nightfall. A subsequent trade disruption cost the kingdom ${cost} gold. The court has begun quietly regretting the wording of the refusal.`,
                    "event",
                    castle?.id,
                  );
                },
              },
            ],
          });
        },
      },
    ],
  },
  {
    id: "comet_sighting",
    title: "The comet over the kingdom",
    guard: (world) =>
      world.state.year >= 3 &&
      world.map.structures.some((s) => s.kind === "astronomers_tower"),
    phases: [
      {
        onDay: 0,
        write: ({ journal, world }) => {
          const tower = world.map.structures.find((s) => s.kind === "astronomers_tower");
          journal.write(
            `The astronomers called the court to the tower roof before dawn. A bright object is moving through the sky — not a star, not a planet. A comet, they say, returning on a cycle longer than any record the tower holds.`,
            "milestone",
            tower?.id,
          );
          world.bus.publish(
            makeEvent("research", {
              source: "narrative",
              intensity: 0.8,
              duration_ms: 30_000,
              payload: { structure: tower?.id ?? "highkeep", label: "the comet observed" },
            }),
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, world, rand }) => {
          const tower = world.map.structures.find((s) => s.kind === "astronomers_tower");
          const expiresAt = Date.now() +
            (world.courtEffects.advisorSeated ? 180_000 : 90_000);
          const decId = `comet_${world.state.day}`;
          const repDesc = world.reputation.descriptor();
          world.decisions.propose({
            id: decId,
            title: "How should the crown record the comet?",
            body: `The astronomers have calculated its next appearance. How the court names and interprets it will be in the chronicle forever.`,
            expiresAt,
            defaultOnExpire: false,
            options: [
              {
                id: "good_omen",
                label: "Call it a blessing",
                onChoose: (w) => {
                  w.reputation.adjust(1);
                  const namePart = w.state.year > 5 ? "the Long-Returning" : "the New";
                  const cometName = `${namePart} Light of Year ${w.state.year}`;
                  w.journal.write(
                    `The crown declared the comet a sign of good fortune. It was named "${cometName}" and recorded in the tower's star ledger. The people slept better that night.`,
                    "milestone",
                    tower?.id,
                  );
                  w.treasury.acquire("scroll", `the astronomical record of "${cometName}"`);
                },
              },
              {
                id: "scientific",
                label: "Record it without interpretation",
                onChoose: (w) => {
                  const cometName = `Comet of ${w.state.season.charAt(0).toUpperCase() + w.state.season.slice(1)}, Y${w.state.year}`;
                  w.journal.write(
                    `The astronomers named the comet "${cometName}" and recorded its path without embellishment. The ${repDesc} crown signed the star ledger and noted that the calculations showed it would return in 74 years. Several people who heard this quietly did the arithmetic and said nothing.`,
                    "milestone",
                    tower?.id,
                  );
                  w.treasury.acquire("scroll", `the precise record of "${cometName}" — path, angle, and return date`);
                },
              },
              {
                id: "name_it",
                label: "Name it for the kingdom",
                onChoose: (w) => {
                  const ident = w.map.structures.find((s) => s.kind === "castle")?.name ?? "the kingdom";
                  const cometName = `The Comet of ${ident}`;
                  w.journal.write(
                    `The crown named the comet for the kingdom itself: "${cometName}." The astronomers carved it into the tower stone. It will be there when the comet returns in 74 years, for whoever stands in the same spot.`,
                    "milestone",
                    tower?.id,
                  );
                  w.treasury.acquire("scroll", `the naming charter of "${cometName}"`);
                },
              },
            ],
          });
        },
      },
      {
        onDay: 3,
        write: ({ journal, world }) => {
          const tower = world.map.structures.find((s) => s.kind === "astronomers_tower");
          journal.write(
            `The comet is no longer visible to the naked eye. The astronomers say it will be back in 74 years. The page in the star ledger is already waiting for the note about its next appearance.`,
            "event",
            tower?.id,
          );
        },
      },
    ],
  },
  {
    id: "elder_council",
    title: "The elders convene",
    guard: (world) =>
      world.state.year >= 3 &&
      world.npcs.filter((n) => (n.age ?? 0) >= 60).length >= 3,
    pickFlavor: (world, rand) => {
      // Pack 3 elder names into the flavor string.
      const elders = world.npcs.filter((n) => (n.age ?? 0) >= 60 && n.name);
      const picked = elders.slice(0, 3).map((e) => e.name ?? "an elder");
      // Fill to 3 if needed.
      while (picked.length < 3) picked.push("an elder of the realm");
      return picked.join("||");
    },
    phases: [
      {
        onDay: 0,
        write: ({ journal, world, flavor }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          const [a, b, c] = flavor.split("||");
          journal.write(
            `${a}, ${b}, and ${c} — three of the kingdom's oldest living residents — sent a request to the crown for a formal audience. They called it "a matter of record and counsel." The crown granted the hour.`,
            "milestone",
            castle?.id,
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, world, flavor, rand }) => {
          const castle = world.map.structures.find((s) => s.kind === "castle");
          const [a] = flavor.split("||");
          const ELDER_WISDOMS = [
            `${a} spoke for the group: "We have watched three droughts, two floods, and one monarch we'd rather not name. We are not here to give orders. We are here to say: the kingdom has lasted. That is harder than it sounds."`,
            `${a} laid three sealed letters on the table — one for each decade they had collectively watched. "Open them if things get bad," they said. "Preferably not all at once."`,
            `${a} stood and said only: "The young inherit the shape of the place. We wanted to confirm the shape was still good." Then they sat back down and waited for someone to offer tea.`,
            `${a} said the council had one piece of advice: "Do not confuse what has always been done with what should be done." Then they asked if the kitchens were still as good as they remembered.`,
          ];
          const wisdom = ELDER_WISDOMS[Math.floor(rand() * ELDER_WISDOMS.length)];
          // Small mechanical benefit — their counsel has real value
          const goldBonus = 15 + Math.floor(rand() * 20);
          world.economy.state.gold = Math.min(99999, world.economy.state.gold + goldBonus);
          world.reputation.adjust(1);
          journal.write(
            `The elders were received in the great hall. ${wisdom} The treasury recorded a bequest of ${goldBonus} gold from the council — "for the running of things," they said. The written counsel was placed in the vault.`,
            "milestone",
            castle?.id,
          );
          world.treasury.acquire(
            "scroll",
            `the elder council's written counsel, year ${world.state.year}`,
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
        write: ({ journal, flavor, world }) => {
          const lib = world.map.structures.find((s) => s.kind === "library");
          journal.write(
            `${capitalize(flavor)} uncovered an old map in the Scriptorium's lower vault. The scholars were quietly excited.`,
            "event",
            lib?.id,
          );
        },
      },
      {
        onDay: 1,
        write: ({ journal, world }) => {
          const lib = world.map.structures.find((s) => s.kind === "library");
          journal.write(
            "Translation work continued through the night. The candles burned low.",
            "event",
            lib?.id,
          );
        },
      },
      {
        onDay: 3,
        write: ({ journal, world }) => {
          const lib = world.map.structures.find((s) => s.kind === "library");
          world.bus.publish(
            makeEvent("research", {
              source: "narrative",
              intensity: 0.6,
              payload: { structure: lib?.id ?? "scriptorium", label: "the map's secret" },
            }),
          );
          journal.write(
            "The map's secret was laid bare: a freshwater spring, undiscovered, three days' ride to the north. A small mercy in a quiet age.",
            "milestone",
            lib?.id,
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
      // Filter against each arc's guard so we don't pick something that
      // can't fire (e.g. The Returning Bloodline with an empty archive).
      const eligible = ARCS.filter((a) => !a.guard || a.guard(this.world));
      if (eligible.length) {
        const def = eligible[Math.floor(this.rand() * eligible.length)];
        // Per-arc flavor pickers let arcs encode richer state (e.g. a
        // specific past kingdom) into the flavor string for unpacking
        // across phases.
        const flavor = def.pickFlavor
          ? def.pickFlavor(this.world, this.rand)
          : FLAVOR_NAMES[Math.floor(this.rand() * FLAVOR_NAMES.length)];
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
    }

    // Decision proposals — 25% chance per new day, mutually exclusive with arc starts.
    if (day > 0 && this.rand() < 0.25) {
      this.proposeRandomDecision();
    }

    // Late-game bonus decisions — only roll after year 2.
    if (day > 0 && this.world.state.year >= 2 && this.rand() < 0.12) {
      this.proposeLateGameDecision();
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
      (this.world.courtEffects.advisorSeated ? 180_000 : 90_000) +
      (this.world.edictEffects.openCourt ? 60_000 : 0);
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
                    home.id,
                  );
                  // One-line backstory so the new villager reads as a person.
                  w.journal.write(
                    backstoryFor(capitalize(flavor), npcSeed),
                    "event",
                    home.id,
                  );
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
      // Boundary dispute — two villagers, one quarrel. We MUST pick a second
      // flavor name distinct from the first, otherwise the decision reads as
      // "Tessa and Tessa argue over the line" with two identical "Side with
      // Tessa" buttons. With a 9-name pool the naive pick collides ~11% of
      // the time, which the live demo surfaced. Bounded retry; if the pool
      // has only one viable name we fall back to a generic neighbor.
      let other = FLAVOR_NAMES[Math.floor(rand() * FLAVOR_NAMES.length)];
      for (let i = 0; i < 8 && other === flavor; i++) {
        other = FLAVOR_NAMES[Math.floor(rand() * FLAVOR_NAMES.length)];
      }
      if (other === flavor) other = "their neighbor";
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
  private proposeLateGameDecision(): void {
    const rand = this.rand;
    const expiresAt = Date.now() +
      (this.world.courtEffects.advisorSeated ? 180_000 : 90_000) +
      (this.world.edictEffects.openCourt ? 60_000 : 0);
    const roll = rand();
    const decId = this.nextId("late");

    if (roll < 0.35) {
      // Royal pardon — a prisoner asks for release.
      const flavorName = FLAVOR_NAMES[Math.floor(rand() * FLAVOR_NAMES.length)];
      this.world.decisions.propose({
        id: decId,
        title: "A petition for royal pardon",
        body: `${capitalize(flavorName)} has been held in the castle cells for two seasons on old charges. Their family petitions for release.`,
        expiresAt,
        defaultOnExpire: false,
        options: [
          {
            id: "pardon",
            label: "Grant the pardon",
            onChoose: (w) => {
              w.journal.write(
                `${capitalize(flavorName)} was released under the royal seal. The family received them at the gate with a quiet that spoke more than celebration would have.`,
                "milestone",
              );
              // Small chance they return the favor.
              if (rand() < 0.45) {
                w.treasury.acquire("gem", `a gift of thanks from ${flavorName}'s family`);
              }
            },
          },
          {
            id: "deny",
            label: "Deny the petition",
            onChoose: (w) =>
              w.journal.write(
                `The petition was denied. ${capitalize(flavorName)} remains. The family did not return.`,
                "event",
              ),
          },
          {
            id: "commute",
            label: "Commute to exile",
            onChoose: (w) => {
              const cost = 15;
              w.economy.state.gold = Math.max(0, w.economy.state.gold - cost);
              w.journal.write(
                `${capitalize(flavorName)} was released under condition of permanent exile — ${cost} gold for travel provisions and a guard escort. They crossed the border without looking back.`,
                "event",
              );
            },
          },
        ],
      });
    } else if (roll < 0.65) {
      // Spy report — intelligence delivered, requires a choice.
      const kingdom = this.world.state.year >= 3
        ? "the northern confederation"
        : "a neighboring lord";
      this.world.decisions.propose({
        id: decId,
        title: "A spy's report",
        body: `Your intelligencer returns with a full report on ${kingdom}. Acting on it costs gold; ignoring it costs nothing for now.`,
        expiresAt,
        defaultOnExpire: false,
        options: [
          {
            id: "act",
            label: "Act on the intelligence",
            onChoose: (w) => {
              const cost = 25;
              w.economy.state.gold = Math.max(0, w.economy.state.gold - cost);
              w.journal.write(
                `The crown spent ${cost} gold on a counter-measure. Three weeks later, a merchant road that would have been closed opened instead. The intelligencer asked for nothing further.`,
                "milestone",
              );
              if (rand() < 0.5) {
                w.treasury.acquire("scroll", "a copy of the spy's report, bound in oil-cloth");
              }
            },
          },
          {
            id: "file",
            label: "File it away",
            onChoose: (w) =>
              w.journal.write(
                `The report was sealed and filed. Perhaps the knowledge will matter someday. Perhaps it already doesn't.`,
                "event",
              ),
          },
          {
            id: "share",
            label: "Send a copy to an ally",
            onChoose: (w) => {
              const castle = w.map.structures.find((s) => s.kind === "castle");
              w.bus.publish(
                makeEvent("courier", {
                  source: "narrative",
                  intensity: 0.5,
                  payload: {
                    from: castle?.id ?? "highkeep",
                    to: "rivermouth",
                    label: "intelligence packet",
                  },
                }),
              );
              w.economy.state.gold = Math.min(99999, w.economy.state.gold + 15);
              w.journal.write(
                `A copy of the report was dispatched to a friendly lord, who sent 15 gold in gratitude. Favors traded are better than favors promised.`,
                "event",
              );
            },
          },
        ],
      });
    } else {
      // A noble family requests a formal alliance.
      const family = ["House Varenmark", "the Durnfield line", "the Ashbriar family", "House Colden"][
        Math.floor(rand() * 4)
      ];
      this.world.decisions.propose({
        id: decId,
        title: `${family} requests an alliance`,
        body: `A messenger from ${family} arrives with a formal proposal — shared resources in exchange for mutual recognition of borders.`,
        expiresAt,
        defaultOnExpire: true,
        options: [
          {
            id: "decline",
            label: "Decline politely",
            onChoose: (w) =>
              w.journal.write(
                `The crown declined ${family}'s proposal with diplomatic warmth. The messenger left satisfied that they had been heard, which is the best kind of refusal.`,
                "event",
              ),
          },
          {
            id: "accept",
            label: "Form the alliance",
            onChoose: (w) => {
              w.economy.state.gold = Math.min(99999, w.economy.state.gold + 30);
              w.journal.write(
                `The crown accepted ${family}'s proposal. A treaty was drawn, witnessed, and sealed. 30 gold arrived within the week as the first transfer of shared resources.`,
                "milestone",
              );
              w.treasury.acquire("scroll", `the compact with ${family}`);
            },
          },
        ],
      });
    }
  }
}

function pick(world: World, rand: () => number = Math.random): string {
  return pickTown(world, rand).name;
}

/**
 * Pick a random town and return both its display name and id. Callers that
 * need to pin journal entries to a structure use the id; callers that just
 * need the name for prose use `pick()` above.
 */
function pickTown(
  world: World,
  rand: () => number = Math.random,
): { name: string; id: string | undefined } {
  const towns = world.map.structures.filter((s) => s.kind === "town");
  if (!towns.length) return { name: "the keep", id: undefined };
  const t = towns[Math.floor(rand() * towns.length)];
  return { name: t.name, id: t.id };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Pick an adult, non-monarch NPC to stand in for a "champion" or similar
 * named role. Deterministic against the seeded RNG, so a given seed + arc
 * day always names the same villager. Falls back to a generic descriptor
 * if the roster has no eligible adults (very young kingdom).
 */
function pickChampion(world: World, rand: () => number): string {
  const eligible = world.npcs.filter(
    (n) => n.role !== "monarch" && (n.age ?? 30) >= 18,
  );
  if (!eligible.length) return "a young rider from the towns";
  return eligible[Math.floor(rand() * eligible.length)].name ?? "a champion of the realm";
}
