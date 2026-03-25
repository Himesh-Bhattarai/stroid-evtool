import { EventBuffer } from "../buffer/index.js";
import type {
  BridgeEnvelope,
  DevtoolCommand,
  DevtoolEvent,
  StroidStoreSnapshot,
  StoreStatus,
  StoreType,
} from "../types.js";
import { renderStoreInspector } from "./inspector/index.js";
import { renderStoreRegistry } from "./registry/index.js";
import { renderTimeline } from "./timeline/index.js";

type ConnectionState = "connecting" | "connected" | "disconnected";

interface PanelState {
  appId: string | null;
  stores: Map<string, StroidStoreSnapshot>;
  selectedStoreId: string | null;
  events: EventBuffer<DevtoolEvent>;
  connectionState: ConnectionState;
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
    selectedStoreId: null,
    events: new EventBuffer<DevtoolEvent>(options.maxEvents ?? 5000),
    connectionState: "connecting",
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
      "Phase 1 MVP: registry inspector, live state view, and mutation timeline.";

    brand.append(heading, copy);

    const metrics = document.createElement("div");
    metrics.className = "topbar-metrics";
    metrics.append(
      createMetricPill(`${state.stores.size} stores`),
      createMetricPill(`${state.events.getAll().length} events`),
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

    const inspectorColumn = document.createElement("section");
    inspectorColumn.className = "panel-column panel-column--wide";
    renderStoreInspector(inspectorColumn, {
      store: state.selectedStoreId ? state.stores.get(state.selectedStoreId) ?? null : null,
    });

    const timelineColumn = document.createElement("section");
    timelineColumn.className = "panel-column";
    renderTimeline(timelineColumn, {
      events: state.events.getAll(),
      selectedStoreId: state.selectedStoreId,
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
          ensureSelection();
          break;
        case "bridge:store-patch":
          state.stores.set(
            envelope.store.storeId,
            mergeStorePatch(state.stores.get(envelope.store.storeId), envelope.store),
          );
          ensureSelection();
          break;
        case "bridge:event":
          state.events.push(envelope.event);
          applyEvent(state, envelope.event);
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

function applyEvent(state: PanelState, event: DevtoolEvent): void {
  if (!event.storeId) {
    return;
  }

  if (event.type === "store:deleted") {
    state.stores.delete(event.storeId);
    return;
  }

  const current = state.stores.get(event.storeId);
  state.stores.set(event.storeId, mergeEvent(current, event));
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
        error: undefined,
      };
      break;
    case "async:success":
      next.status = "success";
      next.async = {
        ...next.async,
        duration: event.performance?.duration,
        lastFinishedAt: event.timestamp,
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
