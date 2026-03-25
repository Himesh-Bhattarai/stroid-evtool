import { EventBuffer } from "../buffer/index.js";
import { diff } from "../diff/index.js";
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
import { renderDependencyGraph } from "./graph/index.js";
import {
  buildCauseTrace,
  buildConstraintStates,
  buildDependencyEdges,
  buildDerivedTrace,
  computeStoreHealth,
  findEventById,
} from "./insights.js";
import { renderStoreInspector } from "./inspector/index.js";
import { renderPerformanceView } from "./performance/index.js";
import { renderStoreRegistry } from "./registry/index.js";
import {
  analyzeWhySlow,
  buildPerformanceReport,
  buildSchemaReport,
  compareSnapshots,
  downloadSessionFile,
  exportSession,
  loadSnapshots,
  parseScenarioDefinition,
  runScenarioDefinition,
  saveSnapshot,
} from "./session-tools.js";
import { renderTimeline } from "./timeline/index.js";

type ConnectionState = "connecting" | "connected" | "disconnected";
type RightPanelView = "timeline" | "graph" | "performance";
const STORE_FILTER_ID = "stroid-filter-store";
const DEFAULT_SCENARIO_DRAFT = `{
  "name": "Example scenario",
  "steps": []
}`;

interface PanelState {
  appId: string | null;
  stores: Map<string, StroidStoreSnapshot>;
  diagnostics: Map<string, StoreDiagnostics>;
  selectedStoreId: string | null;
  selectedEventId: string | null;
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
  rightPanelView: RightPanelView;
  snapshotNameDraft: string;
  selectedLeftSnapshotId: string | null;
  selectedRightSnapshotId: string | null;
  scenarioDraft: string;
  scenarioStatus: string | null;
  scenarioLog: string[];
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
    selectedEventId: null,
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
    rightPanelView: "timeline",
    snapshotNameDraft: "",
    selectedLeftSnapshotId: null,
    selectedRightSnapshotId: null,
    scenarioDraft: DEFAULT_SCENARIO_DRAFT,
    scenarioStatus: null,
    scenarioLog: [],
  };

  const clearTimeline = (): void => {
    state.events.clear();
    state.diagnostics = new Map<string, StoreDiagnostics>();
    state.droppedEventCount = 0;
    state.storeFilter = "all";
    state.eventTypeFilter = "all";
    state.selectedEventId = null;
  };

  const focusStoreFilter = (): void => {
    state.rightPanelView = "timeline";
    render();
    window.setTimeout(() => {
      const filter = document.getElementById(STORE_FILTER_ID);
      if (filter instanceof HTMLSelectElement) {
        filter.focus();
      }
    }, 0);
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
      "Phase 4: scenarios, snapshots, performance forensics, schema awareness, and reactive system insight.";

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

    const layout = document.createElement("main");
    layout.className = "layout-grid";

    const stores = [...state.stores.values()];
    const allEvents = state.events.getAll();
    const dependencyEdges = buildDependencyEdges(state.stores, allEvents);
    const snapshots = state.appId ? loadSnapshots(state.appId) : [];
    const leftSnapshot =
      snapshots.find((snapshot) => snapshot.id === state.selectedLeftSnapshotId) ??
      snapshots[0] ??
      null;
    const rightSnapshot =
      snapshots.find((snapshot) => snapshot.id === state.selectedRightSnapshotId) ??
      snapshots[1] ??
      null;
    const snapshotComparison = compareSnapshots(leftSnapshot, rightSnapshot);
    const performanceReport = buildPerformanceReport(stores, allEvents);
    const psrHistory = allEvents.filter((event) => event.type.startsWith("psr:"));

    const topbarRight = document.createElement("div");
    topbarRight.className = "topbar-right";

    const topbarActions = document.createElement("div");
    topbarActions.className = "topbar-actions";

    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.className = "action-button";
    exportButton.textContent = "Export Session";
    exportButton.addEventListener("click", () => {
      if (!state.appId) {
        state.scenarioStatus = "Connect to a runtime before exporting a session.";
        render();
        return;
      }

      const session = exportSession(
        state.appId,
        allEvents,
        snapshots,
        dependencyEdges,
        performanceReport,
        psrHistory,
      );
      downloadSessionFile(state.appId, session);
      state.scenarioStatus = "Session exported.";
      render();
    });

    topbarActions.append(exportButton);
    topbarRight.append(metrics, topbarActions);
    topbar.append(brand, topbarRight);

    const registryColumn = document.createElement("section");
    registryColumn.className = "panel-column";
    renderStoreRegistry(
      registryColumn,
      {
        stores,
        selectedStoreId: state.selectedStoreId,
        connectionState: state.connectionState,
        appId: state.appId,
        diagnosticsByStore: state.diagnostics,
      },
      {
        onSelectStore(storeId) {
          state.selectedStoreId = storeId;
          state.selectedEventId = null;
          render();
        },
        onCommand(command) {
          options.sendCommand(command);
        },
      },
    );

    const liveStore = state.selectedStoreId
      ? state.stores.get(state.selectedStoreId) ?? null
      : null;
    const diagnostics = liveStore
      ? state.diagnostics.get(liveStore.storeId) ?? createStoreDiagnostics()
      : null;
    const snapshotEvent =
      liveStore && state.selectedEventId
        ? findEventById(allEvents, state.selectedEventId)
        : null;
    const selectedStore =
      liveStore && snapshotEvent && snapshotEvent.storeId === liveStore.storeId
        ? buildSnapshotStore(liveStore, snapshotEvent)
        : liveStore;
    const fieldHistory = diagnostics
      ? [...diagnostics.fieldHistory.entries()].map(([path, points]) => ({ path, points }))
      : [];
    const selectedFieldPath = liveStore
      ? state.selectedFieldByStore.get(liveStore.storeId) ?? fieldHistory[0]?.path ?? null
      : null;
    const diffResult =
      snapshotEvent && (snapshotEvent.before !== undefined || snapshotEvent.after !== undefined)
        ? diff(snapshotEvent.before, snapshotEvent.after)
        : diagnostics?.lastDiff ?? null;
    const causeTrace = liveStore ? buildCauseTrace(liveStore.storeId, allEvents) : [];
    const derivedTrace = buildDerivedTrace(liveStore, allEvents);
    const constraints = liveStore ? buildConstraintStates(liveStore.storeId, allEvents) : [];
    const health = liveStore ? computeStoreHealth(liveStore, diagnostics ?? undefined) : null;
    const slowAnalysis = analyzeWhySlow(
      liveStore,
      diagnostics ?? undefined,
      derivedTrace,
      health,
    );
    const schemaReport = buildSchemaReport(liveStore);

    const inspectorColumn = document.createElement("section");
    inspectorColumn.className = "panel-column panel-column--wide";
    renderStoreInspector(inspectorColumn, {
      store: selectedStore,
      liveStore,
      diffResult,
      fieldHistory,
      selectedFieldPath,
      subscriberIds: diagnostics?.subscriberIds ?? [],
      alerts: diagnostics?.alerts ?? [],
      psrEvents: diagnostics?.psrEvents ?? [],
      causeTrace,
      derivedTrace,
      constraints,
      health,
      slowAnalysis,
      schemaReport,
      snapshotEvent,
      snapshots,
      snapshotNameDraft: state.snapshotNameDraft,
      snapshotComparison,
      editDraft:
        liveStore
          ? state.editDrafts.get(liveStore.storeId) ?? safeStringify(liveStore.currentState)
          : "",
      editError: liveStore ? state.editErrors.get(liveStore.storeId) ?? null : null,
      scenarioDraft: state.scenarioDraft,
      scenarioStatus: state.scenarioStatus,
      scenarioLog: state.scenarioLog,
      onDraftChange(value) {
        if (!liveStore) {
          return;
        }

        state.editDrafts.set(liveStore.storeId, value);
        state.editErrors.delete(liveStore.storeId);
      },
      onApplyDraft() {
        if (!liveStore) {
          return;
        }

        try {
          const parsed = JSON.parse(state.editDrafts.get(liveStore.storeId) ?? "null");
          state.editErrors.delete(liveStore.storeId);
          options.sendCommand({
            type: "store:edit",
            storeId: liveStore.storeId,
            state: parsed,
          });
        } catch (error) {
          state.editErrors.set(
            liveStore.storeId,
            error instanceof Error ? error.message : String(error),
          );
        }

        render();
      },
      onSelectField(path) {
        if (!liveStore) {
          return;
        }

        state.selectedFieldByStore.set(liveStore.storeId, path);
        render();
      },
      onClearSnapshot() {
        state.selectedEventId = null;
        render();
      },
      onSnapshotNameChange(value) {
        state.snapshotNameDraft = value;
      },
      onSaveSnapshot() {
        if (!state.appId || stores.length === 0) {
          state.scenarioStatus = "Connect to a runtime before saving snapshots.";
          render();
          return;
        }

        const snapshotName = state.snapshotNameDraft.trim() || `Snapshot ${snapshots.length + 1}`;
        const nextSnapshots = saveSnapshot(state.appId, snapshotName, stores);
        state.snapshotNameDraft = "";
        state.selectedLeftSnapshotId = nextSnapshots[0]?.id ?? null;
        state.selectedRightSnapshotId =
          state.selectedRightSnapshotId ?? nextSnapshots[1]?.id ?? null;
        state.scenarioStatus = `Saved snapshot "${snapshotName}".`;
        render();
      },
      onSelectSnapshot(side, snapshotId) {
        if (side === "left") {
          state.selectedLeftSnapshotId = snapshotId;
        } else {
          state.selectedRightSnapshotId = snapshotId;
        }
        render();
      },
      onRestoreSnapshot(snapshotId) {
        const snapshot = snapshots.find((record) => record.id === snapshotId);
        if (!snapshot) {
          return;
        }

        for (const store of snapshot.stores) {
          options.sendCommand({
            type: "store:edit",
            storeId: store.storeId,
            state: store.currentState,
          });
        }

        state.scenarioStatus = `Restored ${snapshot.name}.`;
        render();
      },
      onScenarioDraftChange(value) {
        state.scenarioDraft = value;
      },
      onRunScenario() {
        try {
          const scenario = parseScenarioDefinition(state.scenarioDraft);
          if (!scenario) {
            state.scenarioStatus = "Enter a scenario definition first.";
            state.scenarioLog = [];
            render();
            return;
          }

          state.scenarioStatus = `Running ${scenario.name}...`;
          state.scenarioLog = [];
          render();

          void runScenarioDefinition(scenario, (command) => {
            options.sendCommand(command);
          })
            .then((result) => {
              state.scenarioStatus = `Ran ${result.name} at ${new Date(result.executedAt).toLocaleTimeString()}.`;
              state.scenarioLog = result.log;
              render();
            })
            .catch((error) => {
              state.scenarioStatus =
                error instanceof Error ? error.message : String(error);
              state.scenarioLog = [];
              render();
            });
        } catch (error) {
          state.scenarioStatus = error instanceof Error ? error.message : String(error);
          state.scenarioLog = [];
          render();
        }
      },
    });

    const rightColumn = document.createElement("section");
    rightColumn.className = "panel-column";

    if (state.rightPanelView === "graph") {
      renderDependencyGraph(rightColumn, {
        stores,
        edges: dependencyEdges,
        selectedStoreId: state.selectedStoreId,
        onSelectStore(storeId) {
          state.selectedStoreId = storeId;
          state.selectedEventId = null;
          render();
        },
        onViewChange(view) {
          state.rightPanelView = view;
          render();
        },
      });
    } else if (state.rightPanelView === "performance") {
      renderPerformanceView(rightColumn, {
        report: performanceReport,
        activeView: state.rightPanelView,
        onViewChange(view) {
          state.rightPanelView = view;
          render();
        },
      });
    } else {
      renderTimeline(rightColumn, {
        events: allEvents,
        selectedStoreId: state.selectedStoreId,
        selectedEventId: state.selectedEventId,
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
          clearTimeline();
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
        onViewChange(view) {
          state.rightPanelView = view;
          render();
        },
        onJumpToEvent(eventId, storeId) {
          state.selectedEventId = eventId;
          if (storeId) {
            state.selectedStoreId = storeId;
          }
          render();
        },
      });
    }

    layout.append(registryColumn, inspectorColumn, rightColumn);
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

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (isTextEntryTarget(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "p") {
      event.preventDefault();
      state.paused = !state.paused;
      render();
      return;
    }

    if (key === "c") {
      event.preventDefault();
      clearTimeline();
      render();
      return;
    }

    if (key === "g") {
      event.preventDefault();
      state.rightPanelView = state.rightPanelView === "graph" ? "timeline" : "graph";
      render();
      return;
    }

    if (key === "f") {
      event.preventDefault();
      focusStoreFilter();
    }
  };

  window.addEventListener("keydown", onKeyDown);
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
      window.removeEventListener("keydown", onKeyDown);
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
    if (state.selectedStoreId === event.storeId) {
      state.selectedStoreId = null;
      state.selectedEventId = null;
    }
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
  return [
    ...new Set([
      ...state.stores.keys(),
      ...state.events
        .getAll()
        .flatMap((event) => (event.storeId ? [event.storeId] : [])),
    ]),
  ].sort();
}

function listEventTypeFilters(state: PanelState): string[] {
  return [...new Set(state.events.getAll().map((event) => event.type))].sort();
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
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

function buildSnapshotStore(
  liveStore: StroidStoreSnapshot,
  event: DevtoolEvent,
): StroidStoreSnapshot {
  return {
    ...liveStore,
    currentState: event.after ?? liveStore.currentState,
    previousState: event.before ?? liveStore.previousState,
    updatedAt: event.timestamp,
    lastEventId: event.id,
  };
}
