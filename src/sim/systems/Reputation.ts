/**
 * Kingdom Reputation — a lightweight narrative axis from -10 (feared) to +10
 * (beloved), updated by player decisions and used to flavor journal prose.
 *
 * This is intentionally NOT a hard gameplay gate. Reputation nudges the
 * narrative voice — a beloved monarch's crisis entries read warmer, a feared
 * one's read colder — but it never locks the player out of a choice.
 *
 * Score thresholds → descriptors:
 *   +8..+10  beloved
 *   +4..+7   well-regarded
 *   -3..+3   steady
 *   -7..-4   austere
 *  -10..-8   feared
 *
 * The descriptor is embedded in:
 *   - Anniversary milestone entries ("the beloved monarch marked…")
 *   - Usurper challenge text (beloved monarchs get more moderate challenges)
 *   - Narrative Director flavor events (occasionally)
 */

export class Reputation {
  /** Current reputation score. Clamped to [-10, 10]. */
  score = 0;

  /**
   * Shift the reputation score by `delta`. Positive = more benevolent,
   * negative = more feared. Clamped at both ends.
   */
  adjust(delta: number): void {
    this.score = Math.max(-10, Math.min(10, this.score + delta));
  }

  /**
   * A prose descriptor for the current monarch based on reputation.
   * Safe to embed directly in journal sentences.
   */
  descriptor(): string {
    if (this.score >= 8) return "beloved";
    if (this.score >= 4) return "well-regarded";
    if (this.score >= -3) return "steady";
    if (this.score >= -7) return "austere";
    return "feared";
  }

  /**
   * An adjectival phrase for direct use in prose ("the beloved monarch",
   * "the feared crown", etc.).
   */
  monarchPhrase(): string {
    if (this.score >= 8) return "beloved monarch";
    if (this.score >= 4) return "well-regarded crown";
    if (this.score >= -3) return "steady-handed ruler";
    if (this.score >= -7) return "austere sovereign";
    return "feared liege";
  }

  /** Returns true if the kingdom is presently in a positive reputation band. */
  isBenevolent(): boolean {
    return this.score >= 2;
  }

  /** Returns true if the kingdom is presently in a harsh reputation band. */
  isFeared(): boolean {
    return this.score <= -4;
  }

  snapshot(): number {
    return this.score;
  }

  hydrate(raw: unknown): void {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      this.score = Math.max(-10, Math.min(10, Math.round(raw)));
    }
  }
}

// ── Decision reputation deltas (imported by Quests/Usurper/Uprising) ────────

/** Standard rep shifts for common decision archetypes. */
export const REP = {
  /** Generous / welcoming action (+1) */
  generous: 1,
  /** Neutral action (0) */
  neutral: 0,
  /** Pragmatic but not harsh (-0 to +0) */
  pragmatic: 0,
  /** Firm / punitive action (-1) */
  firm: -1,
  /** Harsh / suppressive action (-2) */
  harsh: -2,
} as const;
