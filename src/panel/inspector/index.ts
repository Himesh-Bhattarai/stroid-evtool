/**
 * @module src/panel/inspector/index
 * @memberof StroidDevtools
 * @typedef {Record<string, unknown>} ModuleDocShape
 * @what owns Core logic for src/panel/inspector/index.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Runtime event normalization, UI render paths, or command routing in this module.
 * @param {unknown} [input] Module-level JSDoc anchor for tooling consistency.
 * @returns {void}
 * @public
 */
import type { DiffResult } from "../../diff/index.js";
import type { FieldHistoryPoint, StoreAlert } from "../analytics.js";
import type {
  CauseTraceStep,
  ConstraintState,
  DerivedTrace,
  StoreHealthReport,
} from "../insights.js";
import type {
  SchemaReport,
  ScenarioStepResult,
  SlowAnalysis,
  SnapshotComparison,
  SnapshotRecord,
} from "../session-tools.js";
import type { DevtoolEvent, StroidStoreSnapshot } from "../../types.js";

export interface InspectorRenderModel {
  store: StroidStoreSnapshot | null;
  liveStore: StroidStoreSnapshot | null;
  diffResult: DiffResult | null;
  fieldHistory: Array<{ path: string; points: FieldHistoryPoint[] }>;
  selectedFieldPath: string | null;
  subscriberIds: string[];
  alerts: StoreAlert[];
  psrEvents: DevtoolEvent[];
  causeTrace: CauseTraceStep[];
  derivedTrace: DerivedTrace | null;
  constraints: ConstraintState[];
  health: StoreHealthReport | null;
  slowAnalysis: SlowAnalysis | null;
  schemaReport: SchemaReport | null;
  schemaTypeMap: Record<string, string>;
  snapshotEvent: DevtoolEvent | null;
  snapshots: SnapshotRecord[];
  snapshotNameDraft: string;
  snapshotComparison: SnapshotComparison | null;
  stateSearchQuery: string;
  editDraft: string;
  editError: string | null;
  mutatorNameDraft: string;
  mutatorArgsDraft: string;
  mutatorError: string | null;
  scenarioDraft: string;
  scenarioStatus: string | null;
  scenarioLog: string[];
  scenarioSteps: ScenarioStepResult[];
  onDraftChange(value: string): void;
  onApplyDraft(): void;
  onSelectField(path: string): void;
  onClearSnapshot(): void;
  onStateSearchChange(value: string): void;
  onSnapshotNameChange(value: string): void;
  onSaveSnapshot(): void;
  onSelectSnapshot(side: "left" | "right", snapshotId: string): void;
  onRestoreSnapshot(snapshotId: string): void;
  onMutatorNameChange(value: string): void;
  onMutatorArgsChange(value: string): void;
  onRunMutator(): void;
  onScenarioDraftChange(value: string): void;
  onRunScenario(): void;
}

export function renderStoreInspector(
  container: HTMLElement,
  model: InspectorRenderModel,
): void {
  container.replaceChildren();

  const header = document.createElement("div");
  header.className = "column-header";

  const titleGroup = document.createElement("div");
  titleGroup.className = "column-header-copy";

  const title = document.createElement("h2");
  title.textContent = "Store Inspector";

  const subtitle = document.createElement("p");
  subtitle.textContent = model.store
    ? "Structural diff, causal trace, scenarios, snapshots, and direct runtime controls."
    : "Select a store to inspect live runtime state.";

  titleGroup.append(title, subtitle);
  header.append(titleGroup);

  if (!model.store) {
    container.append(
      header,
      createEmptyState("The inspector becomes active when a store is selected."),
    );
    return;
  }

  const toolbar = document.createElement("div");
  toolbar.className = "inspector-toolbar";

  const storeName = document.createElement("strong");
  storeName.className = "inspector-store-name";
  storeName.textContent = model.store.storeId;

  const toolbarActions = document.createElement("div");
  toolbarActions.className = "mode-switcher";

  const searchInput = document.createElement("input");
  searchInput.className = "timeline-select";
  searchInput.placeholder = "Search key/value";
  searchInput.value = model.stateSearchQuery;
  searchInput.addEventListener("input", () => {
    model.onStateSearchChange(searchInput.value);
  });

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "action-button";
  copyButton.textContent = "Copy JSON";
  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(
      JSON.stringify(model.store?.currentState ?? null, null, 2),
    );
  });

  toolbarActions.append(searchInput, copyButton);

  if (model.snapshotEvent) {
    const liveButton = document.createElement("button");
    liveButton.type = "button";
    liveButton.className = "action-button action-button--ghost";
    liveButton.textContent = "Back To Live";
    liveButton.addEventListener("click", () => {
      model.onClearSnapshot();
    });
    toolbarActions.append(liveButton);
  }

  toolbar.append(storeName, toolbarActions);
  container.append(header, toolbar);

  if (model.snapshotEvent) {
    const snapshotBanner = document.createElement("div");
    snapshotBanner.className = "alert-banner alert-banner--warning";
    snapshotBanner.textContent = `Jumped to ${model.snapshotEvent.type} at ${formatTimestamp(model.snapshotEvent.timestamp)}. Inspector is showing a historical snapshot only.`;
    container.append(snapshotBanner);
  }

  if (model.alerts.length > 0) {
    const alerts = document.createElement("div");
    alerts.className = "alert-stack";
    for (const alert of model.alerts) {
      const banner = document.createElement("div");
      banner.className = `alert-banner alert-banner--${alert.level}`;
      banner.textContent = alert.message;
      alerts.append(banner);
    }
    container.append(alerts);
  }

  const metadata = document.createElement("div");
  metadata.className = "metadata-grid";
  metadata.append(
    createMetadataCard("Store Type", model.store.storeType),
    createMetadataCard("Status", model.store.status),
    createMetadataCard("Subscribers", String(model.liveStore?.subscriberCount ?? model.store.subscriberCount)),
    createMetadataCard("Created", formatTimestamp(model.liveStore?.createdAt ?? model.store.createdAt)),
    createMetadataCard("Updated", formatTimestamp(model.liveStore?.updatedAt ?? model.store.updatedAt)),
    createMetadataCard("Last Event", model.liveStore?.lastEventId ?? model.store.lastEventId ?? "n/a"),
  );

  if (model.health) {
    metadata.append(
      createMetadataCard("Health", `${model.health.label} (${model.health.score})`),
      createMetadataCard("Updates / Min", String(model.health.updatesPerMinute)),
    );
  }

  if (model.liveStore?.async?.duration !== undefined) {
    metadata.append(
      createMetadataCard("Async Duration", `${model.liveStore.async.duration.toFixed(1)}ms`),
    );
  }

  if (model.liveStore?.async?.triggerReason) {
    metadata.append(createMetadataCard("Async Trigger", model.liveStore.async.triggerReason));
  }

  if (model.liveStore?.async?.error) {
    metadata.append(createMetadataCard("Async Error", model.liveStore.async.error));
  }

  const currentSection = document.createElement("section");
  currentSection.className = "inspector-section";
  const currentTree = renderValueTree("root", model.store.currentState, {
    path: [],
    selectedFieldPath: model.selectedFieldPath,
    onSelectField: model.onSelectField,
    query: model.stateSearchQuery,
    schemaTypeMap: model.schemaTypeMap,
  });
  currentSection.append(
    createSectionHeading("Current State"),
    currentTree ?? createEmptyState("No current-state paths match the search query."),
  );

  const previousSection = document.createElement("section");
  previousSection.className = "inspector-section";
  const previousTree = renderValueTree("root", model.store.previousState, {
    path: [],
    selectedFieldPath: model.selectedFieldPath,
    onSelectField: model.onSelectField,
    query: model.stateSearchQuery,
    schemaTypeMap: model.schemaTypeMap,
  });
  previousSection.append(
    createSectionHeading("Previous State"),
    previousTree ?? createEmptyState("No previous-state paths match the search query."),
  );

  container.append(
    metadata,
    createCauseTraceSection(model.causeTrace),
    createHealthSection(model.health),
    createSlowAnalysisSection(model.slowAnalysis),
    currentSection,
    previousSection,
    createDiffSection(model.diffResult),
    createFieldHistorySection(model.fieldHistory, model.selectedFieldPath),
    createDerivedTraceSection(model.derivedTrace),
    createConstraintSection(model.constraints, model.psrEvents),
    createSchemaSection(model.schemaReport),
    createSnapshotSection(model),
    createScenarioSection(model),
    createSubscriptionSection(model.liveStore?.subscriberCount ?? model.store.subscriberCount, model.subscriberIds),
    createControlSection(model),
  );
}

function createMetadataCard(label: string, value: string): HTMLDivElement {
  const card = document.createElement("div");
  card.className = "metadata-card";

  const heading = document.createElement("span");
  heading.className = "small-label";
  heading.textContent = label;

  const body = document.createElement("strong");
  body.textContent = value;

  card.append(heading, body);
  return card;
}

function createSectionHeading(label: string): HTMLHeadingElement {
  const heading = document.createElement("h3");
  heading.className = "inspector-heading";
  heading.textContent = label;
  return heading;
}

function createEmptyState(message: string): HTMLDivElement {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function renderValueTree(
  label: string,
  value: unknown,
  options: {
    path: string[];
    selectedFieldPath: string | null;
    onSelectField(path: string): void;
    query: string;
    schemaTypeMap: Record<string, string>;
  },
  depth = 0,
  seen = new WeakSet<object>(),
): HTMLElement | null {
  const normalizedQuery = options.query.trim().toLowerCase();
  const pathLabel = formatPath(options.path);
  const expectedType = options.schemaTypeMap[pathLabel];

  if (value === undefined) {
    if (!matchesQuery(label, "undefined", normalizedQuery, expectedType)) {
      return null;
    }
    return renderLeaf(label, "undefined", options, expectedType);
  }

  if (value === null || typeof value !== "object") {
    const primitive = formatPrimitive(value);
    if (!matchesQuery(label, primitive, normalizedQuery, expectedType)) {
      return null;
    }
    return renderLeaf(label, primitive, options, expectedType);
  }

  if (seen.has(value)) {
    if (!matchesQuery(label, "[Circular]", normalizedQuery, expectedType)) {
      return null;
    }
    return renderLeaf(label, "[Circular]", options, expectedType);
  }

  seen.add(value);

  const details = document.createElement("details");
  details.className = "state-branch";
  details.open = depth < 2;

  const summary = document.createElement("summary");
  summary.className = "state-summary";

  const key = document.createElement("span");
  key.className = "state-key";
  key.textContent = label;

  const shape = document.createElement("span");
  shape.className = "state-tag";
  shape.textContent = describeShape(value);

  summary.append(key, shape);
  if (expectedType) {
    const typeHint = document.createElement("span");
    typeHint.className = "state-tag";
    typeHint.textContent = expectedType;
    summary.append(typeHint);
  }
  details.append(summary);

  const entries = Array.isArray(value)
    ? value.map((entry, index) => [String(index), entry] as const)
    : Object.entries(value);

  if (entries.length === 0) {
    const emptyNode = renderLeaf("empty", Array.isArray(value) ? "[]" : "{}", options);
    if (emptyNode) {
      details.append(emptyNode);
    }

    if (normalizedQuery && !matchesQuery(label, describeShape(value), normalizedQuery, expectedType)) {
      return null;
    }
    return details;
  }

  let hasChild = false;
  for (const [entryLabel, entryValue] of entries) {
    const child = renderValueTree(
      entryLabel,
      entryValue,
      {
        ...options,
        path: [...options.path, entryLabel],
      },
      depth + 1,
      seen,
    );
    if (!child) {
      continue;
    }

    hasChild = true;
    details.append(child);
  }

  if (!hasChild && normalizedQuery && !matchesQuery(label, describeShape(value), normalizedQuery, expectedType)) {
    return null;
  }

  return details;
}

function renderLeaf(
  label: string,
  value: string,
  options: {
    path: string[];
    selectedFieldPath: string | null;
    onSelectField(path: string): void;
  },
  expectedType?: string,
): HTMLButtonElement {
  const row = document.createElement("button");
  row.type = "button";
  row.className =
    formatPath(options.path) === options.selectedFieldPath
      ? "state-leaf state-leaf--selected"
      : "state-leaf";
  row.addEventListener("click", () => {
    options.onSelectField(formatPath(options.path));
  });

  const key = document.createElement("span");
  key.className = "state-key";
  key.textContent = label;

  const body = document.createElement("code");
  body.className = "state-value";
  body.textContent = value;

  row.append(key, body);

  if (expectedType) {
    const hint = document.createElement("span");
    hint.className = "state-tag";
    hint.textContent = expectedType;
    row.append(hint);
  }

  return row;
}

function describeShape(value: object): string {
  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }

  return `${Object.keys(value).length} keys`;
}

function formatPrimitive(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) {
    return "n/a";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(timestamp);
}

function createCauseTraceSection(trace: CauseTraceStep[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "inspector-section";
  section.append(createSectionHeading("Cause Trace"));

  if (trace.length === 0) {
    section.append(createEmptyState("No causal chain available yet for this store."));
    return section;
  }

  const list = document.createElement("div");
  list.className = "cause-list";

  trace.forEach((step, index) => {
    const item = document.createElement("div");
    item.className = "cause-step";
    item.textContent = `${index === 0 ? "now" : "caused by"} ${step.label}`;
    list.append(item);
  });

  section.append(list);
  return section;
}

function createHealthSection(health: StoreHealthReport | null): HTMLElement {
  const section = document.createElement("section");
  section.className = "inspector-section";
  section.append(createSectionHeading("Store Health"));

  if (!health) {
    section.append(createEmptyState("Health is computed once runtime events arrive."));
    return section;
  }

  const score = document.createElement("strong");
  score.className = "field-history-title";
  score.textContent = `${health.label} • score ${health.score}`;

  const reasons = document.createElement("div");
  reasons.className = "badge-row";

  for (const reason of health.reasons.length > 0 ? health.reasons : ["No active health issues."]) {
    reasons.append(createToken(reason));
  }

  section.append(score, reasons);
  return section;
}

function createSlowAnalysisSection(report: SlowAnalysis | null): HTMLElement {
  const section = document.createElement("section");
  section.className = "inspector-section";
  section.append(createSectionHeading("Why Is This Slow?"));

  if (!report) {
    section.append(createEmptyState("Slow analysis appears once runtime evidence is available."));
    return section;
  }

  const headline = document.createElement("strong");
  headline.className = "field-history-title";
  headline.textContent = report.headline;

  const list = document.createElement("div");
  list.className = "badge-row";
  for (const reason of report.reasons) {
    list.append(createToken(reason));
  }

  section.append(headline, list);
  return section;
}

function createDiffSection(result: DiffResult | null): HTMLElement {
  const section = document.createElement("section");
  section.className = "inspector-section";
  section.append(createSectionHeading("Structural Diff"));

  if (!result || result.changes.length === 0) {
    section.append(createEmptyState("No structural changes recorded yet."));
    return section;
  }

  const list = document.createElement("div");
  list.className = "diff-list";

  for (const change of result.changes.slice(0, 12)) {
    const card = document.createElement("div");
    card.className = "diff-card";

    const top = document.createElement("div");
    top.className = "diff-card-top";

    const badge = document.createElement("span");
    badge.className = `badge badge--${diffTone(change.kind)}`;
    badge.textContent = change.kind;

    const path = document.createElement("code");
    path.className = "diff-path";
    path.textContent = formatPath(change.path);

    top.append(badge, path);

    const values = document.createElement("p");
    values.className = "diff-values";
    values.textContent = `${formatPrimitive(change.before)} -> ${formatPrimitive(change.after)}`;

    card.append(top, values);
    list.append(card);
  }

  section.append(list);
  return section;
}

function createFieldHistorySection(
  entries: Array<{ path: string; points: FieldHistoryPoint[] }>,
  selectedFieldPath: string | null,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "inspector-section";
  section.append(createSectionHeading("Field History"));

  if (entries.length === 0) {
    section.append(createEmptyState("Select a changed field to inspect its evolution."));
    return section;
  }

  const active =
    entries.find((entry) => entry.path === selectedFieldPath) ??
    entries[0];

  const title = document.createElement("strong");
  title.className = "field-history-title";
  title.textContent = active.path;

  const rail = document.createElement("div");
  rail.className = "history-rail";

  for (const point of active.points.slice(-8)) {
    const item = document.createElement("div");
    item.className = "history-point";
    item.textContent = `${formatPrimitive(point.before)} -> ${formatPrimitive(point.after)}`;
    rail.append(item);
  }

  section.append(title, rail);
  return section;
}

function createDerivedTraceSection(trace: DerivedTrace | null): HTMLElement {
  const section = document.createElement("section");
  section.className = "inspector-section";
  section.append(createSectionHeading("Derived Trace"));

  if (!trace) {
    section.append(createEmptyState("Derived trace appears for computed stores."));
    return section;
  }

  const expression = document.createElement("code");
  expression.className = "diff-path";
  expression.textContent = trace.expression;

  const inputs = document.createElement("div");
  inputs.className = "badge-row";
  for (const input of trace.inputs.length > 0 ? trace.inputs : [{ name: "runtime input", changed: false }]) {
    inputs.append(createToken(`${input.name}${input.changed ? " changed" : " unchanged"}`));
  }

  const summary = document.createElement("p");
  summary.className = "ghost-copy";
  summary.textContent = `recompute count ${trace.recomputeCount}${trace.recomputeCost !== undefined ? ` • cost ${trace.recomputeCost.toFixed(1)}ms` : ""}`;

  section.append(expression, inputs, summary);
  return section;
}

function createConstraintSection(
  constraints: ConstraintState[],
  events: DevtoolEvent[],
): HTMLElement {
  const section = document.createElement("section");
  section.className = "inspector-section";
  section.append(createSectionHeading("Live Constraints"));

  if (constraints.length === 0) {
    section.append(createEmptyState("No live constraint activity detected for this store."));
    return section;
  }

  const list = document.createElement("div");
  list.className = "diff-list";
  for (const constraint of constraints) {
    const card = document.createElement("div");
    card.className = "diff-card";
    card.textContent = `${constraint.status === "violated" ? "violated" : "ok"} • ${constraint.label} • ${formatTimestamp(constraint.timestamp)}`;
    list.append(card);
  }

  if (events.length > 0) {
    const heatmap = createConstraintHeatmap(events);
    const hint = document.createElement("p");
    hint.className = "ghost-copy";
    hint.textContent = `${events.length} PSR events captured for this store.`;
    section.append(list, heatmap, hint);
    return section;
  }

  section.append(list);
  return section;
}

function createSchemaSection(report: SchemaReport | null): HTMLElement {
  const section = document.createElement("section");
  section.className = "inspector-section";
  section.append(createSectionHeading("Schema Awareness"));

  if (!report) {
    section.append(createEmptyState("Schema labels appear when the runtime exposes store.meta.schema."));
    return section;
  }

  const title = document.createElement("strong");
  title.className = "field-history-title";
  title.textContent = report.label;

  section.append(title);

  if (report.issues.length === 0) {
    section.append(createToken("current state matches schema"));
    return section;
  }

  const list = document.createElement("div");
  list.className = "diff-list";
  for (const issue of report.issues) {
    const item = document.createElement("div");
    item.className = "diff-card";
    item.textContent = `${issue.path} expected ${issue.expected}, got ${issue.actual}`;
    list.append(item);
  }

  section.append(list);
  return section;
}

function createSnapshotSection(model: InspectorRenderModel): HTMLElement {
  const section = document.createElement("section");
  section.className = "inspector-section";
  section.append(createSectionHeading("Snapshot Lab"));

  const controls = document.createElement("div");
  controls.className = "timeline-controls";

  const input = document.createElement("input");
  input.className = "timeline-select";
  input.value = model.snapshotNameDraft;
  input.placeholder = "Snapshot name";
  input.addEventListener("input", () => {
    model.onSnapshotNameChange(input.value);
  });

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "action-button";
  saveButton.textContent = "Save Snapshot";
  saveButton.addEventListener("click", () => {
    model.onSaveSnapshot();
  });

  controls.append(input, saveButton);
  section.append(controls);

  if (model.snapshotComparison) {
    const compare = document.createElement("div");
    compare.className = "diff-card";
    compare.textContent = `${model.snapshotComparison.left.name} vs ${model.snapshotComparison.right.name}`;
    section.append(compare);

    const compareList = document.createElement("div");
    compareList.className = "diff-list";
    for (const store of model.snapshotComparison.stores.slice(0, 8)) {
      const item = document.createElement("div");
      item.className = "diff-card";
      item.textContent = `${store.storeId}: ${store.summary}`;
      compareList.append(item);
    }
    section.append(compareList);
  }

  if (model.snapshots.length === 0) {
    section.append(createEmptyState("Saved snapshots will appear here."));
    return section;
  }

  const list = document.createElement("div");
  list.className = "diff-list";

  for (const snapshot of model.snapshots) {
    const card = document.createElement("div");
    card.className = "diff-card";

    const top = document.createElement("div");
    top.className = "diff-card-top";

    const name = document.createElement("strong");
    name.textContent = snapshot.name;

    const created = document.createElement("span");
    created.className = "badge badge--muted";
    created.textContent = formatTimestamp(snapshot.createdAt);

    top.append(name, created);

    const actions = document.createElement("div");
    actions.className = "badge-row";
    actions.append(
      createSmallAction("Base", () => {
        model.onSelectSnapshot("left", snapshot.id);
      }),
      createSmallAction("Compare", () => {
        model.onSelectSnapshot("right", snapshot.id);
      }),
      createSmallAction("Restore", () => {
        model.onRestoreSnapshot(snapshot.id);
      }),
    );

    card.append(top, actions);
    list.append(card);
  }

  section.append(list);
  return section;
}

function createScenarioSection(model: InspectorRenderModel): HTMLElement {
  const section = document.createElement("section");
  section.className = "inspector-section";
  section.append(createSectionHeading("Scenario Runner"));

  const textarea = document.createElement("textarea");
  textarea.className = "state-editor";
  textarea.value = model.scenarioDraft;
  textarea.spellcheck = false;
  textarea.addEventListener("input", () => {
    model.onScenarioDraftChange(textarea.value);
  });

  const footer = document.createElement("div");
  footer.className = "column-actions";

  const runButton = document.createElement("button");
  runButton.type = "button";
  runButton.className = "action-button";
  runButton.textContent = "Run Scenario";
  runButton.addEventListener("click", () => {
    model.onRunScenario();
  });

  footer.append(runButton);

  section.append(textarea, footer);

  if (model.scenarioStatus) {
    const status = document.createElement("p");
    status.className = "ghost-copy";
    status.textContent = model.scenarioStatus;
    section.append(status);
  }

  if (model.scenarioLog.length > 0) {
    const log = document.createElement("div");
    log.className = "badge-row";
    for (const entry of model.scenarioLog) {
      log.append(createToken(entry));
    }
    section.append(log);
  }

  if (model.scenarioSteps.length > 0) {
    const stepList = document.createElement("div");
    stepList.className = "diff-list";

    for (const step of model.scenarioSteps) {
      const card = document.createElement("div");
      card.className = "diff-card";

      const title = document.createElement("strong");
      title.textContent = step.label;

      const time = document.createElement("p");
      time.className = "ghost-copy";
      time.textContent = `${formatTimestamp(step.startedAt)} -> ${formatTimestamp(step.finishedAt)}`;

      const changes = document.createElement("div");
      changes.className = "badge-row";
      for (const change of step.changes.length > 0 ? step.changes : [{ storeId: "runtime", summary: "no structural changes" }]) {
        changes.append(createToken(`${change.storeId}: ${change.summary}`));
      }

      card.append(title, time, changes);
      stepList.append(card);
    }

    section.append(stepList);
  }

  return section;
}

function createSubscriptionSection(subscriberCount: number, subscriberIds: string[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "inspector-section";
  section.append(createSectionHeading("Subscription Debugging"));

  const summary = document.createElement("p");
  summary.className = "ghost-copy";
  summary.textContent = `${subscriberCount} active subscribers`;

  section.append(summary);

  if (subscriberIds.length === 0) {
    section.append(createEmptyState("Subscriber identities will appear when the runtime emits them."));
    return section;
  }

  const list = document.createElement("div");
  list.className = "badge-row";
  for (const subscriberId of subscriberIds) {
    list.append(createToken(subscriberId));
  }

  section.append(list);
  return section;
}

function createControlSection(model: InspectorRenderModel): HTMLElement {
  const section = document.createElement("section");
  section.className = "inspector-section";
  section.append(createSectionHeading("Control Panel"));

  const textarea = document.createElement("textarea");
  textarea.className = "state-editor";
  textarea.value = model.editDraft;
  textarea.spellcheck = false;
  textarea.addEventListener("input", () => {
    model.onDraftChange(textarea.value);
  });

  const footer = document.createElement("div");
  footer.className = "column-actions";

  const applyButton = document.createElement("button");
  applyButton.type = "button";
  applyButton.className = "action-button";
  applyButton.textContent = "Apply JSON";
  applyButton.addEventListener("click", () => {
    model.onApplyDraft();
  });

  const mutatorInput = document.createElement("input");
  mutatorInput.className = "timeline-select";
  mutatorInput.placeholder = "Mutator name";
  mutatorInput.value = model.mutatorNameDraft;
  mutatorInput.addEventListener("input", () => {
    model.onMutatorNameChange(mutatorInput.value);
  });

  const mutatorArgsInput = document.createElement("input");
  mutatorArgsInput.className = "timeline-select";
  mutatorArgsInput.placeholder = "Mutator args JSON array";
  mutatorArgsInput.value = model.mutatorArgsDraft;
  mutatorArgsInput.addEventListener("input", () => {
    model.onMutatorArgsChange(mutatorArgsInput.value);
  });

  const mutatorButton = document.createElement("button");
  mutatorButton.type = "button";
  mutatorButton.className = "action-button";
  mutatorButton.textContent = "Run Mutator";
  mutatorButton.addEventListener("click", () => {
    model.onRunMutator();
  });

  footer.append(applyButton, mutatorInput, mutatorArgsInput, mutatorButton);

  if (model.editError) {
    const error = document.createElement("p");
    error.className = "control-error";
    error.textContent = model.editError;
    section.append(textarea, footer, error);
    return section;
  }

  if (model.mutatorError) {
    const error = document.createElement("p");
    error.className = "control-error";
    error.textContent = model.mutatorError;
    section.append(textarea, footer, error);
    return section;
  }

  section.append(textarea, footer);
  return section;
}

function createToken(label: string): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className = "badge badge--muted";
  badge.textContent = label;
  return badge;
}

function createSmallAction(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mode-chip";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function diffTone(kind: "added" | "removed" | "modified"): "success" | "error" | "loading" {
  switch (kind) {
    case "added":
      return "success";
    case "removed":
      return "error";
    default:
      return "loading";
  }
}

function formatPath(path: string[]): string {
  return path.length > 0 ? path.join(".") : "root";
}

function matchesQuery(
  key: string,
  value: string,
  query: string,
  expectedType?: string,
): boolean {
  if (!query) {
    return true;
  }

  const haystack = `${key} ${value} ${expectedType ?? ""}`.toLowerCase();
  return haystack.includes(query);
}

function createConstraintHeatmap(events: DevtoolEvent[]): HTMLElement {
  const heatmap = document.createElement("div");
  heatmap.className = "constraint-heatmap";

  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.type !== "psr:blocked") {
      continue;
    }

    const labels =
      readStringArray(event.meta?.violations) ??
      readStringArray(event.meta?.constraints) ??
      [event.type];

    for (const label of labels) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  const rows = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);

  if (rows.length === 0) {
    heatmap.append(createEmptyState("No constraint violations captured yet."));
    return heatmap;
  }

  const max = Math.max(...rows.map((entry) => entry[1]), 1);
  for (const [label, count] of rows) {
    const row = document.createElement("div");
    row.className = "constraint-heat-row";

    const text = document.createElement("span");
    text.className = "small-label";
    text.textContent = label;

    const rail = document.createElement("div");
    rail.className = "constraint-heat-rail";

    const fill = document.createElement("div");
    fill.className = "constraint-heat-fill";
    fill.style.width = `${Math.max(10, (count / max) * 100)}%`;

    const countLabel = document.createElement("span");
    countLabel.className = "badge badge--error";
    countLabel.textContent = String(count);

    rail.append(fill);
    row.append(text, rail, countLabel);
    heatmap.append(row);
  }

  return heatmap;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : null;
}


