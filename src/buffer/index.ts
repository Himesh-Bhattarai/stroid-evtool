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
