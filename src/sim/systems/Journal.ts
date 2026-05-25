import type { World } from "../World";
import type { ExternalEvent } from "../events/EventSchema";
import type { SavedJournalEntry } from "../Persistence";

/**
 * Converts the noisy event stream into a sparse, readable narrative.
 *
 * Heuristics:
 *   - Skip routine internal events. Only highlight things a player would care
 *     about (life events, named courier arrivals, weather changes, milestones).
 *   - Coalesce same-kind events within a day into a single entry ("On Day 47
 *     the smith forged 3 swords").
 *   - Never exceed ~3 entries per day, so a week of play stays scrollable.
 *
 * The Journal lives in the Zustand store; this class is the writer.
 */
export class Journal {
  private lastEntryDay = -1;
  private dayCoalesce = new Map<string, number>();

  constructor(
    private world: World,
    private onEntry: (entry: SavedJournalEntry) => void,
  ) {
    this.world.bus.subscribe((ev) => this.handleEvent(ev));
  }

  /**
   * Write a free-form entry. Optionally tags the entry with a
   * `targetStructureId` so the UI can offer "go here" navigation when the
   * player clicks the entry.
   *
   * The 3rd arg accepts either:
   *   - a bare structure id string (shorthand for `{ targetStructureId }`)
   *   - an options object with `{ targetStructureId }` (room to add more
   *     fields without another overload — e.g. `npcId` someday)
   */
  write(
    text: string,
    kind: SavedJournalEntry["kind"] = "event",
    target?: string | { targetStructureId?: string; fromDecision?: boolean },
  ) {
    const targetStructureId =
      typeof target === "string"
        ? target
        : target?.targetStructureId;
    const fromDecision =
      typeof target === "object" && target !== null
        ? target.fromDecision
        : undefined;
    this.onEntry({
      id: `j_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      day: this.world.state.day,
      year: this.world.state.year,
      season: this.world.state.season,
      text,
      kind,
      targetStructureId,
      fromDecision,
    });
  }

  private handleEvent(ev: ExternalEvent) {
    // Reset coalesce window on day change.
    if (this.lastEntryDay !== this.world.state.day) {
      this.dayCoalesce.clear();
      this.lastEntryDay = this.world.state.day;
      // dawn entry: lightweight day summary anchor
      if (this.world.state.day > 1) {
        this.write(
          `Day ${this.world.state.day} dawns; ${this.world.state.season} continues.`,
          "system",
        );
      }
    }

    // Skip internally-generated chatter (the bus carries these too).
    if (ev.source === "internal" && ev.kind === "custom") return;

    // The `target` we pick for each entry is the structure id players are
    // most likely to want to look at — the destination for couriers, the
    // forge/library/mine for crafting/research events, etc.
    switch (ev.kind) {
      case "courier": {
        const label = ev.payload.label ?? "a sealed scroll";
        const from = ev.payload.from ?? "the gates";
        const to = ev.payload.to ?? "the keep";
        const k = `courier:${from}:${to}`;
        if ((this.dayCoalesce.get(k) ?? 0) === 0) {
          this.write(
            pickTemplate(COURIER_TEMPLATES, { from: nice(from), to: nice(to), label }),
            "event",
            to,
          );
        }
        this.dayCoalesce.set(k, (this.dayCoalesce.get(k) ?? 0) + 1);
        break;
      }
      case "forge": {
        const k = "forge";
        const n = (this.dayCoalesce.get(k) ?? 0) + 1;
        this.dayCoalesce.set(k, n);
        const forgeId = ev.payload.structure ?? "ironhearth";
        if (n === 1) this.write(pickTemplate(FORGE_FIRST_TEMPLATES, {}), "event", forgeId);
        else if (n === 3) this.write(pickTemplate(FORGE_THIRD_TEMPLATES, {}), "event", forgeId);
        break;
      }
      case "research": {
        const k = "research";
        const n = (this.dayCoalesce.get(k) ?? 0) + 1;
        this.dayCoalesce.set(k, n);
        const libId = ev.payload.structure ?? "scriptorium";
        if (n === 1) this.write(pickTemplate(RESEARCH_FIRST_TEMPLATES, {}), "event", libId);
        else if (n === 4) this.write(pickTemplate(RESEARCH_FOURTH_TEMPLATES, {}), "event", libId);
        break;
      }
      case "mining": {
        const k = "mining";
        if ((this.dayCoalesce.get(k) ?? 0) === 0) {
          this.write(
            pickTemplate(MINING_TEMPLATES, { label: ev.payload.label ?? "extra shift" }),
            "event",
            ev.payload.structure ?? "deeprock",
          );
        }
        this.dayCoalesce.set(k, (this.dayCoalesce.get(k) ?? 0) + 1);
        break;
      }
      case "storm":
        this.write(pickTemplate(STORM_TEMPLATES, {}), "weather");
        break;
      case "celebration":
        if (ev.payload.label) {
          this.write(
            pickTemplate(CELEBRATION_TEMPLATES, {
              structure: nice(ev.payload.structure ?? "the keep"),
              label: ev.payload.label,
            }),
            "milestone",
            ev.payload.structure ?? "highkeep",
          );
        }
        break;
      case "festival":
        this.write(
          pickTemplate(FESTIVAL_TEMPLATES, {
            structure: nice(ev.payload.structure ?? "town"),
          }),
          "milestone",
          ev.payload.structure,
        );
        break;
      case "airship":
        if ((this.dayCoalesce.get("airship") ?? 0) === 0) {
          this.write(pickTemplate(AIRSHIP_TEMPLATES, {}));
        }
        this.dayCoalesce.set("airship", (this.dayCoalesce.get("airship") ?? 0) + 1);
        break;
      case "monster":
        this.write(pickTemplate(MONSTER_TEMPLATES, {}), "weather");
        break;
    }
  }
}

// ── Template pools ────────────────────────────────────────────────────────
// Each pool has 3-5 variants. pickTemplate substitutes {placeholders}.

function pickTemplate(pool: string[], vars: Record<string, string | undefined>): string {
  const t = pool[Math.floor(Math.random() * pool.length)];
  return t.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

const COURIER_TEMPLATES = [
  "A courier rode from {from} to {to} bearing {label}.",
  "A rider was dispatched at first light: {from} to {to}, carrying {label}.",
  "Word travelled from {from} to {to} by saddle today — {label}.",
  "{label} crossed the kingdom; a courier carried it from {from} to {to}.",
];

const FORGE_FIRST_TEMPLATES = [
  "The forge rang out at Ironhearth; smoke rose into the sky.",
  "Hammers fell on hot iron — Ironhearth's chimney smoked all morning.",
  "The forge fires were stoked early today. The smiths worked through breakfast.",
  "Ironhearth glowed orange against the dawn. New work had begun.",
];

const FORGE_THIRD_TEMPLATES = [
  "By dusk the smiths had hammered out a third piece of ironwork.",
  "Three pieces finished by sundown; the apprentices fell asleep at their bench.",
  "The forge stayed lit late. Three finished works cooled on the rack.",
];

const RESEARCH_FIRST_TEMPLATES = [
  "Quills scratched at the Scriptorium; a new tome was begun.",
  "A scholar opened a fresh page at the Scriptorium today.",
  "Candles were lit at the Scriptorium. The day's writing began.",
  "Ink flowed at the Scriptorium — another small mystery was being worked through.",
];

const RESEARCH_FOURTH_TEMPLATES = [
  "The scholars worked late into the night, four tomes the richer.",
  "Four pages were illuminated before midnight. The library hummed.",
  "By the fourth tome the candles had burned to stubs. The work continued.",
];

const MINING_TEMPLATES = [
  "The deeprock mine glowed red — the seam ran rich today ({label}).",
  "Picks rang on stone all day at Deeprock. ({label})",
  "Carts rolled out of the mine loaded high. ({label})",
  "Deeprock's lanterns burned overtime — {label} demanded it.",
];

const STORM_TEMPLATES = [
  "A storm rolled in from the east. The kingdom hunkered down.",
  "Black clouds gathered above the hills. Shutters closed across the towns.",
  "The wind picked up at noon and didn't stop. Lanterns were lit early.",
  "Rain came in slanting sheets. The river rose by midday.",
  "Thunder rolled long enough to count the seconds between flashes.",
];

const CELEBRATION_TEMPLATES = [
  "Fireworks lit the sky over {structure}: {label}.",
  "Cheers rose from {structure} — {label}.",
  "{structure} celebrated tonight. The reason: {label}.",
  "A small parade wound through {structure} for {label}.",
];

const FESTIVAL_TEMPLATES = [
  "A festival gathered in {structure} — music and laughter until dawn.",
  "{structure} hosted a feast that ran late into the night.",
  "Banners hung over every street of {structure}. The whole town turned out.",
  "Lanterns were strung corner to corner in {structure}. The mood was bright.",
];

const AIRSHIP_TEMPLATES = [
  "An airship drifted across the kingdom, sails catching the wind.",
  "An airship traced a slow arc above the mountains today.",
  "Children pointed at the sky — an airship sailing east.",
  "An airship passed overhead at noon, low enough to wave at.",
];

const MONSTER_TEMPLATES = [
  "Distant howls echoed from the hills — something dark moved out there.",
  "Tracks were found at the edge of the forest. Larger than a wolf's.",
  "Travelers spoke of yellow eyes by the road last night.",
  "The watch reported strange sounds beyond the southern fields.",
];

function nice(id: string): string {
  // turn "highkeep" into "Highkeep"
  if (!id) return "";
  return id.charAt(0).toUpperCase() + id.slice(1);
}
