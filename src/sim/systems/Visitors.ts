import type { World } from "../World";
import type { Journal } from "./Journal";

/**
 * Visitors system — periodic strangers arrive bringing flavour, lore, and
 * occasionally a small reward.
 *
 *   BARD       — performs at the keep; a song is added to the chronicle.
 *   SCHOLAR    — deposits a tome in the library; one artifact gained.
 *   KNIGHT     — tells a war story by the fire; reputation +1.
 *   PILGRIM    — leaves a small relic on the shrine (if it exists).
 *   STORYTELLER— shares a rumour about a distant land (pure flavour).
 *
 * Visitors do NOT join the kingdom (that's the Immigration system). They
 * come, do their thing, leave a memory in the chronicle, and depart.
 */

const VISIT_INTERVAL_DAYS = 12;
const VISIT_CHANCE        = 0.5;

type VisitorKind = "bard" | "scholar" | "knight" | "pilgrim" | "storyteller";

const VISITOR_NAMES = [
  "Erion", "Lysa", "Maric", "Tova", "Castor", "Selene", "Brun", "Wren",
  "Aldo", "Mira", "Cassian", "Yelva", "Tarn", "Ines", "Roel", "Pia",
  "Garrick", "Faela", "Orin", "Sable", "Hadrian", "Lirien", "Quill",
];

const VISITOR_PLACES = [
  "the Verdant League", "Kestmark", "the Saltwater Companies",
  "the Hollow Hills", "the Greycrown Alliance", "the Ashwood League",
  "the Bridgewater Companies", "the Orevast valley", "the Thornwall Brotherhood",
];

// Bards
const BARD_LINES: readonly string[] = [
  "{name}, a wandering bard from {place}, performed at the keep tonight. They sang of a kingdom that had buried its kings under their own flagstones. The court was very quiet.",
  "A bard called {name} came down from {place} and stayed for three days. The kitchen will remember them. The chronicle will too — they left a song behind.",
  "{name} played the small harp in the great hall this evening. They were from {place}. By midnight, no one wanted them to leave. They left anyway.",
  "A bard named {name} arrived from {place} and asked for a meal in exchange for a song. They got both. The song was better than the meal, which is saying something.",
];

// Scholars
const SCHOLAR_LINES: readonly string[] = [
  "A travelling scholar from {place} — {name} by name — left a slim volume in the library before walking on. The Scriptorium is reading it now.",
  "{name}, a scholar of {place}, spent two days copying entries from our chronicle. They left a book in exchange. A fair trade.",
  "A monk in scholar's robes arrived from {place}. They would not give a name in full — only \"{name}\" — and left a book that the Scriptorium has not finished arguing about.",
];

// Knights
const KNIGHT_LINES: readonly string[] = [
  "An old knight named {name} from {place} stayed the night and told a war story. Half the kingdom was in the hall by the end. They left at dawn without ceremony.",
  "{name}, retired from the {place} guard, came through the kingdom this week. The young guards asked them everything. They answered patiently.",
  "A grey-bearded soldier named {name} arrived from {place}. They sharpened their blade by the keep's fire and would not say why.",
];

// Pilgrims
const PILGRIM_LINES: readonly string[] = [
  "A pilgrim of {place} called {name} prayed at the shrine and left a small stone with a worn-down carving on it.",
  "{name} walked to the shrine before dawn. They came from {place}. They left as quietly as they arrived.",
  "A pilgrim from {place} — {name} — placed a token at the shrine that none of the priests could identify. It remains there.",
];

// Storytellers (lore drop)
const STORYTELLER_LINES: readonly string[] = [
  "A storyteller from {place} — {name} — spoke of a sunken road north of the river that the locals avoid after dark. No one knew whether to believe it. Everyone listened.",
  "{name} of {place} told the children at the gate about a tower further east than any map shows, where a bell still rings on the hour for reasons no one alive has ever explained.",
  "An old storyteller named {name} arrived from {place}. They claimed the moon was once two moons, and the kingdom remembered.",
  "{name}, a storyteller of {place}, said that somewhere south of here a kingdom buried its dead with their shoes on. The kingdom listened politely. {name} ate well. Everyone parted on good terms.",
];

export interface VisitorsSnapshot {
  lastVisitDay: number;
  totalVisits: number;
}

export class Visitors {
  state: VisitorsSnapshot = { lastVisitDay: 0, totalVisits: 0 };

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): VisitorsSnapshot { return { ...this.state }; }
  restore(s: VisitorsSnapshot): void { this.state = { ...s }; }

  tick(): void {
    const day = this.world.state.day;
    if (day - this.state.lastVisitDay < VISIT_INTERVAL_DAYS) return;
    if (this.rand() > VISIT_CHANCE) return;

    this.state.lastVisitDay = day;
    this.state.totalVisits++;
    this._fireVisit();
  }

  private _fireVisit(): void {
    const name = VISITOR_NAMES[Math.floor(this.rand() * VISITOR_NAMES.length)];
    const place = VISITOR_PLACES[Math.floor(this.rand() * VISITOR_PLACES.length)];

    // Weight the kind based on what structures exist (scholar needs a library, etc.)
    const choices: Array<{ kind: VisitorKind; weight: number }> = [
      { kind: "bard", weight: 4 },
      { kind: "knight", weight: 3 },
      { kind: "storyteller", weight: 3 },
    ];
    if (this.world.map.structures.some((s) => s.kind === "library")) {
      choices.push({ kind: "scholar", weight: 3 });
    }
    if (this.world.map.structures.some((s) => s.kind === "shrine")) {
      choices.push({ kind: "pilgrim", weight: 2 });
    }
    const totalWeight = choices.reduce((s, c) => s + c.weight, 0);
    let r = this.rand() * totalWeight;
    let kind: VisitorKind = "bard";
    for (const c of choices) {
      if ((r -= c.weight) <= 0) { kind = c.kind; break; }
    }

    const pool = this._poolFor(kind);
    const line = pool[Math.floor(this.rand() * pool.length)]
      .replace("{name}", name)
      .replace("{place}", place);

    const targetStructureId = this._structureFor(kind);
    this.journal.write(line, "event", targetStructureId);

    // Side effects
    if (kind === "scholar") {
      this.world.treasury.acquire("tome", `gift from ${name} of ${place}`);
    } else if (kind === "knight") {
      this.world.reputation.adjust(1);
    }
  }

  private _poolFor(kind: VisitorKind): readonly string[] {
    switch (kind) {
      case "bard": return BARD_LINES;
      case "scholar": return SCHOLAR_LINES;
      case "knight": return KNIGHT_LINES;
      case "pilgrim": return PILGRIM_LINES;
      case "storyteller": return STORYTELLER_LINES;
    }
  }

  private _structureFor(kind: VisitorKind): string | undefined {
    const find = (k: string) => this.world.map.structures.find((s) => s.kind === k)?.id;
    if (kind === "scholar") return find("library");
    if (kind === "pilgrim") return find("shrine");
    if (kind === "bard" || kind === "knight" || kind === "storyteller") return find("castle");
    return undefined;
  }
}
