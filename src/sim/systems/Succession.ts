/**
 * Royal succession — when the monarch ages past a threshold and dies,
 * an heir is chosen and ascends the throne. The kingdom continues; the
 * journal records the moment as a milestone; achievements unlock for
 * crossing dynasty milestones.
 *
 * Heir selection priority:
 *   1. A born-in-kingdom child whose home is the castle (lineage feels right)
 *   2. Any villager/guard adult living in the castle
 *   3. Any villager/guard adult anywhere
 *   4. If no candidate exists, generate one (no kingdom should collapse over
 *      a procgen edge case)
 *
 * Each succession bumps a counter so the player can see "the 3rd of their
 * line" etc.
 */

import type { World } from "../World";
import type { Journal } from "./Journal";
import type { NPC } from "../types";
import { generateName } from "./Names";
import { writeMonarchLegacy, type ReignSummary, type LegacyContext } from "./MonarchLegacy";

const MONARCH_DEATH_AGE = 80;
const SUCCESSION_CHECK_DAYS = 1; // check once per in-world day

export interface SuccessionState {
  /** Number of monarchs to date — starts at 1 with the founding ruler. */
  generation: number;
  /** When the current monarch began their reign, in days since founding. */
  reignStartDay: number;
  /** Last in-world day we ran the check. */
  lastCheckedDay: number;
  /**
   * Consecutive natural successions without a usurper or uprising break.
   * Starts at 0 (founding monarch is the dynasty's root, not a successor).
   * Increments each time a biological/standard heir ascends naturally.
   * Resets to 0 when a usurper or uprising installs a new line.
   */
  dynastyStreak: number;
}

/** Picked-up by the player as a "monarchName" change broadcast. */
export interface SuccessionEvent {
  oldName: string;
  newName: string;
  generation: number;
  reignDurationDays: number;
  /** How the previous monarch left the throne. */
  context?: LegacyContext;
  /** Structured reign summary for the capstone modal (absent on legacy saves). */
  summary?: ReignSummary;
}

export class Succession {
  state: SuccessionState = {
    generation: 1,
    reignStartDay: 1,
    lastCheckedDay: 0,
    dynastyStreak: 0,
  };

  /** Listeners — App.tsx subscribes to update identity/HUD/save. */
  private listeners = new Set<(ev: SuccessionEvent) => void>();

  constructor(
    private world: World,
    private journal: Journal,
    /** Seeded RNG — so a given seed always kills + succeeds the same way. */
    private rand: () => number = Math.random,
  ) {}

  subscribe(fn: (ev: SuccessionEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Broadcast a succession event to all subscribers. Called by the Usurper
   * and Uprising systems when they install a new monarch, so the HUD and
   * identity store update to the new name without coupling those systems
   * directly to the store.
   */
  announceSuccession(ev: SuccessionEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(ev);
      } catch (err) {
        console.warn("[Succession] listener threw", err);
      }
    }
  }

  /** Called from World.tick once per sim tick — runs lazily on day change. */
  tick() {
    const day = this.world.state.day;
    if (day === this.state.lastCheckedDay) return;
    if (day - this.state.lastCheckedDay < SUCCESSION_CHECK_DAYS) return;
    this.state.lastCheckedDay = day;

    const monarch = this.world.npcs.find((n) => n.role === "monarch");
    if (!monarch) return;

    // Roll death once the monarch passes the threshold. Soft increasing chance
    // so it's not a hard wall — feels more like natural aging.
    const age = monarch.age ?? 30;
    if (age < MONARCH_DEATH_AGE) return;
    const dieChance = Math.min(0.15, (age - MONARCH_DEATH_AGE) * 0.02 + 0.02);
    if (this.rand() > dieChance) return;

    this.succeed(monarch);
  }

  private succeed(monarch: NPC) {
    const oldName = monarch.name ?? "the monarch";
    const oldHome = monarch.homeId;

    // Find an heir
    const heir = this.pickHeir(monarch);
    let heirName: string;
    let heirAge: number;

    if (heir) {
      heirName = heir.name ?? generateName("monarch", heir.seed);
      heirAge = heir.age ?? 25;
      // Reassign the heir's role to monarch (they vacate their old life).
      heir.role = "monarch";
      heir.workId = oldHome;
      heir.homeId = oldHome;
      // Position them at the castle door
      const castle = this.world.map.structures.find((s) => s.id === oldHome);
      if (castle) {
        heir.pos = {
          x: castle.pos.x + Math.floor(castle.size.x / 2),
          y: castle.pos.y + Math.floor(castle.size.y / 2),
        };
        heir.prevPos = { ...heir.pos };
      }
    } else {
      // Generate one from scratch
      const seed = Math.floor(this.rand() * 2 ** 31);
      heirName = generateName("monarch", seed);
      heirAge = 22;
      const castle = this.world.map.structures.find((s) => s.id === oldHome);
      if (castle) {
        const center = {
          x: castle.pos.x + Math.floor(castle.size.x / 2),
          y: castle.pos.y + Math.floor(castle.size.y / 2),
        };
        const created: NPC = {
          id: `npc_monarch_g${this.state.generation + 1}`,
          role: "monarch",
          name: heirName,
          age: heirAge,
          pos: { ...center },
          prevPos: { ...center },
          facing: "s",
          homeId: oldHome,
          workId: oldHome,
          activity: "idle",
          path: [],
          activityTimer: 4,
          seed,
        };
        this.world.pushNpc(created);
      }
    }

    // Remove the old monarch NPC.
    const idx = this.world.npcs.findIndex((n) => n.id === monarch.id);
    if (idx >= 0) this.world.npcs.splice(idx, 1);

    // Update state
    const reignDuration = this.world.state.day - this.state.reignStartDay;
    this.state.generation += 1;
    this.state.reignStartDay = this.world.state.day;
    // Natural succession extends the unbroken dynasty line.
    this.state.dynastyStreak += 1;

    // Legacy scroll — chronicles the full reign before announcing the successor.
    const summary = writeMonarchLegacy(
      this.world,
      oldName,
      reignDuration,
      this.world.state.year - Math.max(1, Math.floor(reignDuration / 56)),
      "natural",
    );

    this.journal.write(
      `${heirName} ascends the throne — the ${ordinal(this.state.generation)} of the line.`,
      "milestone",
    );

    // Notify listeners (HUD, identity store, the Reign Summary capstone modal).
    this.announceSuccession({
      oldName,
      newName: heirName,
      generation: this.state.generation,
      reignDurationDays: reignDuration,
      context: "natural",
      summary,
    });
  }

  /**
   * Returns the current heir apparent (if any) — used by the HUD and
   * Family Tree panel. Biological children of the monarch, eldest first.
   */
  currentHeir(): NPC | null {
    const monarch = this.world.npcs.find((n) => n.role === "monarch");
    if (!monarch) return null;
    const children = this.world.npcs.filter(
      (n) => n.parentIds?.includes(monarch.id) && (n.age ?? 0) >= 16,
    );
    if (!children.length) return null;
    children.sort((a, b) => (b.age ?? 0) - (a.age ?? 0)); // eldest first
    return children[0];
  }

  private pickHeir(monarch: NPC): NPC | null {
    const adults = this.world.npcs.filter(
      (n) => n !== monarch && (n.age ?? 30) >= 16 && n.role !== "monarch",
    );
    // 1. Biological children of the monarch (named heirs) — eldest first.
    const bloodline = adults
      .filter((n) => n.parentIds?.includes(monarch.id))
      .sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
    if (bloodline.length) return bloodline[0];
    // 2. Anyone who lives in the castle (close associate of the crown).
    const inCastle = adults.filter((n) => n.homeId === monarch.homeId);
    if (inCastle.length) {
      inCastle.sort((a, b) => (a.age ?? 99) - (b.age ?? 99));
      return inCastle[0];
    }
    // 3. Villager or guard from anywhere.
    const civicCandidates = adults.filter(
      (n) => n.role === "villager" || n.role === "guard",
    );
    if (civicCandidates.length) {
      return civicCandidates[Math.floor(this.rand() * civicCandidates.length)];
    }
    // 4. Anyone.
    if (adults.length) {
      return adults[Math.floor(this.rand() * adults.length)];
    }
    return null;
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
