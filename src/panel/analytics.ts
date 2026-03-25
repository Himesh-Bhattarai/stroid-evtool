/**
 * @module src/panel/analytics
 * @memberof StroidDevtools
 * @typedef {Record<string, unknown>} ModuleDocShape
 * @what owns Core logic for src/panel/analytics.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Runtime event normalization, UI render paths, or command routing in this module.
 * @param {unknown} [input] Module-level JSDoc anchor for tooling consistency.
 * @returns {void}
 * @public
 */
import { diff, hasDiff, type DiffResult } from "../diff/index.js";
import type { DevtoolEvent } from "../types.js";

export interface FieldHistoryPoint {
  timestamp: number;
  before?: unknown;
  after?: unknown;
}

export interface SubscriptionPoint {
  timestamp: number;
  count: number;
}

export interface StoreAlert {
  level: "warning" | "danger";
  message: string;
}

export interface StoreDiagnostics {
  lastDiff: DiffResult | null;
  fieldHistory: Map<string, FieldHistoryPoint[]>;
  subscriptionHistory: SubscriptionPoint[];
  subscriberIds: string[];
  psrEvents: DevtoolEvent[];
  alerts: StoreAlert[];
  updateTimestamps: number[];
}

export function createStoreDiagnostics(): StoreDiagnostics {
  return {
    lastDiff: null,
    fieldHistory: new Map<string, FieldHistoryPoint[]>(),
    subscriptionHistory: [],
    subscriberIds: [],
    psrEvents: [],
    alerts: [],
    updateTimestamps: [],
  };
}

export function applyDiagnostics(
  current: StoreDiagnostics | undefined,
  event: DevtoolEvent,
  subscriberCount: number,
): StoreDiagnostics {
  const diagnostics = current ? cloneDiagnostics(current) : createStoreDiagnostics();

  if (event.before !== undefined || event.after !== undefined) {
    const result = diff(event.before, event.after);
    diagnostics.lastDiff = hasDiff(result) ? result : diagnostics.lastDiff;

    if (hasDiff(result)) {
      for (const change of result.changes) {
        const key = formatPath(change.path);
        const history = diagnostics.fieldHistory.get(key) ?? [];
        history.push({
          timestamp: event.timestamp,
          before: change.before,
          after: change.after,
        });
        diagnostics.fieldHistory.set(key, history.slice(-12));
      }
    }
  }

  if (event.type === "subscription:added" || event.type === "subscription:removed") {
    diagnostics.subscriptionHistory.push({
      timestamp: event.timestamp,
      count: subscriberCount,
    });
    diagnostics.subscriptionHistory = diagnostics.subscriptionHistory.slice(-20);

    const subscriberId = readSubscriberLabel(event);
    if (subscriberId) {
      diagnostics.subscriberIds =
        event.type === "subscription:added"
          ? unique([...diagnostics.subscriberIds, subscriberId]).slice(-12)
          : diagnostics.subscriberIds.filter((value) => value !== subscriberId);
    }
  }

  if (
    event.type === "store:updated" ||
    event.type.startsWith("async:") ||
    event.type === "dependency:triggered"
  ) {
    diagnostics.updateTimestamps.push(event.timestamp);
    diagnostics.updateTimestamps = diagnostics.updateTimestamps.filter(
      (timestamp) => event.timestamp - timestamp <= 10_000,
    );
  }

  if (event.type.startsWith("psr:")) {
    diagnostics.psrEvents.push(event);
    diagnostics.psrEvents = diagnostics.psrEvents.slice(-6);
  }

  diagnostics.alerts = buildAlerts(diagnostics, event, subscriberCount);
  return diagnostics;
}

function cloneDiagnostics(source: StoreDiagnostics): StoreDiagnostics {
  return {
    lastDiff: source.lastDiff,
    fieldHistory: new Map(
      [...source.fieldHistory.entries()].map(([key, value]) => [key, [...value]]),
    ),
    subscriptionHistory: [...source.subscriptionHistory],
    subscriberIds: [...source.subscriberIds],
    psrEvents: [...source.psrEvents],
    alerts: [...source.alerts],
    updateTimestamps: [...source.updateTimestamps],
  };
}

function buildAlerts(
  diagnostics: StoreDiagnostics,
  event: DevtoolEvent,
  subscriberCount: number,
): StoreAlert[] {
  const alerts: StoreAlert[] = [];
  const lastSecondUpdates = diagnostics.updateTimestamps.filter(
    (timestamp) => event.timestamp - timestamp <= 1_000,
  );

  if (subscriberCount >= 10) {
    alerts.push({
      level: "warning",
      message: `Over-subscription risk: ${subscriberCount} active subscribers.`,
    });
  }

  if (lastSecondUpdates.length >= 5) {
    alerts.push({
      level: "danger",
      message: `Thrashing detected: ${lastSecondUpdates.length} updates in the last second.`,
    });
  }

  if (event.causedBy && event.causedBy === event.storeId) {
    alerts.push({
      level: "danger",
      message: "Loop suspicion: store update reports itself as the cause.",
    });
  }

  return alerts;
}

function formatPath(path: string[]): string {
  return path.length > 0 ? path.join(".") : "root";
}

function readSubscriberLabel(event: DevtoolEvent): string | undefined {
  const meta = event.meta;
  if (!meta) {
    return undefined;
  }

  const candidate =
    (typeof meta.subscriberId === "string" && meta.subscriberId) ||
    (typeof meta.subscriberName === "string" && meta.subscriberName) ||
    (typeof meta.componentName === "string" && meta.componentName);

  return candidate || undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}


