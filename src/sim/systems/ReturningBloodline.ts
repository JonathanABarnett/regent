import type { World } from "../World";
import type { Journal } from "./Journal";
import type { NPC } from "../types";

/**
 * Returning Bloodline — when a usurper or uprising broke the dynasty
 * streak, the deposed line is presumed gone. Years later, a long-lost
 * claimant arrives at the keep claiming to be of the original royal
 * blood. The player decides:
 *
 *   ACCEPT — install them as monarch. Dynasty streak resumes. Large
 *            reputation surge. The current monarch quietly steps aside
 *            and takes a villager role.
 *   DENY   — turn them away. They leave, and the chronicle remembers.
 *            Small reputation hit (some thought they should have been
 *            given a chance).
 *   TEST   — set a riddle / trial / proof challenge. After 5 days, the
 *            answer comes back authentic (70%) or as a clever fake
 *            (30%); the player then ACCEPTs or DENIEs based on outcome.
 *
 * Triggers: dynastyStreak == 0, at least 5 years since the disruption,
 * once per kingdom (can be retried if it expires unanswered).
 */

const MIN_YEARS_AFTER_BREAK = 5;
const CLAIMANT_NAMES = [
  "Aldric", "Belena", "Castor", "Eira", "Hadria", "Joren", "Mirelle",
  "Pelias", "Roen", "Sable", "Tarn", "Vesna",
];

const PROOF_TYPES = [
  "an old signet ring pressed into wax",
  "a fragment of a wedding veil with the royal arms",
  "a chronicle leaf signed by the previous monarch",
  "a particular scar in a particular place that only the family knew",
  "a phrase only the heir would have known",
];

const ARRIVAL_LINES: readonly string[] = [
  "A traveller named {name} has arrived at the keep gates, claiming to be of the royal bloodline that ruled before the break. They carry {proof}. The keep is divided.",
  "{name} of unknown origin arrived this evening, claiming lineage to the throne that fell. They produced {proof}. The chancellor went pale.",
  "An emissary led {name} into the great hall today. They claim to be of the deposed line and offered {proof} in support. The court is silent.",
];

const ACCEPT_LINES: readonly string[] = [
  "By royal decision, {name} has been recognised as the rightful heir and installed upon the throne. The kingdom roared at the news. The dynasty is whole again.",
  "{name} was crowned this morning, restoring the line that was broken. The chronicler wrote the ascension into red ink. The dynasty endures.",
];

const DENY_LINES: readonly string[] = [
  "The crown denied {name}'s claim. They left the keep without quarrel. The chronicler noted the decision and added, quietly, that {name} had walked like nobility.",
  "{name} was turned away. They went without ceremony. The kingdom will remember that they came; some will wonder, for years, whether the claim was true.",
];

const TEST_TRUE_LINES: readonly string[] = [
  "The trial concluded today: {name}'s claim is authentic. The proofs hold. The chronicler has begun a new entry.",
  "Five days of examination ended this morning. {name} answered every challenge correctly. They are who they say.",
];

const TEST_FALSE_LINES: readonly string[] = [
  "The trial ended in {name}'s exposure. The claim was clever but not true. They were sent away under guard.",
  "After five days the proof unravelled. {name}'s claim was a careful fabrication. The chronicler crossed out a name.",
];

export interface BloodlineSnapshot {
  lastFiredYear: number;
  totalFired: number;
  /** While a test is in-flight: day to resolve + claimant info. */
  testPending: {
    name: string;
    proof: string;
    resolveDay: number;
  } | null;
}

function fresh(): BloodlineSnapshot {
  return { lastFiredYear: 0, totalFired: 0, testPending: null };
}

export class ReturningBloodline {
  state: BloodlineSnapshot = fresh();

  constructor(
    private world: World,
    private journal: Journal,
    private rand: () => number,
  ) {}

  snapshot(): BloodlineSnapshot {
    return {
      ...this.state,
      testPending: this.state.testPending ? { ...this.state.testPending } : null,
    };
  }
  restore(s: BloodlineSnapshot): void {
    this.state = {
      ...s,
      testPending: s.testPending ? { ...s.testPending } : null,
    };
  }

  tick(): void {
    // Resolve a pending test first.
    if (this.state.testPending && this.world.state.day >= this.state.testPending.resolveDay) {
      this._resolveTest();
      return;
    }
    if (this.world.decisions.current()) return;

    // Require: dynasty streak broken AND at least MIN years since reset
    // AND not already fired in the same year.
    if (this.world.succession.state.dynastyStreak !== 0) return;
    const year = this.world.state.year;
    if (year - this.state.lastFiredYear < MIN_YEARS_AFTER_BREAK) return;
    // Roll on each year crossing — small chance so it's a surprise.
    if (this.rand() > 0.05) return;
    this.state.lastFiredYear = year;
    this.state.totalFired++;
    this._propose();
  }

  private _propose(): void {
    const name = CLAIMANT_NAMES[Math.floor(this.rand() * CLAIMANT_NAMES.length)];
    const proof = PROOF_TYPES[Math.floor(this.rand() * PROOF_TYPES.length)];
    const intro = ARRIVAL_LINES[Math.floor(this.rand() * ARRIVAL_LINES.length)]
      .replace("{name}", name).replace("{proof}", proof);
    this.journal.write(intro, "milestone");

    this.world.decisions.propose({
      id: `bloodline_${this.world.state.year}_${name}`,
      title: `A claim to the throne: ${name}`,
      body: `${name} arrives claiming to be of the deposed bloodline, bearing ${proof}. The crown must decide.`,
      options: [
        {
          id: "accept",
          label: "Accept the claim — install them as monarch",
          onChoose: (w) => this._installAsMonarch(w, name),
        },
        {
          id: "test",
          label: "Set a trial of proof (5 days)",
          onChoose: (_w) => {
            this.state.testPending = {
              name, proof,
              resolveDay: this.world.state.day + 5,
            };
            this.journal.write(
              `By order of the crown, ${name} will be tested for five days. Scholars, elders, and the keep's own records are convened.`,
              "event",
            );
          },
        },
        {
          id: "deny",
          label: "Deny the claim — send them away",
          onChoose: (w) => {
            w.reputation.adjust(-1);
            const line = DENY_LINES[Math.floor(this.rand() * DENY_LINES.length)]
              .replace("{name}", name);
            this.journal.write(line, "event");
          },
        },
      ],
      expiresAt: Date.now() + 360_000, // 6-minute window — major decision
      defaultOnExpire: false,
    });
  }

  private _resolveTest(): void {
    if (!this.state.testPending) return;
    const { name } = this.state.testPending;
    const authentic = this.rand() < 0.7;
    this.state.testPending = null;
    if (authentic) {
      const line = TEST_TRUE_LINES[Math.floor(this.rand() * TEST_TRUE_LINES.length)]
        .replace("{name}", name);
      this.journal.write(line, "milestone");
      // Auto-install since the trial proved them. The player asked for a test.
      this._installAsMonarch(this.world, name);
    } else {
      const line = TEST_FALSE_LINES[Math.floor(this.rand() * TEST_FALSE_LINES.length)]
        .replace("{name}", name);
      this.journal.write(line, "event");
      this.world.reputation.adjust(1); // the crown's discernment is praised
    }
  }

  private _installAsMonarch(world: World, name: string): void {
    const oldMonarch = world.npcs.find((n) => n.role === "monarch");
    if (!oldMonarch) return;
    // Demote old monarch to villager (they retire).
    oldMonarch.role = "villager";
    oldMonarch.workId = oldMonarch.homeId;
    // Create a fresh monarch with the claimant name.
    const castle = world.map.structures.find((s) => s.kind === "castle");
    if (castle) {
      const center = {
        x: castle.pos.x + Math.floor(castle.size.x / 2),
        y: castle.pos.y + Math.floor(castle.size.y / 2),
      };
      const seed = Math.floor(this.rand() * 2 ** 31);
      const newMonarch: NPC = {
        id: `npc_monarch_bloodline_${seed}`,
        role: "monarch",
        name,
        age: 28,
        pos: { ...center }, prevPos: { ...center },
        facing: "s",
        homeId: castle.id, workId: castle.id,
        activity: "idle", path: [], activityTimer: 4, seed,
      };
      world.pushNpc(newMonarch);
    }
    world.succession.state.generation++;
    world.succession.state.reignStartDay = world.state.day;
    world.succession.state.dynastyStreak = 1; // line is restored, streak resumes
    world.reputation.adjust(5);
    const line = ACCEPT_LINES[Math.floor(this.rand() * ACCEPT_LINES.length)]
      .replace("{name}", name);
    this.journal.write(line, "milestone", castle?.id);
    // Announce the succession for HUD updates.
    world.succession.announceSuccession({
      oldName: oldMonarch.name ?? "the previous monarch",
      newName: name,
      generation: world.succession.state.generation,
      reignDurationDays: 0,
    });
  }
}
