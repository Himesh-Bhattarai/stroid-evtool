import type { StoreDiagnostics } from "./analytics.js";
import type { DevtoolEvent, StroidStoreSnapshot } from "../types.js";

export interface DependencyEdge {
  from: string;
  to: string;
  count: number;
  kind: "dependency" | "causal";
}

export interface CauseTraceStep {
  label: string;
  kind: "store" | "mutation" | "psr";
  timestamp?: number;
}

export interface DerivedTrace {
  expression: string;
  inputs: Array<{ name: string; changed: boolean }>;
  recomputeCost?: number;
  recomputeCount: number;
}

export interface ConstraintState {
  label: string;
  status: "ok" | "violated";
  timestamp: number;
}

export interface StoreHealthReport {
  label: "healthy" | "watch" | "unstable";
  score: number;
  reasons: string[];
  sparkline: number[];
  updatesPerMinute: number;
}

export function buildDependencyEdges(
  stores: Map<string, StroidStoreSnapshot>,
  events: DevtoolEvent[],
): DependencyEdge[] {
  const edges = new Map<string, DependencyEdge>();

  for (const event of events) {
    if (!event.storeId) {
      continue;
    }

    const inputs = readStringArray(event.meta?.dependencies) ?? readStringArray(event.meta?.inputs);
    if (inputs) {
      for (const input of inputs) {
        if (!stores.has(input) || input === event.storeId) {
          continue;
        }
        addEdge(edges, input, event.storeId, "dependency");
      }
    }

    if (event.causedBy && stores.has(event.causedBy) && event.causedBy !== event.storeId) {
      addEdge(edges, event.causedBy, event.storeId, "causal");
    }
  }

  return [...edges.values()];
}

export function buildCauseTrace(
  storeId: string,
  events: DevtoolEvent[],
  limit = 6,
): CauseTraceStep[] {
  const sorted = [...events].sort((left, right) => right.timestamp - left.timestamp);
  const visited = new Set<string>();
  const trace: CauseTraceStep[] = [];
  let currentStoreId: string | undefined = storeId;
  let currentTimestamp = Number.POSITIVE_INFINITY;

  while (currentStoreId && trace.length < limit) {
    const event = sorted.find((candidate) => {
      return candidate.storeId === currentStoreId && candidate.timestamp <= currentTimestamp;
    });

    if (!event || visited.has(event.id)) {
      break;
    }

    visited.add(event.id);
    trace.push({
      label: `${event.storeId} ${event.type}`,
      kind: event.type.startsWith("psr:") ? "psr" : "store",
      timestamp: event.timestamp,
    });

    if (!event.causedBy) {
      if (event.mutator) {
        trace.push({
          label: event.mutator,
          kind: event.type.startsWith("psr:") ? "psr" : "mutation",
          timestamp: event.timestamp,
        });
      }
      break;
    }

    if (!sorted.some((candidate) => candidate.storeId === event.causedBy)) {
      trace.push({
        label: event.causedBy,
        kind: event.causedBy.startsWith("psr") ? "psr" : "mutation",
        timestamp: event.timestamp,
      });
      break;
    }

    currentStoreId = event.causedBy;
    currentTimestamp = event.timestamp - 1;
  }

  return trace;
}

export function buildDerivedTrace(
  store: StroidStoreSnapshot | null,
  events: DevtoolEvent[],
): DerivedTrace | null {
  if (!store || store.storeType !== "derived") {
    return null;
  }

  const relatedEvents = events.filter((event) => event.storeId === store.storeId);
  if (relatedEvents.length === 0) {
    return null;
  }

  const latest = [...relatedEvents].sort((left, right) => right.timestamp - left.timestamp)[0];
  const inputs = readStringArray(latest.meta?.dependencies) ?? readStringArray(latest.meta?.inputs) ?? [];
  const changedInputs = new Set(
    readStringArray(latest.meta?.changedInputs) ??
      (latest.causedBy ? [latest.causedBy] : []),
  );

  return {
    expression:
      (typeof latest.meta?.expression === "string" && latest.meta.expression) ||
      `${store.storeId} = fn(${inputs.join(", ") || "runtime inputs"})`,
    inputs: inputs.map((name) => ({
      name,
      changed: changedInputs.has(name),
    })),
    recomputeCost:
      latest.performance?.duration ??
      (typeof latest.meta?.recomputeCost === "number" ? latest.meta.recomputeCost : undefined),
    recomputeCount: relatedEvents.filter((event) => event.type === "store:updated").length,
  };
}

export function buildConstraintStates(
  storeId: string,
  events: DevtoolEvent[],
): ConstraintState[] {
  const psrEvents = events
    .filter((event) => {
      if (!event.type.startsWith("psr:")) {
        return false;
      }

      if (event.storeId === storeId) {
        return true;
      }

      const stores = readStringArray(event.meta?.stores);
      return stores ? stores.includes(storeId) : false;
    })
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 8);

  return psrEvents.map((event) => {
    const labels =
      readStringArray(event.meta?.constraints) ??
      readStringArray(event.meta?.violations) ??
      (typeof event.meta?.constraint === "string" ? [event.meta.constraint] : [event.type]);

    return {
      label: labels[0] ?? event.type,
      status: event.type === "psr:blocked" ? "violated" : "ok",
      timestamp: event.timestamp,
    };
  });
}

export function computeStoreHealth(
  store: StroidStoreSnapshot,
  diagnostics: StoreDiagnostics | undefined,
): StoreHealthReport {
  const reasons: string[] = [];
  let score = 100;
  const updateTimestamps = diagnostics?.updateTimestamps ?? [];
  const updatesPerMinute = Math.round(updateTimestamps.length * 6);

  if (updatesPerMinute >= 60) {
    score -= 25;
    reasons.push(`high update frequency (${updatesPerMinute}/min)`);
  }

  if (store.subscriberCount >= 10) {
    score -= 15;
    reasons.push(`subscriber pressure (${store.subscriberCount})`);
  }

  if (store.async?.lastOutcome === "error") {
    score -= 20;
    reasons.push("recent async error");
  }

  if ((diagnostics?.alerts.length ?? 0) > 0) {
    score -= diagnostics!.alerts.length * 10;
    reasons.push(`${diagnostics!.alerts.length} active alerts`);
  }

  if (store.storeType === "derived" && store.async?.duration && store.async.duration > 8) {
    score -= 10;
    reasons.push(`expensive derived recompute (${store.async.duration.toFixed(1)}ms)`);
  }

  score = Math.max(0, score);

  return {
    label: score >= 80 ? "healthy" : score >= 55 ? "watch" : "unstable",
    score,
    reasons,
    sparkline: buildSparkline(updateTimestamps),
    updatesPerMinute,
  };
}

export function findEventById(events: DevtoolEvent[], eventId: string | null): DevtoolEvent | null {
  if (!eventId) {
    return null;
  }

  return events.find((event) => event.id === eventId) ?? null;
}

function addEdge(
  edges: Map<string, DependencyEdge>,
  from: string,
  to: string,
  kind: "dependency" | "causal",
): void {
  const key = `${from}->${to}:${kind}`;
  const current = edges.get(key);
  if (current) {
    current.count += 1;
    return;
  }

  edges.set(key, { from, to, count: 1, kind });
}

function buildSparkline(timestamps: number[]): number[] {
  if (timestamps.length === 0) {
    return [0, 0, 0, 0, 0, 0, 0, 0];
  }

  const latest = Math.max(...timestamps);
  const bucketSize = 1_250;
  const buckets = new Array<number>(8).fill(0);

  for (const timestamp of timestamps) {
    const distance = latest - timestamp;
    const bucketIndex = Math.max(0, Math.min(7, 7 - Math.floor(distance / bucketSize)));
    buckets[bucketIndex] += 1;
  }

  return buckets;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : null;
}
