import { EventBuffer } from "../buffer/index.js";
import type {
  BridgeEnvelope,
  DevtoolCommand,
  DevtoolEvent,
  RuntimeMode,
  StroidStoreSnapshot,
  StoreStatus,
  StoreType,
} from "../types.js";
import { applyDiagnostics, createStoreDiagnostics, type StoreDiagnostics } from "./analytics.js";
import { renderStoreInspector } from "./inspector/index.js";
import { renderStoreRegistry } from "./registry/index.js";
import { renderTimeline } from "./timeline/index.js";

type ConnectionState = "connecting" | "connected" | "disconnected";

interface PanelState {
  appId: string | null;
  stores: Map<string, StroidStoreSnapshot>;
  diagnostics: Map<string, StoreDiagnostics>;
  selectedStoreId: string | null;
  selectedFieldByStore: Map<string, string>;
  editDrafts: Map<string, string>;
  editErrors: Map<string, string>;
  events: EventBuffer<DevtoolEvent>;
  connectionState: ConnectionState;
  paused: boolean;
  droppedEventCount: number;
  storeFilter: string;
  eventTypeFilter: string;
  mode: RuntimeMode;
}

export interface PanelApp {
  receive(envelope: BridgeEnvelope): void;
  setConnectionState(state: ConnectionState): void;
  destroy(): void;
}

interface MountPanelOptions {
  sendCommand(command: DevtoolCommand): void;
  maxEvents?: number;
}

export function mountDevtoolsPanel(
  root: HTMLElement,
  options: MountPanelOptions,
): PanelApp {
  const state: PanelState = {
    appId: null,
    stores: new Map<string, StroidStoreSnapshot>(),
    diagnostics: new Map<string, StoreDiagnostics>(),
    selectedStoreId: null,
    selectedFieldByStore: new Map<string, string>(),
    editDrafts: new Map<string, string>(),
    editErrors: new Map<string, string>(),
    events: new EventBuffer<DevtoolEvent>(options.maxEvents ?? 5000),
    connectionState: "connecting",
    paused: false,
    droppedEventCount: 0,
    storeFilter: "all",
    eventTypeFilter: "all",
    mode: "debug",
  };

  const render = (): void => {
    root.replaceChildren();

    const shell = document.createElement("div");
    shell.className = "app-shell";

    const topbar = document.createElement("header");
    topbar.className = "app-topbar";

    const brand = document.createElement("div");
    brand.className = "app-brand";

    const heading = document.createElement("h1");
    heading.textContent = "Stroid Devtool";

    const copy = document.createElement("p");
    copy.textContent =
      "Phase 2: structural diff, async diagnostics, live controls, and filtered timeline replay.";

    brand.append(heading, copy);

    const metrics = document.createElement("div");
    metrics.className = "topbar-metrics";
    metrics.append(
      createMetricPill(`${state.stores.size} stores`),
      createMetricPill(`${state.events.getAll().length} events`),
      createMetricPill(`${countAlerts(state)} alerts`),
      createMetricPill(state.mode, "connected"),
      createMetricPill(connectionText(state.connectionState), state.connectionState),
    );

    topbar.append(brand, metrics);

    const layout = document.createElement("main");
    layout.className = "layout-grid";

    const registryColumn = document.createElement("section");
    registryColumn.className = "panel-column";
    renderStoreRegistry(
      registryColumn,
      {
        stores: [...state.stores.values()],
        selectedStoreId: state.selectedStoreId,
        connectionState: state.connectionState,
        appId: state.appId,
        diagnosticsByStore: state.diagnostics,
      },
      {
        onSelectStore(storeId) {
          state.selectedStoreId = storeId;
          render();
        },
        onCommand(command) {
          options.sendCommand(command);
        },
      },
    );

    const selectedStore = state.selectedStoreId
      ? state.stores.get(state.selectedStoreId) ?? null
      : null;
    const diagnostics = selectedStore
      ? state.diagnostics.get(selectedStore.storeId) ?? createStoreDiagnostics()
      : null;
    const fieldHistory = diagnostics
      ? [...diagnostics.fieldHistory.entries()].map(([path, points]) => ({ path, points }))
      : [];
    const selectedFieldPath = selectedStore
      ? state.selectedFieldByStore.get(selectedStore.storeId) ?? fieldHistory[0]?.path ?? null
      : null;

    const inspectorColumn = document.createElement("section");
    inspectorColumn.className = "panel-column panel-column--wide";
    renderStoreInspector(inspectorColumn, {
      store: selectedStore,
      diffResult: diagnostics?.lastDiff ?? null,
      fieldHistory,
      selectedFieldPath,
      subscriberIds: diagnostics?.subscriberIds ?? [],
      alerts: diagnostics?.alerts ?? [],
      psrEvents: diagnostics?.psrEvents ?? [],
      editDraft: selectedStore ? state.editDrafts.get(selectedStore.storeId) ?? safeStringify(selectedStore.currentState) : "",
      editError: selectedStore ? state.editErrors.get(selectedStore.storeId) ?? null : null,
      onDraftChange(value) {
        if (!selectedStore) {
          return;
        }

        state.editDrafts.set(selectedStore.storeId, value);
        state.editErrors.delete(selectedStore.storeId);
      },
      onApplyDraft() {
        if (!selectedStore) {
          return;
        }

        try {
          const parsed = JSON.parse(state.editDrafts.get(selectedStore.storeId) ?? "null");
          state.editErrors.delete(selectedStore.storeId);
          options.sendCommand({
            type: "store:edit",
            storeId: selectedStore.storeId,
            state: parsed,
          });
        } catch (error) {
          state.editErrors.set(
            selectedStore.storeId,
            error instanceof Error ? error.message : String(error),
          );
        }

        render();
      },
      onSelectField(path) {
        if (!selectedStore) {
          return;
        }

        state.selectedFieldByStore.set(selectedStore.storeId, path);
        render();
      },
    });

    const timelineColumn = document.createElement("section");
    timelineColumn.className = "panel-column";
    renderTimeline(timelineColumn, {
      events: state.events.getAll(),
      selectedStoreId: state.selectedStoreId,
      paused: state.paused,
      droppedEventCount: state.droppedEventCount,
      storeFilter: state.storeFilter,
      eventTypeFilter: state.eventTypeFilter,
      availableStores: listStoreFilters(state),
      availableEventTypes: listEventTypeFilters(state),
      mode: state.mode,
      onPauseToggle() {
        state.paused = !state.paused;
        render();
      },
      onClear() {
        state.events.clear();
        state.diagnostics = new Map<string, StoreDiagnostics>();
        state.droppedEventCount = 0;
        state.storeFilter = "all";
        state.eventTypeFilter = "all";
        render();
      },
      onStoreFilterChange(value) {
        state.storeFilter = value;
        render();
      },
      onEventTypeFilterChange(value) {
        state.eventTypeFilter = value;
        render();
      },
      onModeChange(mode) {
        state.mode = mode;
        options.sendCommand({ type: "devtools:set-mode", mode });
        render();
      },
      onReplay(speed) {
        state.mode = "replay";
        options.sendCommand({ type: "devtools:replay", speed });
        render();
      },
    });

    layout.append(registryColumn, inspectorColumn, timelineColumn);
    shell.append(topbar, layout);
    root.append(shell);
  };

  const ensureSelection = (): void => {
    if (state.selectedStoreId && state.stores.has(state.selectedStoreId)) {
      return;
    }

    const firstStore = state.stores.keys().next().value;
    state.selectedStoreId = typeof firstStore === "string" ? firstStore : null;
  };

  render();

  return {
    receive(envelope) {
      state.appId = envelope.appId ?? state.appId;

      if (envelope.type !== "bridge:command") {
        state.connectionState = "connected";
      }

      switch (envelope.type) {
        case "bridge:snapshot":
          state.stores = new Map(
            envelope.stores.map((store) => [store.storeId, store] as const),
          );
          syncDrafts(state);
          ensureSelection();
          break;
        case "bridge:store-patch":
          state.stores.set(
            envelope.store.storeId,
            mergeStorePatch(state.stores.get(envelope.store.storeId), envelope.store),
          );
          ensureDraft(state, envelope.store.storeId);
          ensureSelection();
          break;
        case "bridge:event":
          if (state.paused) {
            state.droppedEventCount += 1;
            applyEvent(state, envelope.event, false);
          } else {
            state.events.push(envelope.event);
            applyEvent(state, envelope.event, true);
          }
          ensureSelection();
          break;
        case "bridge:command":
          break;
      }

      render();
    },

    setConnectionState(nextState) {
      state.connectionState = nextState;
      render();
    },

    destroy() {
      root.replaceChildren();
    },
  };
}

function applyEvent(state: PanelState, event: DevtoolEvent, recordDiagnostics: boolean): void {
  if (!event.storeId) {
    return;
  }

  if (event.type === "store:deleted") {
    state.stores.delete(event.storeId);
    state.diagnostics.delete(event.storeId);
    state.editDrafts.delete(event.storeId);
    state.editErrors.delete(event.storeId);
    state.selectedFieldByStore.delete(event.storeId);
    return;
  }

  const current = state.stores.get(event.storeId);
  const mergedStore = mergeEvent(current, event);
  state.stores.set(event.storeId, mergedStore);
  ensureDraft(state, event.storeId);

  if (!recordDiagnostics) {
    return;
  }

  const nextDiagnostics = applyDiagnostics(
    state.diagnostics.get(event.storeId),
    event,
    mergedStore.subscriberCount,
  );
  state.diagnostics.set(event.storeId, nextDiagnostics);

  if (
    !state.selectedFieldByStore.has(event.storeId) &&
    nextDiagnostics.fieldHistory.size > 0
  ) {
    const firstField = nextDiagnostics.fieldHistory.keys().next().value;
    if (typeof firstField === "string") {
      state.selectedFieldByStore.set(event.storeId, firstField);
    }
  }
}

function mergeStorePatch(
  current: StroidStoreSnapshot | undefined,
  patch: StroidStoreSnapshot,
): StroidStoreSnapshot {
  if (!current) {
    return patch;
  }

  return {
    ...current,
    ...patch,
    async: {
      ...current.async,
      ...patch.async,
    },
    meta: {
      ...current.meta,
      ...patch.meta,
    },
  };
}

function mergeEvent(
  current: StroidStoreSnapshot | undefined,
  event: DevtoolEvent,
): StroidStoreSnapshot {
  const storeType = inferStoreType(current, event);
  const next: StroidStoreSnapshot = current
    ? {
        ...current,
        storeType,
      }
    : {
        storeId: event.storeId ?? "unknown",
        storeType,
        status: "idle",
        subscriberCount: 0,
      };

  next.updatedAt = event.timestamp;
  next.createdAt = next.createdAt ?? event.timestamp;
  next.lastEventId = event.id;
  next.meta = {
    ...next.meta,
    ...event.meta,
  };

  if (event.after !== undefined) {
    next.previousState = event.before ?? next.currentState;
    next.currentState = event.after;
  } else if (event.before !== undefined && next.previousState === undefined) {
    next.previousState = event.before;
  }

  switch (event.type) {
    case "async:start":
      next.status = "loading";
      next.async = {
        ...next.async,
        lastStartedAt: event.timestamp,
        triggerReason:
          typeof event.meta?.triggerReason === "string"
            ? event.meta.triggerReason
            : next.async?.triggerReason,
        cacheSource:
          event.meta?.cacheSource === "cache" || event.meta?.cacheSource === "network"
            ? event.meta.cacheSource
            : next.async?.cacheSource,
        error: undefined,
      };
      break;
    case "async:success":
      next.status = "success";
      next.async = {
        ...next.async,
        duration: event.performance?.duration,
        lastFinishedAt: event.timestamp,
        lastOutcome: "success",
        triggerReason:
          typeof event.meta?.triggerReason === "string"
            ? event.meta.triggerReason
            : next.async?.triggerReason,
        cacheSource:
          event.meta?.cacheSource === "cache" || event.meta?.cacheSource === "network"
            ? event.meta.cacheSource
            : next.async?.cacheSource,
      };
      break;
    case "async:error":
      next.status = "error";
      next.async = {
        ...next.async,
        duration: event.performance?.duration,
        error:
          typeof event.meta?.error === "string"
            ? event.meta.error
            : next.async?.error,
        lastFinishedAt: event.timestamp,
        lastOutcome: "error",
      };
      break;
    case "store:reset":
      next.status = "idle";
      break;
    case "subscription:added":
      next.subscriberCount += 1;
      break;
    case "subscription:removed":
      next.subscriberCount = Math.max(0, next.subscriberCount - 1);
      break;
    default:
      next.status = inferStatus(next.status, event.type);
      break;
  }

  return next;
}

function inferStoreType(
  current: StroidStoreSnapshot | undefined,
  event: DevtoolEvent,
): StoreType {
  const metaType = typeof event.meta?.storeType === "string" ? event.meta.storeType : undefined;
  if (metaType === "sync" || metaType === "async" || metaType === "derived") {
    return metaType;
  }

  if (current?.storeType) {
    return current.storeType;
  }

  if (event.type.startsWith("async:")) {
    return "async";
  }

  return "sync";
}

function inferStatus(current: StoreStatus, eventType: DevtoolEvent["type"]): StoreStatus {
  switch (eventType) {
    case "async:start":
      return "loading";
    case "async:success":
      return "success";
    case "async:error":
      return "error";
    default:
      return current;
  }
}

function createMetricPill(label: string, tone?: ConnectionState): HTMLSpanElement {
  const pill = document.createElement("span");
  pill.className = tone ? `metric-pill metric-pill--${tone}` : "metric-pill";
  pill.textContent = label;
  return pill;
}

function connectionText(state: ConnectionState): string {
  switch (state) {
    case "connected":
      return "Bridge live";
    case "disconnected":
      return "Bridge offline";
    default:
      return "Waiting for bridge";
  }
}

function countAlerts(state: PanelState): number {
  return [...state.diagnostics.values()].reduce((total, diagnostics) => {
    return total + diagnostics.alerts.length;
  }, 0);
}

function listStoreFilters(state: PanelState): string[] {
  return [...new Set([...state.stores.keys(), ...state.events.getAll().flatMap((event) => event.storeId ? [event.storeId] : [])])].sort();
}

function listEventTypeFilters(state: PanelState): string[] {
  return [...new Set(state.events.getAll().map((event) => event.type))].sort();
}

function syncDrafts(state: PanelState): void {
  for (const storeId of state.stores.keys()) {
    ensureDraft(state, storeId);
  }
}

function ensureDraft(state: PanelState, storeId: string): void {
  if (state.editDrafts.has(storeId)) {
    return;
  }

  const store = state.stores.get(storeId);
  if (!store) {
    return;
  }

  state.editDrafts.set(storeId, safeStringify(store.currentState));
}

function safeStringify(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}
