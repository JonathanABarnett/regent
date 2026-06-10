/**
 * Decisions queue — interactive quest popups.
 *
 * The Quests system (or any other) calls `propose(decision)` to ask the
 * player to make a choice. UI subscribes via a callback. When the player
 * picks an option, the decision's `onChoose(choice, world)` runs, which
 * usually publishes an event and/or writes a journal entry.
 *
 * If the player ignores the decision for `expiresInSec`, it auto-defaults
 * to the first option (typically the "send away / decline" path) and
 * surfaces a quiet journal entry — "by silence, the petition was refused."
 */

import type { World } from "../World";

export interface DecisionOption {
  id: string;
  label: string;
  /**
   * Short consequence preview shown beneath the button — e.g.
   * "+2 rep · merchants +1 · -20g". Optional; if absent the button
   * shows just the label. Keeps players from picking blind on big
   * decisions while leaving small ones uncluttered.
   */
  hint?: string;
  onChoose: (world: World) => void;
}

export interface PendingDecision {
  id: string;
  title: string;
  body: string;
  options: DecisionOption[];
  /** when in real-time ms this decision auto-resolves */
  expiresAt: number;
  /** if true the first option triggers on expiry; otherwise nothing */
  defaultOnExpire?: boolean;
  /**
   * Seed for a deterministic pixel portrait of the person behind this
   * decision (rendered by the UI via specFromSeed). Faces are what
   * players attach to — a petitioner with a face is a person, not a
   * paragraph. Omit for impersonal decisions (taxes, portents).
   */
  portraitSeed?: number;
}

/** Stable portrait seed from a display name, for decisions that have a
 *  name but no spawned NPC yet (petitioners, newborn families). */
export function portraitSeedFromName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Decisions {
  private queue: PendingDecision[] = [];
  private listeners = new Set<(current: PendingDecision | null) => void>();
  /**
   * Wall-clock ms at which the sim was paused, or null when running.
   * Decision windows are wall-clock (`expiresAt = Date.now() + N`), so a
   * pause (the guided tutorial, or a manual speed-0) would otherwise let
   * the real clock march past `expiresAt` — burning the player's reading
   * time and auto-resolving the moment they unpause. While frozen we stop
   * the countdown (effectiveNow is pinned) and on unfreeze we shift every
   * queued window forward by exactly the paused duration, so the player
   * gets back every second the pause took.
   */
  private frozenAt: number | null = null;

  constructor(private world: World) {}

  propose(d: PendingDecision) {
    this.queue.push(d);
    this.notify();
  }

  /** Pin the decision clock. Idempotent — safe to call every paused frame. */
  freeze() {
    if (this.frozenAt === null) this.frozenAt = Date.now();
  }

  /**
   * Resume the decision clock, crediting the queued windows with the
   * elapsed paused time. Idempotent — safe to call every running frame.
   */
  unfreeze() {
    if (this.frozenAt === null) return;
    const pausedMs = Date.now() - this.frozenAt;
    this.frozenAt = null;
    if (pausedMs > 0) {
      for (const d of this.queue) d.expiresAt += pausedMs;
      // Push a fresh snapshot so the UI redraws with the shifted window.
      this.notify();
    }
  }

  isFrozen(): boolean {
    return this.frozenAt !== null;
  }

  /**
   * The clock the UI should measure remaining time against — pinned while
   * frozen so the displayed countdown holds steady during a pause.
   */
  effectiveNow(): number {
    return this.frozenAt ?? Date.now();
  }

  resolve(id: string, choiceId: string) {
    const i = this.queue.findIndex((d) => d.id === id);
    if (i < 0) return;
    const d = this.queue[i];
    const opt = d.options.find((o) => o.id === choiceId);
    this.queue.splice(i, 1);
    if (opt) {
      try {
        opt.onChoose(this.world);
      } catch (err) {
        console.warn("[Decisions] onChoose threw", err);
      }
    }
    this.notify();
  }

  /** Called periodically from World.tick to expire abandoned decisions. */
  tick(nowMs: number) {
    // While frozen no real time should count against a decision. World.tick
    // doesn't run when paused, so this normally can't be reached mid-freeze;
    // it's a belt-and-suspenders guard against any stray tick.
    if (this.frozenAt !== null) return;
    let mutated = false;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const d = this.queue[i];
      if (nowMs > d.expiresAt) {
        if (d.defaultOnExpire && d.options.length) {
          try {
            d.options[0].onChoose(this.world);
          } catch (err) {
            console.warn("[Decisions] expiry onChoose threw", err);
          }
        }
        this.queue.splice(i, 1);
        mutated = true;
      }
    }
    if (mutated) this.notify();
  }

  current(): PendingDecision | null {
    return this.queue[0] ?? null;
  }

  subscribe(fn: (current: PendingDecision | null) => void): () => void {
    this.listeners.add(fn);
    fn(this.current());
    return () => this.listeners.delete(fn);
  }

  private notify() {
    const cur = this.current();
    for (const fn of this.listeners) {
      try {
        fn(cur);
      } catch (err) {
        console.warn("[Decisions] listener threw", err);
      }
    }
  }
}
