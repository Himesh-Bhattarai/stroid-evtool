import { diff, hasDiff, summarizeDiff } from "../../diff/index.js";
import type { DevtoolEvent, RuntimeMode } from "../../types.js";

export interface TimelineRenderModel {
  events: DevtoolEvent[];
  selectedStoreId: string | null;
  selectedEventId: string | null;
  paused: boolean;
  droppedEventCount: number;
  storeFilter: string;
  eventTypeFilter: string;
  availableStores: string[];
  availableEventTypes: string[];
  mode: RuntimeMode;
  onPauseToggle(): void;
  onClear(): void;
  onStoreFilterChange(value: string): void;
  onEventTypeFilterChange(value: string): void;
  onModeChange(mode: RuntimeMode): void;
  onReplay(speed: number): void;
  onViewChange(view: "timeline" | "graph" | "performance"): void;
  onJumpToEvent(eventId: string, storeId?: string): void;
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
  subtitle.textContent = "Pause, filter, clear, jump to a snapshot, or switch into graph mode.";

  titleGroup.append(title, subtitle);

  const controls = document.createElement("div");
  controls.className = "timeline-controls";
  controls.append(
    createSelect(
      ["all", ...model.availableStores],
      model.storeFilter,
      "All stores",
      model.onStoreFilterChange,
    ),
    createSelect(
      ["all", ...model.availableEventTypes],
      model.eventTypeFilter,
      "All events",
      model.onEventTypeFilterChange,
    ),
    createActionButton(model.paused ? "Resume" : "Pause", model.onPauseToggle),
    createActionButton("Clear", model.onClear, true),
  );

  header.append(titleGroup, controls);

  const modes = document.createElement("div");
  modes.className = "mode-switcher";
  modes.append(
    createToggleChip("Timeline", true, () => {
      model.onViewChange("timeline");
    }),
    createToggleChip("Graph", false, () => {
      model.onViewChange("graph");
    }),
    createToggleChip("Performance", false, () => {
      model.onViewChange("performance");
    }),
  );

  for (const mode of ["debug", "trace", "freeze", "replay"] as const) {
    modes.append(
      createToggleChip(mode, model.mode === mode, () => {
        model.onModeChange(mode);
      }),
    );
  }

  modes.append(
    createActionButton("Replay x0.5", () => {
      model.onReplay(0.5);
    }),
  );

  const list = document.createElement("div");
  list.className = "timeline-list";

  const filteredEvents = model.events.filter((event) => {
    const matchesStore =
      model.storeFilter === "all" || event.storeId === model.storeFilter;
    const matchesType =
      model.eventTypeFilter === "all" || event.type === model.eventTypeFilter;
    return matchesStore && matchesType;
  });

  const latestEvents = [...filteredEvents]
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 100);

  if (model.paused || model.droppedEventCount > 0) {
    const notice = document.createElement("div");
    notice.className = "phase-note";
    notice.textContent = model.paused
      ? `Recording paused. ${model.droppedEventCount} events skipped while the app kept running.`
      : `${model.droppedEventCount} events were skipped while paused.`;
    list.append(notice);
  }

  if (latestEvents.length === 0) {
    list.append(createEmptyState("Timeline stays quiet until the registry emits live events."));
  }

  for (const event of latestEvents) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = buildRowClass(event, model.selectedStoreId, model.selectedEventId);
    row.addEventListener("click", () => {
      model.onJumpToEvent(event.id, event.storeId);
    });

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

    if (event.after !== undefined || event.before !== undefined) {
      const jumpHint = document.createElement("p");
      jumpHint.className = "timeline-jump";
      jumpHint.textContent = "click to inspect this snapshot";
      row.append(jumpHint);
    }

    list.append(row);
  }

  container.append(header, modes, list);
}

function createEmptyState(message: string): HTMLDivElement {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function summarizeEvent(event: DevtoolEvent): string {
  const mutatorLabel = event.mutator ? `${event.mutator} | ` : "";
  const diffSummary =
    event.before !== undefined || event.after !== undefined
      ? summarizeDiff(diff(event.before, event.after))
      : undefined;

  if (event.after !== undefined || event.before !== undefined) {
    return `${mutatorLabel}${summarizeValue(event.before)} -> ${summarizeValue(event.after)}${diffSummary ? ` (${diffSummary})` : ""}`;
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

function createSelect(
  values: string[],
  selectedValue: string,
  allLabel: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const select = document.createElement("select");
  select.className = "timeline-select";

  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value === "all" ? allLabel : value;
    option.selected = value === selectedValue;
    select.append(option);
  }

  select.addEventListener("change", () => {
    onChange(select.value);
  });

  return select;
}

function createActionButton(
  label: string,
  onClick: () => void,
  ghost = false,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = ghost ? "action-button action-button--ghost" : "action-button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function createToggleChip(
  label: string,
  active: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = active ? "mode-chip mode-chip--active" : "mode-chip";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function buildRowClass(
  event: DevtoolEvent,
  selectedStoreId: string | null,
  selectedEventId: string | null,
): string {
  const classes = ["timeline-row"];

  if (event.storeId && event.storeId === selectedStoreId) {
    classes.push("timeline-row--selected");
  }

  if (event.id === selectedEventId) {
    classes.push("timeline-row--snapshot");
  }

  if (event.type === "devtool:override") {
    classes.push("timeline-row--override");
  }

  if (event.type === "psr:blocked") {
    classes.push("timeline-row--blocked");
  }

  if (
    (event.before !== undefined || event.after !== undefined) &&
    hasDiff(diff(event.before, event.after))
  ) {
    classes.push("timeline-row--changed");
  }

  return classes.join(" ");
}
