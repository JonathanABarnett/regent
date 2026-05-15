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

const MONARCH_DEATH_AGE = 80;
const SUCCESSION_CHECK_DAYS = 1; // check once per in-world day

export interface SuccessionState {
  /** Number of monarchs to date — starts at 1 with the founding ruler. */
  generation: number;
  /** When the current monarch began their reign, in days since founding. */
  reignStartDay: number;
  /** Last in-world day we ran the check. */
  lastCheckedDay: number;
}

/** Picked-up by the player as a "monarchName" change broadcast. */
export interface SuccessionEvent {
  oldName: string;
  newName: string;
  generation: number;
  reignDurationDays: number;
}

export class Succession {
  state: SuccessionState = {
    generation: 1,
    reignStartDay: 1,
    lastCheckedDay: 0,
  };

  /** Listeners — App.tsx subscribes to update identity/HUD/save. */
  private listeners = new Set<(ev: SuccessionEvent) => void>();

  constructor(private world: World, private journal: Journal) {}

  subscribe(fn: (ev: SuccessionEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
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
    if (Math.random() > dieChance) return;

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
      const seed = Math.floor(Math.random() * 2 ** 31);
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

    // Journal a multi-line milestone
    this.journal.write(
      `${oldName} passed peacefully at the age of ${Math.floor(monarch.age ?? 80)}. The kingdom mourns ${reignDuration} days of their reign.`,
      "milestone",
    );
    this.journal.write(
      `${heirName} ascends the throne — the ${ordinal(this.state.generation)} of the line.`,
      "milestone",
    );

    // Notify listeners
    for (const fn of this.listeners) {
      try {
        fn({
          oldName,
          newName: heirName,
          generation: this.state.generation,
          reignDurationDays: reignDuration,
        });
      } catch (err) {
        console.warn("[Succession] listener threw", err);
      }
    }
  }

  private pickHeir(monarch: NPC): NPC | null {
    const adults = this.world.npcs.filter(
      (n) => n !== monarch && (n.age ?? 30) >= 18 && n.role !== "monarch",
    );
    // 1. Born in castle (homeId === monarch's home)
    const inCastle = adults.filter((n) => n.homeId === monarch.homeId);
    if (inCastle.length) {
      // prefer youngest adult (a child of the realm)
      inCastle.sort((a, b) => (a.age ?? 99) - (b.age ?? 99));
      return inCastle[0];
    }
    // 2. Villager or guard
    const civicCandidates = adults.filter(
      (n) => n.role === "villager" || n.role === "guard",
    );
    if (civicCandidates.length) {
      return civicCandidates[Math.floor(Math.random() * civicCandidates.length)];
    }
    // 3. Anyone
    if (adults.length) {
      return adults[Math.floor(Math.random() * adults.length)];
    }
    return null;
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
