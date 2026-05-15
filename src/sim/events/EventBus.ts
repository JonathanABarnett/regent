import type { ExternalEvent } from "./EventSchema";

export type EventHandler = (event: ExternalEvent) => void;

/**
 * Internal pub/sub. Events flow from ambient sources / external integrations
 * → EventBus → World (which interprets and spawns visible activity).
 *
 * UI panels also subscribe so the event log can render the same stream.
 */
export class EventBus {
  private handlers = new Set<EventHandler>();
  private buffer: ExternalEvent[] = [];
  private bufferCap = 200;

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  publish(event: ExternalEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > this.bufferCap) this.buffer.shift();
    for (const h of this.handlers) {
      try {
        h(event);
      } catch (err) {
        console.warn("[EventBus] handler threw", err);
      }
    }
  }

  recent(): readonly ExternalEvent[] {
    return this.buffer;
  }
}
