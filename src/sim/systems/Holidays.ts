/**
 * Real-world calendar holidays. When the player's local date matches one of
 * these, the kingdom autonomously throws a festival once per day for that
 * date — themed via journal text and the festival event's label.
 *
 * Implementation is deliberately conservative: ONE event per day max, fired
 * by the day-tick check, and remembered so the same holiday doesn't fire
 * twice on a single in-world day.
 *
 * Dates use the player's local timezone (Date constructor).
 */

import type { World } from "../World";
import type { Journal } from "./Journal";
import { makeEvent } from "../events/EventSchema";

interface Holiday {
  /** month (1-12) */
  month: number;
  /** day-of-month (1-31) */
  day: number;
  name: string;
  /** Optional: fire on this exact date only on certain years (e.g. moveable feasts) */
  match?: (d: Date) => boolean;
  /** Journal entry to write — function so we can include kingdom name etc. */
  journal: (w: World) => string;
  /** Optional themed structure to host the festival */
  structureKind?: "town" | "castle";
}

const HOLIDAYS: Holiday[] = [
  {
    month: 1,
    day: 1,
    name: "First Light of the Year",
    journal: () =>
      "Bells rang at dawn — the first day of a new year. The court hosted a quiet feast.",
    structureKind: "castle",
  },
  {
    month: 2,
    day: 14,
    name: "Lovers' Festival",
    journal: () =>
      "Garlands hung across every doorway. Couples walked the streets at dusk hand in hand.",
    structureKind: "town",
  },
  {
    month: 3,
    day: 20,
    name: "Spring Equinox",
    journal: () =>
      "On the equinox, the fields were blessed. The mill ran late into the evening.",
  },
  {
    month: 5,
    day: 1,
    name: "Bloomfest",
    journal: () => "Maypoles rose in the squares; the kingdom danced.",
    structureKind: "town",
  },
  {
    month: 6,
    day: 21,
    name: "Midsummer",
    journal: () =>
      "Bonfires lit every hilltop tonight. The longest day of the year, and the brightest.",
  },
  {
    month: 9,
    day: 22,
    name: "Harvest Moon",
    journal: () => "The first harvest carts rolled in. Tables groaned under their weight.",
    structureKind: "town",
  },
  {
    month: 10,
    day: 31,
    name: "Hallowtide",
    journal: () =>
      "Lanterns were carved with strange faces. The children ran through the streets shrieking, half in jest, half not.",
    structureKind: "town",
  },
  {
    month: 11,
    day: 11,
    name: "Day of Remembrance",
    journal: () =>
      "The court fell silent at noon for those lost to wars, storms, and old age. A name was read for every flag the kingdom had ever flown.",
    structureKind: "castle",
  },
  {
    month: 12,
    day: 21,
    name: "Winter Solstice",
    journal: () =>
      "The shortest day. Every hearth burned through the long night, and the watch sang to keep warm.",
  },
  {
    month: 12,
    day: 25,
    name: "Yuletide",
    journal: () =>
      "Pine boughs over the doors, sweet bread in the ovens, and a feast that lasted until the smallest hours.",
    structureKind: "castle",
  },
  {
    month: 12,
    day: 31,
    name: "Year's End",
    journal: () =>
      "Fireworks of paper and powder burst over Highkeep. The year passed, and the kingdom remained.",
    structureKind: "castle",
  },
];

export class Holidays {
  private firedToday = new Set<string>();
  private lastCheckedRealDate = "";

  constructor(private world: World, private journal: Journal) {}

  /** Called from World.tick each tick; cheap enough at full rate. */
  tick() {
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    if (dateKey !== this.lastCheckedRealDate) {
      this.firedToday.clear();
      this.lastCheckedRealDate = dateKey;
    }
    for (const h of HOLIDAYS) {
      if (h.month !== now.getMonth() + 1) continue;
      if (h.day !== now.getDate()) continue;
      if (h.match && !h.match(now)) continue;
      if (this.firedToday.has(h.name)) continue;
      this.firedToday.add(h.name);
      this.fire(h);
    }
  }

  private fire(h: Holiday) {
    // Pick a structure
    const candidates = this.world.map.structures.filter((s) => {
      if (h.structureKind) return s.kind === h.structureKind;
      return s.kind === "town" || s.kind === "castle";
    });
    const target = candidates[Math.floor(Math.random() * candidates.length)] ??
      this.world.map.structures[0];
    if (target) {
      this.world.publish(
        makeEvent("festival", {
          source: "narrative",
          intensity: 0.85,
          duration_ms: 30_000,
          payload: { structure: target.id, label: h.name },
        }),
      );
    }
    this.journal.write(`${h.name} — ${h.journal(this.world)}`, "milestone");
  }
}
