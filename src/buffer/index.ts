/**
 * @module src/buffer/index
 * @memberof StroidDevtools
 * @typedef {Record<string, unknown>} ModuleDocShape
 * @what owns Core logic for src/buffer/index.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Runtime event normalization, UI render paths, or command routing in this module.
 * @param {unknown} [input] Module-level JSDoc anchor for tooling consistency.
 * @returns {void}
 * @public
 */
export class EventBuffer<TEvent> {
  private readonly maxEvents: number;
  private events: TEvent[] = [];

  constructor(maxEvents = 5000) {
    this.maxEvents = maxEvents;
  }

  push(event: TEvent): void {
    if (this.events.length >= this.maxEvents) {
      this.events.shift();
    }

    this.events.push(event);
  }

  getAll(): TEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}


