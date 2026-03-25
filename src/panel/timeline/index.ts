import type { DevtoolEvent } from "../../types.js";

export interface TimelineRenderModel {
  events: DevtoolEvent[];
  selectedStoreId: string | null;
}

export function renderTimeline(
  container: HTMLElement,
  model: TimelineRenderModel,
): void {
  container.replaceChildren();

  const header = document.createElement("div");
  header.className = "column-header";

  const titleGroup = document.createElement("div");
  titleGroup.className = "column-header-copy";

  const title = document.createElement("h2");
  title.textContent = "Timeline";

  const subtitle = document.createElement("p");
  subtitle.textContent = "Latest 100 runtime events, newest first.";

  titleGroup.append(title, subtitle);

  const count = document.createElement("span");
  count.className = "metric-pill";
  count.textContent = `${model.events.length} events`;

  header.append(titleGroup, count);

  const list = document.createElement("div");
  list.className = "timeline-list";

  const latestEvents = [...model.events]
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 100);

  if (latestEvents.length === 0) {
    list.append(createEmptyState("Timeline stays quiet until the registry emits live events."));
  }

  for (const event of latestEvents) {
    const row = document.createElement("article");
    row.className =
      event.storeId && event.storeId === model.selectedStoreId
        ? "timeline-row timeline-row--selected"
        : "timeline-row";

    const top = document.createElement("div");
    top.className = "timeline-row-top";

    const timestamp = document.createElement("span");
    timestamp.className = "timeline-time";
    timestamp.textContent = formatTime(event.timestamp);

    const store = document.createElement("strong");
    store.textContent = event.storeId ?? "runtime";

    const type = document.createElement("span");
    type.className = "badge badge--muted";
    type.textContent = event.type;

    top.append(timestamp, store, type);

    const bottom = document.createElement("div");
    bottom.className = "timeline-summary";
    bottom.textContent = summarizeEvent(event);

    row.append(top, bottom);

    if (event.causedBy) {
      const cause = document.createElement("p");
      cause.className = "timeline-cause";
      cause.textContent = `caused by ${event.causedBy}`;
      row.append(cause);
    }

    list.append(row);
  }

  container.append(header, list);
}

function createEmptyState(message: string): HTMLDivElement {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function summarizeEvent(event: DevtoolEvent): string {
  const mutatorLabel = event.mutator ? `${event.mutator} • ` : "";

  if (event.after !== undefined || event.before !== undefined) {
    return `${mutatorLabel}${summarizeValue(event.before)} -> ${summarizeValue(event.after)}`;
  }

  if (event.performance?.duration !== undefined) {
    return `${mutatorLabel}${event.performance.duration.toFixed(1)}ms`;
  }

  return `${mutatorLabel}event recorded`;
}

function summarizeValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }

  if (typeof value === "object") {
    return `${Object.keys(value).length} keys`;
  }

  if (typeof value === "string") {
    return value.length > 30 ? `${value.slice(0, 27)}...` : value;
  }

  return String(value);
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  }).format(timestamp);
}
