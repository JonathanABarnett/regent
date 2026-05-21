import type { World } from "../World";
import type { Journal } from "./Journal";
import type { NPC, NPCRole } from "../types";
import { generateName } from "./Names";
import { traitFor } from "./Traits";
import { makeEvent } from "../events/EventSchema";

/**
 * War system — a rival faction launches a sustained assault on the kingdom.
 *
 * Wars feel real because the losses are personal:
 *   - Named NPCs die, starting with guards.
 *   - If no guards remain, civilians are at risk.
 *   - Widowed partners are noted by name. Orphaned children are counted.
 *   - Every death entry is unique prose, not a generic "unit lost" message.
 *
 * The player makes one key strategic decision early in the war:
 *   "Defend the walls"  — lower daily casualties, longer duration (10 days).
 *   "Counter-attack"    — higher casualties, shorter duration (6 days),
 *                         higher victory chance, 2+ prisoners join on win.
 *   "Seek terms"        — ends immediately: gold + reputation cost, no deaths.
 *
 * If the decision window expires (90 seconds), the kingdom defaults to
 * "defend the walls."
 *
 * War triggers after year 2, with a short cooldown between conflicts.
 * Low reputation and unaddressed rival camps increase the likelihood.
 */

// ── Balance constants ────────────────────────────────────────────────────────

const WAR_COOLDOWN_DAYS   = 42;   // in-world days between wars
const WAR_BASE_CHANCE     = 0.012; // ~1.2 % per day in eligible windows
const REPUTATION_PENALTY  = -5;   // rep threshold that boosts war chance

const DEFEND_DURATION     = 10;   // days of active fighting (defend strategy)
const COUNTER_DURATION    = 6;    // days (counter-attack strategy)
const BATTLE_INTERVAL     = 3;    // days between casualty rolls

const GUARD_CHANCE_DEFEND  = 0.22; // per-guard per-battle, defend
const GUARD_CHANCE_COUNTER = 0.35; // per-guard per-battle, counter
const CIVIL_CHANCE         = 0.07; // per civilian when no guards remain
const MAX_CASUALTIES_BATTLE = 2;   // hard cap per single battle roll

const SEEK_TERMS_GOLD_COST  = 45;
const DEFEAT_GOLD_LOSS      = 30;

// ── Faction name pool ─────────────────────────────────────────────────────────
// Pre-generated on war declaration so all entries reference the same name.

const FACTION_NAMES: readonly string[] = [
  "the Ironwall Clans",
  "the Stonefall Confederacy",
  "the Red Marches",
  "the Ashwood League",
  "the Thornwall Brotherhood",
  "the Orevast Raiders",
  "the Greycrown Alliance",
  "the Saltwater Companies",
  "the Hollow Hills faction",
  "the Kestmark Renegades",
  "the Bridgewater Companies",
  "the Ashrock Syndicate",
];

// ── Journal prose pools ───────────────────────────────────────────────────────

const DECLARATION_LINES: readonly string[] = [
  "{faction} has sent an ultimatum. The kingdom declined. The war has begun.",
  "A war drum sounds in the hills. {faction} has declared its intentions.",
  "Scouts report columns advancing under {faction}'s banner. There is no more time for letters.",
  "The frontier posts were attacked before dawn. {faction} has chosen war.",
  "An emissary arrived with a list of demands. The kingdom refused. {faction} now considers itself at war with us.",
  "The border marker was pulled down overnight. {faction} has made their position clear.",
];

const HOLDING_LINES: readonly string[] = [
  "The fighting continues on the eastern road. No losses to report today.",
  "{faction}'s forces probed the walls again at dusk. The watch held.",
  "The battle lines have not moved. The garrison is tired but standing.",
  "{faction} pulled back at nightfall. We held through the dark.",
  "A hard day at the north approach. Nothing taken. Nothing given.",
  "No breakthrough on either side. The kingdom waits.",
  "The enemy tested the south gate at noon and found it held. They withdrew.",
];

const VICTORY_LINES: readonly string[] = [
  "The war is over. {faction} has withdrawn. We count {dead} dead and the kingdom standing. That will have to be enough.",
  "{faction} broke off the assault at dawn. After {days} days of fighting, the kingdom endures. There are no celebrations — only the counting.",
  "{faction} withdrew before sunrise on day {days}. The watch watched them go from the walls, then came down and went about their work. That is what victory looks like.",
  "The war with {faction} is concluded. We held. The cost was {dead} lives and a kingdom that is quieter than it was. We held.",
];

const DEFEAT_LINES: readonly string[] = [
  "{faction} has prevailed. The kingdom yielded terms — {gold} gold and the admission of defeat. The {dead} we lost are gone regardless of the outcome.",
  "We have lost this war. {faction} accepted terms and withdrew. {gold} gold, {dead} lives, and our pride. The kingdom continues, diminished.",
  "The war with {faction} is over. We did not win it. The terms are paid; the dead are counted. The kingdom goes on, as kingdoms must.",
];

const TERMS_LINES: readonly string[] = [
  "The kingdom sought terms before the worst of the fighting. {faction} accepted {gold} gold and withdrew. Some will call it wisdom. Some will call it cowardice. Both are right.",
  "Terms were sent to {faction}. For {gold} gold, the war ends here — before the graves were dug.",
  "A courier rode out to {faction} with an offer. They took the gold and the acknowledgment. The war is over without a battle, and that is its own kind of loss.",
];

// ── War death prose (written by warDeath(), used in LifeEvents) ─────────────

export const WAR_GUARD_DEATH_LINES: readonly string[] = [
  "{name} fell defending the east approach. No ceremony was possible until the fighting stopped.",
  "We found {name} at the gate post before dawn, still facing the road they had held.",
  "{name} did not return from the night watch. The others brought back their shield.",
  "{name} went down in the third push near the mill road. They did not rise.",
  "When the fighting reached the south wall, {name} was the last one standing on that stretch. They are not standing now.",
  "{name} held their position longer than anyone had a right to ask. They held it to the end.",
  "The enemy broke through where {name} stood. They had held it alone for an hour before that.",
  "{name} took a wound early in the battle and stayed at their post anyway. That is the last decision they made.",
  "They found {name} at the wall's base before sunrise. Still holding their post.",
];

export const WAR_CIVILIAN_DEATH_LINES: readonly string[] = [
  "{name} — a {role} — was caught in the fighting near {structure}. The war had no quarrel with them. It came anyway.",
  "{name} was not a soldier. The war did not ask for qualifications.",
  "The fighting found {name} at their work. A {role} should not have to die in a war, and yet.",
  "{name} ran toward the sound of fighting rather than away from it. That was who they were. It killed them.",
  "{name} died protecting their home. The hands that worked as a {role} held a weapon at the end.",
];

export const WAR_GRIEF_ADDENDA: readonly string[] = [
  " {partner} was told at midday. They said nothing until the following dawn.",
  " {partner} has not spoken of it since. The candle they lit that night is still burning.",
  " Their partner, {partner}, sat in the courtyard until the stars came out and was found there in the morning.",
  " {partner} keeps working. It is the only way they know to hold the grief.",
  " {partner} walked to the gate and stood there for an hour. No one interrupted them.",
];

// ── State ─────────────────────────────────────────────────────────────────────

export interface WarSnapshot {
  active: boolean;
  factionName: string;
  startedDay: number;
  daysRemaining: number;
  totalCasualties: number;
  lastBattleDay: number;
  lastCheckedDay: number;
  /** Day the last war ENDED — used for cooldown so it's not confused with lastCheckedDay. */
  lastWarEndedDay: number;
  totalWars: number;
  strategy: "defend" | "counter" | "terms" | null;
  phase: "opening" | "ongoing" | "final";
}

function freshState(): WarSnapshot {
  return {
    active: false,
    factionName: "",
    startedDay: 0,
    daysRemaining: 0,
    totalCasualties: 0,
    lastBattleDay: 0,
    lastCheckedDay: -1,
    lastWarEndedDay: -WAR_COOLDOWN_DAYS, // allow a war to start right at year 2
    totalWars: 0,
    strategy: null,
    phase: "opening",
  };
}

// ── System ────────────────────────────────────────────────────────────────────

export class War {
  state: WarSnapshot = freshState();

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): WarSnapshot { return { ...this.state }; }

  restore(snap: WarSnapshot): void {
    this.state = { ...snap };
  }

  /** Called once per in-world day from World.tick(). */
  tick(): void {
    const day = this.world.state.day;
    if (day === this.state.lastCheckedDay) return;
    this.state.lastCheckedDay = day;

    if (!this.state.active) {
      this._maybeDeclareWar(day);
      return;
    }

    const elapsed = day - this.state.startedDay;

    if (this.state.phase === "opening") {
      // The decision fires separately on the day war is declared.
      // After 1 day we enter the fighting phase.
      if (elapsed >= 1 && this.state.strategy !== null) {
        this.state.phase = "ongoing";
      }
      return;
    }

    if (this.state.phase === "ongoing") {
      this.state.daysRemaining--;

      // Battle roll every BATTLE_INTERVAL days.
      if (day - this.state.lastBattleDay >= BATTLE_INTERVAL) {
        this.state.lastBattleDay = day;
        this._runBattle();
      }

      if (this.state.daysRemaining <= 0) {
        this.state.phase = "final";
        this._resolveWar();
      }
    }
  }

  // ── private ──────────────────────────────────────────────────────────────

  private _maybeDeclareWar(day: number): void {
    if (this.world.state.year < 2) return;
    // Cooldown: use lastWarEndedDay so the check isn't confused with
    // lastCheckedDay (which is reset every tick and would always read 0).
    if (day - this.state.lastWarEndedDay < WAR_COOLDOWN_DAYS) return;

    let chance = WAR_BASE_CHANCE;
    // Feared kingdoms attract aggression.
    if (this.world.reputation.score <= REPUTATION_PENALTY) chance *= 2.2;

    if (this.rand() > chance) return;
    this._startWar(day);
  }

  private _startWar(day: number): void {
    const factionName = FACTION_NAMES[Math.floor(this.rand() * FACTION_NAMES.length)];
    const duration = DEFEND_DURATION; // default; adjusted when decision is resolved

    this.state = {
      ...this.state,
      active: true,
      factionName,
      startedDay: day,
      daysRemaining: duration,
      totalCasualties: 0,
      lastBattleDay: day,
      strategy: null,
      phase: "opening",
      totalWars: this.state.totalWars + 1,
    };

    // Announce declaration.
    const declLine = DECLARATION_LINES[Math.floor(this.rand() * DECLARATION_LINES.length)]
      .replace("{faction}", factionName);
    this.journal.write(declLine, "event");

    // Fire a storm effect to mark the moment on screen.
    this.world.bus.publish(
      makeEvent("storm", { source: "internal", intensity: 0.7, duration_ms: 15_000, payload: {} }),
    );

    // Strategic decision — 90-second window.
    this.world.decisions.propose({
      id: `war_strategy_${day}`,
      title: `War: ${factionName}`,
      body: `${factionName} has launched an assault. How does the kingdom respond?`,
      options: [
        {
          id: "defend",
          label: "Defend the walls",
          onChoose: (w) => {
            this.state.strategy = "defend";
            this.state.daysRemaining = DEFEND_DURATION;
            this.state.phase = "ongoing";
            this.journal.write(
              `The order is given: defend the walls. The guards are assembled and the gates are sealed. The kingdom will hold.`,
              "event",
            );
          },
        },
        {
          id: "counter",
          label: "Counter-attack",
          onChoose: (w) => {
            this.state.strategy = "counter";
            this.state.daysRemaining = COUNTER_DURATION;
            this.state.phase = "ongoing";
            this.journal.write(
              `The decision is made: we go out to meet them. The guards arm and advance. It will be over sooner — one way or another.`,
              "event",
            );
          },
        },
        {
          id: "terms",
          label: `Seek terms (${SEEK_TERMS_GOLD_COST} gold)`,
          onChoose: (w) => {
            this.state.strategy = "terms";
            this._seekTerms();
          },
        },
      ],
      expiresAt: Date.now() + 90_000,
      defaultOnExpire: true, // default to "defend" if ignored
    });
  }

  private _runBattle(): void {
    const { factionName } = this.state;
    const strategy = this.state.strategy ?? "defend";
    const guardChance = strategy === "counter" ? GUARD_CHANCE_COUNTER : GUARD_CHANCE_DEFEND;

    const guards = this.world.npcs.filter((n) => n.role === "guard");
    let casualties = 0;

    // Guards take the first hits.
    for (const guard of guards) {
      if (casualties >= MAX_CASUALTIES_BATTLE) break;
      if (this.rand() < guardChance) {
        this.world.lifeEvents.warDeath(guard, factionName);
        casualties++;
        this.state.totalCasualties++;
      }
    }

    // If no guards remain, civilians are in danger.
    if (casualties === 0 && guards.length === 0) {
      const civilians = this.world.npcs.filter(
        (n) => n.role !== "monarch",
      );
      for (const npc of civilians) {
        if (casualties >= 1) break; // max 1 civilian per battle
        if (this.rand() < CIVIL_CHANCE) {
          this.world.lifeEvents.warDeath(npc, factionName);
          casualties++;
          this.state.totalCasualties++;
        }
      }
    }

    // Battle flavour entry.
    if (casualties === 0) {
      const line = HOLDING_LINES[Math.floor(this.rand() * HOLDING_LINES.length)]
        .replace("{faction}", factionName);
      this.journal.write(line, "event");
    }
    // (Individual death entries are written by warDeath() — no double-entry here.)
  }

  private _resolveWar(): void {
    const { factionName, totalCasualties } = this.state;
    const strategy = this.state.strategy ?? "defend";
    const days = this.world.state.day - this.state.startedDay;

    const guardCount = this.world.npcs.filter((n) => n.role === "guard").length;
    // Win probability: counter-attack has better odds; having guards left helps.
    const winChance =
      (strategy === "counter" ? 0.62 : 0.42) +
      Math.min(0.15, guardCount * 0.04);

    if (this.rand() < winChance) {
      this._victory(factionName, days, totalCasualties);
    } else {
      this._defeat(factionName, days, totalCasualties);
    }

    this.state.active = false;
    this.state.lastWarEndedDay = this.world.state.day;
  }

  private _victory(faction: string, days: number, dead: number): void {
    this.world.reputation.adjust(2);

    // On counter-attack win: 1-2 captured enemies choose to stay.
    if (this.state.strategy === "counter") {
      const count = 1 + Math.floor(this.rand() * 2);
      const roles: NPCRole[] = ["guard", "guard", "villager", "miner"];
      for (let i = 0; i < count; i++) {
        const role = roles[Math.floor(this.rand() * roles.length)];
        const seed = Math.floor(this.rand() * 2 ** 31);
        const name = generateName(role, seed);
        const npc = this._buildPrisoner(role, name, seed);
        if (this.world.pushNpc(npc)) {
          this.journal.write(
            `${name}, taken prisoner in the final assault, has chosen to remain in the kingdom. They seem relieved it is over.`,
            "life",
          );
        }
      }
    }

    const line = VICTORY_LINES[Math.floor(this.rand() * VICTORY_LINES.length)]
      .replace("{faction}", faction)
      .replace("{dead}", String(dead))
      .replace("{days}", String(days));
    this.journal.write(line, "milestone");

    // Brief celebration signal.
    this.world.bus.publish(
      makeEvent("celebration", {
        source: "internal",
        intensity: 0.5,
        duration_ms: 12_000,
        payload: { label: "war over", structure: "highkeep" },
      }),
    );
  }

  private _defeat(faction: string, days: number, dead: number): void {
    const goldLost = Math.min(this.world.economy.state.gold, DEFEAT_GOLD_LOSS);
    this.world.economy.state.gold -= goldLost;
    this.world.reputation.adjust(-3);

    const line = DEFEAT_LINES[Math.floor(this.rand() * DEFEAT_LINES.length)]
      .replace("{faction}", faction)
      .replace("{gold}", String(Math.floor(goldLost)))
      .replace("{dead}", String(dead))
      .replace("{days}", String(days));
    this.journal.write(line, "event");

    // Storm to mark the loss.
    this.world.bus.publish(
      makeEvent("storm", { source: "internal", intensity: 0.8, duration_ms: 20_000, payload: {} }),
    );
  }

  private _seekTerms(): void {
    const { factionName } = this.state;
    const goldPaid = Math.min(this.world.economy.state.gold, SEEK_TERMS_GOLD_COST);
    this.world.economy.state.gold -= goldPaid;
    this.world.reputation.adjust(-2);

    const line = TERMS_LINES[Math.floor(this.rand() * TERMS_LINES.length)]
      .replace("{faction}", factionName)
      .replace("{gold}", String(Math.floor(goldPaid)));
    this.journal.write(line, "event");
    this.state.active = false;
    this.state.lastWarEndedDay = this.world.state.day;
  }

  private _buildPrisoner(role: NPCRole, name: string, seed: number): NPC {
    const homes = this.world.map.structures.filter(
      (s) => s.kind === "town" || s.kind === "castle",
    );
    const home = homes[Math.floor(this.rand() * homes.length)] ?? this.world.map.structures[0];
    const work = this.world.map.structures.find(
      (s) => s.kind === (role === "miner" ? "mine" : "castle"),
    ) ?? home;
    const center = {
      x: home.pos.x + Math.floor(home.size.x / 2),
      y: home.pos.y + Math.floor(home.size.y / 2),
    };
    return {
      id: `npc_prisoner_${seed}_${this.world.state.day}`,
      role,
      name,
      age: 20 + Math.floor(this.rand() * 30),
      trait: traitFor(seed),
      pos: { ...center },
      prevPos: { ...center },
      facing: "s",
      homeId: home.id,
      workId: work.id,
      activity: "idle",
      path: [],
      activityTimer: 1 + this.rand() * 4,
      seed,
    };
  }
}
