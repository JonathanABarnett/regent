/**
 * Name a Star — a once-per-year flourish unlocked by the Astronomer's Tower.
 *
 * When the in-world year rolls over AND the kingdom has an Astronomer's
 * Tower built, the player is offered a decision: name a newly-observed
 * star, decline (the astronomers will name it themselves), or dedicate it
 * to a past monarch (folds the Past Kingdoms Vault into the present).
 *
 * Each named star becomes a permanent string in the chronicle — every
 * subsequent year's flavor lines can mention "the year the star was
 * named" or reference the star by name. (Future hook; today the entry
 * itself is the permanent record.)
 *
 * Determinism: the suggestion list is picked from a fixed pool using
 * `world.rand`, so the same seed + year produces the same options.
 */

import type { World } from "../World";
import type { Journal } from "./Journal";
import { readArchive } from "../KingdomArchive";

/**
 * Suggested star names — drawn from real-world historical / mythological
 * naming traditions, with a few invented additions that fit a fantasy
 * kingdom's voice. Deliberately not famous brand-name stars; these read
 * as the kingdom's discoveries, not borrowed from Earth's astronomy.
 */
const STAR_SUGGESTIONS: readonly string[] = [
  "Aurensil", "the Bright Heron", "Carrack's Eye", "the Driftwarden",
  "Eleithyra", "the Falconer", "Glasswind", "Hearthrise",
  "Iolanth", "the Jackdaw", "Kestreldark", "Lyrian",
  "the Mariner's Lamp", "Nymphae", "Oresford",
  "the Pale Wanderer", "Quincey's Vow", "Riftholm",
  "the Salt Lamp", "Tideborn", "Ushen", "Veilkeep",
  "the Wayfarer", "Yarrowstar", "Zephyrine",
];

/**
 * Pick three distinct suggestions for the decision dialog. Deterministic
 * against the world's seeded RNG.
 */
export function pickStarSuggestions(rand: () => number, count: number = 3): string[] {
  const pool = [...STAR_SUGGESTIONS];
  const out: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rand() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * Pick the most recent past monarch from the archive (if any). Returns
 * `null` when the archive is empty — the dedication option is then hidden.
 */
export function lastArchivedMonarch(): string | null {
  const archive = readArchive();
  if (!archive.length) return null;
  // archive is newest-first per appendToArchive contract.
  const name = archive[0].monarchName?.trim();
  return name && name.length > 0 ? name : null;
}

/**
 * Propose the "Name a Star" decision. Caller (World) guards on:
 *   - an Astronomer's Tower exists on the map
 *   - the year just rolled (yearChanged && cal.year > 1)
 *   - this hasn't already fired for the current year (one-shot per year)
 */
export function proposeNameAStar(
  world: World,
  journal: Journal,
  rand: () => number,
): void {
  const tower = world.map.structures.find((s) => s.kind === "astronomers_tower");
  if (!tower) return;
  const suggestions = pickStarSuggestions(rand, 3);
  if (suggestions.length < 1) return;
  const past = lastArchivedMonarch();
  const id = `name_star_${world.state.year}_${world.state.day}`;

  // Build the decision options.
  type Opt = { id: string; label: string; onChoose: (w: World) => void };
  const options: Opt[] = suggestions.map((name, i) => ({
    id: `name_${i}`,
    label: `Name it "${name}"`,
    onChoose: (w) => {
      w.journal.write(
        `The astronomers entered a new star into the chart at the Tower: "${name}". The royal hand signed beside the entry.`,
        "milestone",
        tower.id,
      );
      w.treasury.acquire("scroll", `the star-chart entry for ${name}`);
    },
  }));
  // Dedication option — only present if there's a past monarch to honor.
  if (past) {
    options.push({
      id: "dedicate_past",
      label: `Dedicate to ${past}`,
      onChoose: (w) => {
        w.journal.write(
          `The astronomers entered a new star into the chart at the Tower, dedicated to ${past}, of a kingdom that has passed. The royal hand signed beside the entry.`,
          "milestone",
          tower.id,
        );
        w.treasury.acquire("scroll", `the star-chart dedication to ${past}`);
      },
    });
  }
  // Decline option — silent, no journal milestone, just a small flavor line.
  options.push({
    id: "decline",
    label: "Let the astronomers name it",
    onChoose: (w) => {
      // The astronomers pick — we just credit them in the journal.
      const fallback = suggestions[suggestions.length - 1] ?? "an unnamed light";
      w.journal.write(
        `The astronomers chose the name themselves: "${fallback}". The royal seal was not invoked, but the chart was signed all the same.`,
        "event",
        tower.id,
      );
    },
  });

  // Decisions live ~5 minutes for this one (no auto-default) — naming a
  // star isn't time-pressured; let the player think.
  const expiresAt = Date.now() + 5 * 60_000;
  world.decisions.propose({
    id,
    title: "A new star",
    body:
      `The astronomers report a star not on any chart. They humbly ask the crown to name it — or to let them.`,
    expiresAt,
    defaultOnExpire: false,
    options,
  });
  journal.write(
    `The astronomers at the Tower reported a new star tonight, asking the crown for a name.`,
    "event",
    tower.id,
  );
}
