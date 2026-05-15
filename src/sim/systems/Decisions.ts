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
}

export class Decisions {
  private queue: PendingDecision[] = [];
  private listeners = new Set<(current: PendingDecision | null) => void>();

  constructor(private world: World) {}

  propose(d: PendingDecision) {
    this.queue.push(d);
    this.notify();
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
