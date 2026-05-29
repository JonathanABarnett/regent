/**
 * Construction system — the player can authorize new buildings, watch them
 * rise over N days, and reap their benefits.
 *
 * Architecture:
 *   - Construction.tick() runs once per in-world day.
 *   - When idle, after a cooldown, it proposes a Decision to the player
 *     ("Authorize a watchtower? Costs 30 gold."). The decision's onChoose
 *     starts the build, which then advances daily until complete.
 *   - On completion, a new Structure is appended to the OverworldMap.
 *
 * Choices are deliberately constrained — 3 building kinds, soft cost gates,
 * 1 build at a time — so the player never feels overwhelmed and the kingdom
 * can grow organically across generations.
 */

import type { World } from "../World";
import type { Journal } from "./Journal";
import type { Structure, Vec2 } from "../types";

export type ConstructibleKind = "watchtower" | "mill" | "shrine" | "astronomers_tower";

interface ConstructibleDef {
  kind: ConstructibleKind;
  label: string;
  size: Vec2;
  /** in-world days to complete */
  buildDays: number;
  /** gold cost (deducted on authorization) */
  goldCost: number;
  /** optional ironwork/tome cost */
  ironworkCost?: number;
  tomeCost?: number;
  /** on completion */
  onFinish: (w: World) => void;
  /** marketing-style flavor for the decision body */
  pitch: string;
}

const DEFS: ConstructibleDef[] = [
  {
    kind: "watchtower",
    label: "Watchtower",
    size: { x: 2, y: 2 },
    buildDays: 4,
    goldCost: 30,
    pitch:
      "A stone watchtower at the edge of the kingdom would let the guards see riders three days off.",
    onFinish: (w) => {
      w.journal.write(
        "The watchtower is finished. From its top the guards can see the road for leagues.",
        "milestone",
      );
    },
  },
  {
    kind: "mill",
    label: "Mill",
    size: { x: 2, y: 2 },
    buildDays: 5,
    goldCost: 60,
    ironworkCost: 4,
    pitch:
      "A new mill by the river would speed our grain — fewer hungry days and a calmer winter.",
    onFinish: (w) => {
      w.journal.write(
        "The mill turns for the first time. The bakers will sleep easier.",
        "milestone",
      );
      // Mill bonus: small gold trickle
      w.economy.state.gold = Math.min(99999, w.economy.state.gold + 20);
    },
  },
  {
    kind: "shrine",
    label: "Shrine",
    size: { x: 2, y: 2 },
    buildDays: 7,
    goldCost: 100,
    tomeCost: 3,
    pitch:
      "A quiet shrine in the hills would give the scholars a place to rest their letters.",
    onFinish: (w) => {
      w.journal.write(
        "The shrine is consecrated. Lamps will burn there each dusk from now on.",
        "milestone",
      );
      // Reward: one rare tome artifact
      w.treasury.acquire("tome", "blessed at the new shrine");
    },
  },
  {
    kind: "astronomers_tower",
    label: "Astronomer's Tower",
    size: { x: 2, y: 3 },
    buildDays: 8,
    goldCost: 140,
    tomeCost: 4,
    pitch:
      "A tall tower above the hills, with a copper dome that opens to the sky. The astronomers say the kingdom would learn the names of stars no one has named yet.",
    onFinish: (w) => {
      w.journal.write(
        "The Astronomer's Tower stands finished, its dome turning to the sky. The first night was clear; the chronicler heard a soft 'oh' from the platform an hour past midnight.",
        "milestone",
      );
      w.treasury.acquire("scroll", "the first star-chart drawn at the new tower");
    },
  },
];

interface ActiveBuild {
  kind: ConstructibleKind;
  startedDay: number;
  finishesOnDay: number;
  pos: Vec2;
}

export class Construction {
  active: ActiveBuild | null = null;
  private lastDayChecked = 0;
  private nextProposalDay = 5; // first proposal can fire after day 5

  constructor(private world: World, private journal: Journal) {}

  /** Called from World.tick. Resolves completed builds and proposes new ones. */
  tick() {
    const day = this.world.state.day;
    if (day === this.lastDayChecked) return;
    this.lastDayChecked = day;

    // Finish active build if due
    if (this.active && day >= this.active.finishesOnDay) {
      this.finishBuild(this.active);
      this.active = null;
      this.nextProposalDay = day + 7 + Math.floor(Math.random() * 7);
      return;
    }

    // Propose a new build if idle and cooldown elapsed
    if (!this.active && day >= this.nextProposalDay) {
      this.proposeBuild();
    }
  }

  /** Public for tests / dev-tools — start a build directly. */
  startBuild(def: ConstructibleDef): boolean {
    if (this.active) return false;
    if (this.world.economy.state.gold < def.goldCost) return false;
    if (def.ironworkCost && this.world.economy.state.ironwork < def.ironworkCost) return false;
    if (def.tomeCost && this.world.economy.state.tomes < def.tomeCost) return false;

    const pos = this.pickConstructionSite(def.size);
    if (!pos) return false;

    this.world.economy.state.gold -= def.goldCost;
    if (def.ironworkCost) this.world.economy.state.ironwork -= def.ironworkCost;
    if (def.tomeCost) this.world.economy.state.tomes -= def.tomeCost;

    this.active = {
      kind: def.kind,
      startedDay: this.world.state.day,
      finishesOnDay: this.world.state.day + def.buildDays,
      pos,
    };
    this.journal.write(
      `Construction has begun on ${def.label.toLowerCase()}. It is expected to finish in ${def.buildDays} days.`,
      "milestone",
    );
    return true;
  }

  /**
   * Plain-data list of every constructable, with current affordability —
   * for the player-facing Royal Actions ("Rule") panel. No closures, so
   * it's safe to hand to React. Affordability re-checks live economy
   * state each call.
   */
  listConstructibleOptions(): Array<{
    kind: ConstructibleKind;
    label: string;
    goldCost: number;
    ironworkCost?: number;
    tomeCost?: number;
    buildDays: number;
    pitch: string;
    affordable: boolean;
  }> {
    const econ = this.world.economy.state;
    return DEFS.map((d) => ({
      kind: d.kind,
      label: d.label,
      goldCost: d.goldCost,
      ironworkCost: d.ironworkCost,
      tomeCost: d.tomeCost,
      buildDays: d.buildDays,
      pitch: d.pitch,
      affordable:
        econ.gold >= d.goldCost &&
        (!d.ironworkCost || econ.ironwork >= d.ironworkCost) &&
        (!d.tomeCost || econ.tomes >= d.tomeCost),
    }));
  }

  /**
   * Player-initiated build by kind — looks up the def (with its onFinish
   * closure) internally and routes through startBuild so the UI never has
   * to hold a closure. Returns false if already building, can't afford,
   * or no site is free.
   */
  startBuildByKind(kind: ConstructibleKind): boolean {
    const def = DEFS.find((d) => d.kind === kind);
    if (!def) return false;
    return this.startBuild(def);
  }

  /** Current build status for the Rule panel ("Mill — 3 days left"). */
  activeBuildInfo(): { label: string; daysLeft: number } | null {
    if (!this.active) return null;
    const def = DEFS.find((d) => d.kind === this.active!.kind);
    return {
      label: def?.label ?? this.active.kind,
      daysLeft: Math.max(0, this.active.finishesOnDay - this.world.state.day),
    };
  }

  private proposeBuild() {
    // Pick a def the player can afford
    const affordable = DEFS.filter((d) => {
      if (this.world.economy.state.gold < d.goldCost) return false;
      if (d.ironworkCost && this.world.economy.state.ironwork < d.ironworkCost) return false;
      if (d.tomeCost && this.world.economy.state.tomes < d.tomeCost) return false;
      return true;
    });
    if (!affordable.length) {
      this.nextProposalDay = this.world.state.day + 5;
      return;
    }
    const def = affordable[Math.floor(Math.random() * affordable.length)];
    const costParts: string[] = [`${def.goldCost} gold`];
    if (def.ironworkCost) costParts.push(`${def.ironworkCost} ironwork`);
    if (def.tomeCost) costParts.push(`${def.tomeCost} tomes`);
    const expiresAt = Date.now() + 90_000;

    // Pick the article — "Authorize an Astronomer's Tower?" reads better
    // than "Authorize a Astronomer's Tower?". Cheap heuristic on the
    // first letter of the label.
    const article = /^[aeiouAEIOU]/.test(def.label) ? "an" : "a";
    this.world.decisions.propose({
      id: `build_${def.kind}_${this.world.state.day}`,
      title: `Authorize ${article} ${def.label}?`,
      body: `${def.pitch} (Cost: ${costParts.join(", ")}; ${def.buildDays} days to build.)`,
      expiresAt,
      defaultOnExpire: true,
      options: [
        {
          id: "decline",
          label: "Not yet",
          onChoose: () => {
            // Skip — try again later
            this.nextProposalDay = this.world.state.day + 5;
          },
        },
        {
          id: "approve",
          label: `Build the ${def.label.toLowerCase()}`,
          onChoose: () => {
            if (!this.startBuild(def)) {
              this.journal.write(
                `The crown's coffers ran dry before the ${def.label.toLowerCase()} could begin.`,
                "event",
              );
            }
          },
        },
      ],
    });
  }

  private finishBuild(build: ActiveBuild) {
    const def = DEFS.find((d) => d.kind === build.kind);
    if (!def) return;
    // Make the new structure walkable and append to map
    const id = `${build.kind}_${Math.floor(Date.now() / 1000)}`;
    const structure: Structure = {
      id,
      kind: build.kind as Structure["kind"],
      name: def.label,
      pos: build.pos,
      size: def.size,
    };
    // Mark footprint walkable
    for (let dy = 0; dy < def.size.y; dy++) {
      for (let dx = 0; dx < def.size.x; dx++) {
        const t =
          this.world.map.tiles[(build.pos.y + dy) * this.world.map.width + (build.pos.x + dx)];
        if (t) t.walkable = true;
      }
    }
    this.world.map.structures.push(structure);
    this.world.map.landmarks.set(id, {
      x: build.pos.x + Math.floor(def.size.x / 2),
      y: build.pos.y + Math.floor(def.size.y / 2),
    });
    def.onFinish(this.world);
  }

  private pickConstructionSite(size: Vec2): Vec2 | null {
    const m = this.world.map;
    for (let attempt = 0; attempt < 200; attempt++) {
      const x = 4 + Math.floor(Math.random() * (m.width - size.x - 8));
      const y = 4 + Math.floor(Math.random() * (m.height - size.y - 8));
      // Require plain or hill tiles, no overlap with existing structures
      let ok = true;
      outer: for (let dy = 0; dy < size.y; dy++) {
        for (let dx = 0; dx < size.x; dx++) {
          const t = m.tiles[(y + dy) * m.width + (x + dx)];
          if (!t) { ok = false; break outer; }
          if (t.kind !== "plain" && t.kind !== "hill") { ok = false; break outer; }
        }
      }
      if (!ok) continue;
      // Distance check vs existing structures
      let clashed = false;
      for (const s of m.structures) {
        const dx = s.pos.x - x;
        const dy = s.pos.y - y;
        if (dx * dx + dy * dy < 64) { clashed = true; break; } // 8 tile separation
      }
      if (clashed) continue;
      return { x, y };
    }
    return null;
  }

  hydrate(active: ActiveBuild | null) {
    this.active = active;
  }
}
