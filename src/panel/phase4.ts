import { diff, summarizeDiff } from "../diff/index.js";
import type { StoreDiagnostics } from "./analytics.js";
import type { DependencyEdge, DerivedTrace, StoreHealthReport } from "./insights.js";
import type { DevtoolCommand, DevtoolEvent, StroidStoreSnapshot } from "../types.js";

const SNAPSHOT_STORAGE_PREFIX = "stroid-devtools:snapshots:";

export interface SnapshotRecord {
  id: string;
  appId: string;
  name: string;
  createdAt: number;
  stores: StroidStoreSnapshot[];
}

export interface SnapshotComparisonStore {
  storeId: string;
  summary: string;
}

export interface SnapshotComparison {
  left: SnapshotRecord;
  right: SnapshotRecord;
  stores: SnapshotComparisonStore[];
}

export interface StorePerformanceMetric {
  storeId: string;
  updatesPerMinute: number;
  averageIntervalMs: number | null;
  asyncP50: number | null;
  asyncP95: number | null;
  subscriberCount: number;
}

export interface GlobalPerformanceMetric {
  totalUpdatesPerSecond: number;
  heaviestStores: Array<{ storeId: string; updates: number }>;
  highestSubscribers: Array<{ storeId: string; subscribers: number }>;
}

export interface PerformanceReport {
  global: GlobalPerformanceMetric;
  stores: StorePerformanceMetric[];
}

export interface SlowAnalysis {
  headline: string;
  reasons: string[];
}

export interface SchemaFieldIssue {
  path: string;
  expected: string;
  actual: string;
}

export interface SchemaReport {
  label: string;
  issues: SchemaFieldIssue[];
}

export interface ExportableSession {
  format: ".stroid-session";
  version: 1;
  exportedAt: number;
  appId: string;
  timeline: DevtoolEvent[];
  snapshots: SnapshotRecord[];
  dependencyGraph: DependencyEdge[];
  performance: PerformanceReport;
  psrHistory: DevtoolEvent[];
}

export interface ScenarioDefinition {
  name: string;
  steps: ScenarioStep[];
}

export type ScenarioStep =
  | {
      label?: string;
      type: "command";
      command: DevtoolCommand;
    }
  | {
      label?: string;
      type: "wait";
      ms: number;
    };

export interface ScenarioRunResult {
  name: string;
  executedAt: number;
  log: string[];
}

export function loadSnapshots(appId: string): SnapshotRecord[] {
  if (typeof localStorage === "undefined") {
    return [];
  }

  const raw = localStorage.getItem(snapshotStorageKey(appId));
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as SnapshotRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSnapshot(
  appId: string,
  name: string,
  stores: StroidStoreSnapshot[],
): SnapshotRecord[] {
  const snapshots = loadSnapshots(appId);
  const record: SnapshotRecord = {
    id: `snapshot_${Date.now()}_${snapshots.length + 1}`,
    appId,
    name,
    createdAt: Date.now(),
    stores: stores.map((store) => ({ ...store })),
  };

  const next = [record, ...snapshots].slice(0, 20);
  persistSnapshots(appId, next);
  return next;
}

export function compareSnapshots(
  left: SnapshotRecord | null,
  right: SnapshotRecord | null,
): SnapshotComparison | null {
  if (!left || !right) {
    return null;
  }

  const storeIds = new Set<string>([
    ...left.stores.map((store) => store.storeId),
    ...right.stores.map((store) => store.storeId),
  ]);

  const stores: SnapshotComparisonStore[] = [];
  for (const storeId of storeIds) {
    const leftStore = left.stores.find((store) => store.storeId === storeId);
    const rightStore = right.stores.find((store) => store.storeId === storeId);
    const result = diff(leftStore?.currentState, rightStore?.currentState);

    stores.push({
      storeId,
      summary: summarizeDiff(result),
    });
  }

  return {
    left,
    right,
    stores,
  };
}

export function buildPerformanceReport(
  stores: StroidStoreSnapshot[],
  events: DevtoolEvent[],
): PerformanceReport {
  const storeMetrics = stores.map((store) => {
    const storeEvents = events
      .filter((event) => event.storeId === store.storeId)
      .sort((left, right) => left.timestamp - right.timestamp);

    const updateEvents = storeEvents.filter((event) => {
      return (
        event.type === "store:updated" ||
        event.type.startsWith("async:") ||
        event.type === "dependency:triggered"
      );
    });

    const intervals: number[] = [];
    for (let index = 1; index < updateEvents.length; index += 1) {
      intervals.push(updateEvents[index].timestamp - updateEvents[index - 1].timestamp);
    }

    const asyncDurations = storeEvents
      .map((event) => event.performance?.duration)
      .filter((value): value is number => typeof value === "number")
      .sort((left, right) => left - right);

    return {
      storeId: store.storeId,
      updatesPerMinute: updateEvents.length * 6,
      averageIntervalMs: average(intervals),
      asyncP50: percentile(asyncDurations, 0.5),
      asyncP95: percentile(asyncDurations, 0.95),
      subscriberCount: store.subscriberCount,
    };
  });

  const latestTimestamp = Math.max(...events.map((event) => event.timestamp), Date.now());
  const updatesLastSecond = events.filter((event) => latestTimestamp - event.timestamp <= 1_000);

  return {
    global: {
      totalUpdatesPerSecond: updatesLastSecond.length,
      heaviestStores: [...storeMetrics]
        .sort((left, right) => right.updatesPerMinute - left.updatesPerMinute)
        .slice(0, 5)
        .map((metric) => ({ storeId: metric.storeId, updates: metric.updatesPerMinute })),
      highestSubscribers: [...storeMetrics]
        .sort((left, right) => right.subscriberCount - left.subscriberCount)
        .slice(0, 5)
        .map((metric) => ({ storeId: metric.storeId, subscribers: metric.subscriberCount })),
    },
    stores: storeMetrics,
  };
}

export function analyzeWhySlow(
  store: StroidStoreSnapshot | null,
  diagnostics: StoreDiagnostics | undefined,
  derivedTrace: DerivedTrace | null,
  health: StoreHealthReport | null,
): SlowAnalysis | null {
  if (!store) {
    return null;
  }

  const reasons: string[] = [];
  const updatesPerMinute = diagnostics ? diagnostics.updateTimestamps.length * 6 : 0;

  if (updatesPerMinute >= 60) {
    reasons.push(`recomputed or updated ${updatesPerMinute} times per minute`);
  }

  if (derivedTrace?.recomputeCost && derivedTrace.recomputeCost > 8) {
    reasons.push(`expensive recompute cost (${derivedTrace.recomputeCost.toFixed(1)}ms)`);
  }

  if (derivedTrace && derivedTrace.inputs.some((input) => input.changed)) {
    const noisyInputs = derivedTrace.inputs
      .filter((input) => input.changed)
      .map((input) => input.name)
      .join(", ");
    reasons.push(`depends on high-churn inputs (${noisyInputs})`);
  }

  if (store.async?.lastOutcome === "error") {
    reasons.push("recent async error caused retries or degraded resolution");
  }

  if ((diagnostics?.alerts.length ?? 0) > 0) {
    reasons.push(`${diagnostics!.alerts.length} active alert conditions`);
  }

  if (health && health.label !== "healthy") {
    reasons.push(...health.reasons);
  }

  if (reasons.length === 0) {
    reasons.push("no obvious slow-path detected from current runtime evidence");
  }

  return {
    headline: `${store.storeId} is ${reasons[0] === "no obvious slow-path detected from current runtime evidence" ? "not obviously slow" : "slow because:"}`,
    reasons,
  };
}

export function buildSchemaReport(store: StroidStoreSnapshot | null): SchemaReport | null {
  if (!store) {
    return null;
  }

  const rawSchema = store.meta?.schema;
  if (!isSchemaNode(rawSchema)) {
    return null;
  }

  const issues: SchemaFieldIssue[] = [];
  walkSchemaIssues(rawSchema, store.currentState, [], issues);

  return {
    label:
      (typeof store.meta?.schemaName === "string" && store.meta.schemaName) ||
      `${store.storeId} schema`,
    issues,
  };
}

export function exportSession(
  appId: string,
  timeline: DevtoolEvent[],
  snapshots: SnapshotRecord[],
  dependencyGraph: DependencyEdge[],
  performance: PerformanceReport,
  psrHistory: DevtoolEvent[],
): string {
  const session: ExportableSession = {
    format: ".stroid-session",
    version: 1,
    exportedAt: Date.now(),
    appId,
    timeline,
    snapshots,
    dependencyGraph,
    performance,
    psrHistory,
  };

  return JSON.stringify(session, null, 2);
}

export function downloadSessionFile(appId: string, session: string): void {
  const blob = new Blob([session], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${appId || "stroid"}.stroid-session`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function parseScenarioDefinition(input: string): ScenarioDefinition | null {
  if (!input.trim()) {
    return null;
  }

  const parsed = JSON.parse(input) as ScenarioDefinition;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.name !== "string" ||
    !Array.isArray(parsed.steps)
  ) {
    throw new Error("Scenario must be an object with name and steps.");
  }

  const steps = parsed.steps.map((step, index) => normalizeScenarioStep(step, index));
  return {
    name: parsed.name,
    steps,
  };
}

export async function runScenarioDefinition(
  definition: ScenarioDefinition,
  sendCommand: (command: DevtoolCommand) => void,
): Promise<ScenarioRunResult> {
  const log: string[] = [];

  for (const step of definition.steps) {
    if (step.type === "wait") {
      log.push(`${step.label ?? "wait"} ${step.ms}ms`);
      await delay(step.ms);
      continue;
    }

    log.push(`${step.label ?? step.command.type}`);
    sendCommand(step.command);
  }

  return {
    name: definition.name,
    executedAt: Date.now(),
    log,
  };
}

function normalizeScenarioStep(step: unknown, index: number): ScenarioStep {
  if (typeof step !== "object" || step === null) {
    throw new Error(`Scenario step ${index + 1} must be an object.`);
  }

  const record = step as Record<string, unknown>;
  if (record.type === "wait" && typeof record.ms === "number") {
    return {
      type: "wait",
      ms: record.ms,
      label: typeof record.label === "string" ? record.label : undefined,
    };
  }

  if (record.type === "command" && typeof record.command === "object" && record.command !== null) {
    return {
      type: "command",
      command: record.command as DevtoolCommand,
      label: typeof record.label === "string" ? record.label : undefined,
    };
  }

  throw new Error(`Scenario step ${index + 1} is not supported.`);
}

function snapshotStorageKey(appId: string): string {
  return `${SNAPSHOT_STORAGE_PREFIX}${appId}`;
}

function persistSnapshots(appId: string, snapshots: SnapshotRecord[]): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(snapshotStorageKey(appId), JSON.stringify(snapshots));
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], ratio: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const index = Math.min(values.length - 1, Math.max(0, Math.floor(values.length * ratio)));
  return values[index] ?? null;
}

function isSchemaNode(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function walkSchemaIssues(
  schemaNode: Record<string, unknown>,
  currentValue: unknown,
  path: string[],
  issues: SchemaFieldIssue[],
): void {
  for (const [key, expected] of Object.entries(schemaNode)) {
    const nextPath = [...path, key];
    const actualValue =
      typeof currentValue === "object" && currentValue !== null
        ? (currentValue as Record<string, unknown>)[key]
        : undefined;

    if (typeof expected === "string") {
      const actualType = actualValue === null ? "null" : typeof actualValue;
      if (actualValue === undefined || actualType !== expected) {
        issues.push({
          path: nextPath.join("."),
          expected,
          actual: actualValue === undefined ? "undefined" : actualType,
        });
      }
      continue;
    }

    if (isSchemaNode(expected)) {
      walkSchemaIssues(expected, actualValue, nextPath, issues);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
