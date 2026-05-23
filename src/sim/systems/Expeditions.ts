import type { World } from "../World";
import type { Journal } from "./Journal";

/**
 * Expeditions — when an explorable landmark (ruin, standing_stones,
 * obelisk) is discovered or revealed by exploration, fire a decision:
 *
 *   SEND     — dispatch 1-2 guards for 3 in-world days. Returns with
 *              an artifact (~75%), nothing (~20%), or one fewer guard
 *              (~5%, very rare and grim).
 *   IGNORE   — leave it alone. The landmark stays mysterious.
 *
 * Tracks per-landmark-id state so each ruin is only proposed once.
 */

const PROCESSED_CAP = 200;
const COOLDOWN_DAYS = 3;
const EXPLORABLE_KINDS = new Set(["ruin", "standing_stones", "obelisk"]);

const PROMPT_BODIES: Record<string, string> = {
  ruin: "Scouts have reached the ruin of {name}. Stones are tumbled but the entry is open. Send a small expedition to investigate?",
  standing_stones: "The ring of stones at {name} has been mapped. Locals leave it alone. The court could send a party to look more closely.",
  obelisk: "The tall obelisk at {name} bears markings no scholar can identify. An expedition could chart it properly.",
};

const SEND_RESULT_TREASURE: readonly string[] = [
  "The expedition returned from {name} with a relic wrapped in oiled cloth. The scholars are arguing about its origin. They will keep arguing.",
  "Three days at {name}; the party came back with one artifact, two bad jokes, and a story they will tell for years.",
  "They went, they looked, they returned. {name} gave up one of its secrets to the vault.",
];

const SEND_RESULT_EMPTY: readonly string[] = [
  "The expedition to {name} came home with nothing. The place is older than it seems and gave no answers.",
  "Three days at {name}, and {name} kept everything to itself. The party returned tired and empty-handed.",
];

const SEND_RESULT_LOSS: readonly string[] = [
  "The expedition to {name} returned a guard short. They will not say what happened past the second chamber. The lost are noted in the chronicle.",
];

const IGNORE_LINES: readonly string[] = [
  "The crown left {name} undisturbed. Some places prefer to keep their secrets.",
];

export interface ExpeditionSnapshot {
  processedLandmarkIds: string[];
  /** Map landmark id → day expedition was dispatched. Resolution fires after COOLDOWN_DAYS. */
  pending: Record<string, number>;
}

export class Expeditions {
  state: ExpeditionSnapshot = { processedLandmarkIds: [], pending: {} };
  private processed = new Set<string>();

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): ExpeditionSnapshot {
    return {
      processedLandmarkIds: [...this.processed],
      pending: { ...this.state.pending },
    };
  }

  restore(s: ExpeditionSnapshot): void {
    this.processed = new Set(s.processedLandmarkIds);
    this.state.pending = { ...s.pending };
  }

  tick(): void {
    // Resolve any pending expedition that's been out long enough.
    const day = this.world.state.day;
    for (const [id, sentDay] of Object.entries(this.state.pending)) {
      if (day - sentDay >= COOLDOWN_DAYS) {
        this._resolve(id);
        delete this.state.pending[id];
      }
    }

    // Only propose new expeditions when no decision is queued (don't stack).
    if (this.world.decisions.current()) return;

    // Look for an explored landmark we haven't yet processed.
    for (const s of this.world.map.structures) {
      if (!EXPLORABLE_KINDS.has(s.kind)) continue;
      if (this.processed.has(s.id)) continue;
      const tile = this.world.map.tiles[s.pos.y * this.world.map.width + s.pos.x];
      if (!tile?.explored) continue;
      this.processed.add(s.id);
      if (this.processed.size > PROCESSED_CAP) {
        // Drop the oldest entries.
        const arr = [...this.processed];
        this.processed = new Set(arr.slice(-PROCESSED_CAP));
      }
      this._propose(s.id, s.kind, s.name);
      break; // one decision per tick
    }
  }

  private _propose(landmarkId: string, kind: string, name: string): void {
    const body = (PROMPT_BODIES[kind] ?? PROMPT_BODIES.ruin).replace("{name}", name);
    this.world.decisions.propose({
      id: `expedition_${landmarkId}`,
      title: `Expedition: ${name}`,
      body,
      options: [
        {
          id: "send",
          label: "Send a small expedition (3 days)",
          onChoose: (_w) => {
            this.state.pending[landmarkId] = this.world.state.day;
            this.journal.write(
              `An expedition rode out to ${name} this morning. They will be back in three days, or thereabouts.`,
              "event",
              landmarkId,
            );
          },
        },
        {
          id: "ignore",
          label: "Leave it undisturbed",
          onChoose: (_w) => {
            const line = IGNORE_LINES[Math.floor(this.rand() * IGNORE_LINES.length)]
              .replace("{name}", name);
            this.journal.write(line, "event");
          },
        },
      ],
      expiresAt: Date.now() + 120_000,
      defaultOnExpire: false,
    });
  }

  private _resolve(landmarkId: string): void {
    const s = this.world.map.structures.find((x) => x.id === landmarkId);
    const name = s?.name ?? "the landmark";
    const r = this.rand();
    if (r < 0.75) {
      // Treasure!
      this.world.treasury.acquire("treasure", `recovered from an expedition to ${name}`);
      const line = SEND_RESULT_TREASURE[Math.floor(this.rand() * SEND_RESULT_TREASURE.length)]
        .replace(/\{name\}/g, name);
      this.journal.write(line, "milestone", landmarkId);
    } else if (r < 0.95) {
      const line = SEND_RESULT_EMPTY[Math.floor(this.rand() * SEND_RESULT_EMPTY.length)]
        .replace(/\{name\}/g, name);
      this.journal.write(line, "event", landmarkId);
    } else {
      // Lose a guard. Pick the lowest-age guard to keep grizzled veterans alive.
      const guards = this.world.npcs.filter((n) => n.role === "guard");
      if (guards.length > 1) {
        guards.sort((a, b) => (a.age ?? 0) - (b.age ?? 0));
        const lost = guards[0];
        this.world.lifeEvents.warDeath(lost, "the expedition");
      }
      const line = SEND_RESULT_LOSS[Math.floor(this.rand() * SEND_RESULT_LOSS.length)]
        .replace(/\{name\}/g, name);
      this.journal.write(line, "life", landmarkId);
    }
  }
}
