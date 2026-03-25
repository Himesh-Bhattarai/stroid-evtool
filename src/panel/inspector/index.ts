import type { DiffResult } from "../../diff/index.js";
import type { FieldHistoryPoint, StoreAlert } from "../analytics.js";
import type { DevtoolEvent, StroidStoreSnapshot } from "../../types.js";

export interface InspectorRenderModel {
  store: StroidStoreSnapshot | null;
  diffResult: DiffResult | null;
  fieldHistory: Array<{ path: string; points: FieldHistoryPoint[] }>;
  selectedFieldPath: string | null;
  subscriberIds: string[];
  alerts: StoreAlert[];
  psrEvents: DevtoolEvent[];
  editDraft: string;
  editError: string | null;
  onDraftChange(value: string): void;
  onApplyDraft(): void;
  onSelectField(path: string): void;
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
    ? "Structural diff, field history, and direct runtime controls."
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

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "action-button";
  copyButton.textContent = "Copy JSON";
  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(
      JSON.stringify(model.store?.currentState ?? null, null, 2),
    );
  });

  toolbar.append(storeName, copyButton);

  if (model.alerts.length > 0) {
    const alerts = document.createElement("div");
    alerts.className = "alert-stack";
    for (const alert of model.alerts) {
      const banner = document.createElement("div");
      banner.className = `alert-banner alert-banner--${alert.level}`;
      banner.textContent = alert.message;
      alerts.append(banner);
    }
    container.append(header, toolbar, alerts);
  } else {
    container.append(header, toolbar);
  }

  const metadata = document.createElement("div");
  metadata.className = "metadata-grid";
  metadata.append(
    createMetadataCard("Store Type", model.store.storeType),
    createMetadataCard("Status", model.store.status),
    createMetadataCard("Subscribers", String(model.store.subscriberCount)),
    createMetadataCard("Created", formatTimestamp(model.store.createdAt)),
    createMetadataCard("Updated", formatTimestamp(model.store.updatedAt)),
    createMetadataCard("Last Event", model.store.lastEventId ?? "n/a"),
  );

  if (model.store.async?.duration !== undefined) {
    metadata.append(createMetadataCard("Async Duration", `${model.store.async.duration.toFixed(1)}ms`));
  }

  if (model.store.async?.triggerReason) {
    metadata.append(createMetadataCard("Async Trigger", model.store.async.triggerReason));
  }

  if (model.store.async?.error) {
    metadata.append(createMetadataCard("Async Error", model.store.async.error));
  }

  const currentSection = document.createElement("section");
  currentSection.className = "inspector-section";
  currentSection.append(
    createSectionHeading("Current State"),
    renderValueTree("root", model.store.currentState, {
      path: [],
      selectedFieldPath: model.selectedFieldPath,
      onSelectField: model.onSelectField,
    }),
  );

  const previousSection = document.createElement("section");
  previousSection.className = "inspector-section";
  previousSection.append(
    createSectionHeading("Previous State"),
    renderValueTree("root", model.store.previousState, {
      path: [],
      selectedFieldPath: model.selectedFieldPath,
      onSelectField: model.onSelectField,
    }),
  );

  const diffSection = createDiffSection(model.diffResult);
  const fieldHistorySection = createFieldHistorySection(
    model.fieldHistory,
    model.selectedFieldPath,
  );
  const subscriptionSection = createSubscriptionSection(model.store.subscriberCount, model.subscriberIds);
  const psrSection = createPsrSection(model.psrEvents);
  const controlSection = createControlSection(model);

  container.append(
    metadata,
    currentSection,
    previousSection,
    diffSection,
    fieldHistorySection,
    subscriptionSection,
    psrSection,
    controlSection,
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
  },
  depth = 0,
  seen = new WeakSet<object>(),
): HTMLElement {
  if (value === undefined) {
    return renderLeaf(label, "undefined", options);
  }

  if (value === null || typeof value !== "object") {
    return renderLeaf(label, formatPrimitive(value), options);
  }

  if (seen.has(value)) {
    return renderLeaf(label, "[Circular]", options);
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
  details.append(summary);

  const entries = Array.isArray(value)
    ? value.map((entry, index) => [String(index), entry] as const)
    : Object.entries(value);

  if (entries.length === 0) {
    details.append(renderLeaf("empty", Array.isArray(value) ? "[]" : "{}", options));
    return details;
  }

  for (const [entryLabel, entryValue] of entries) {
    details.append(
      renderValueTree(
        entryLabel,
        entryValue,
        {
          ...options,
          path: [...options.path, entryLabel],
        },
        depth + 1,
        seen,
      ),
    );
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

function createPsrSection(events: DevtoolEvent[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "inspector-section";
  section.append(createSectionHeading("PSR Events"));

  if (events.length === 0) {
    section.append(createEmptyState("No PSR activity detected for this store."));
    return section;
  }

  const list = document.createElement("div");
  list.className = "psr-list";

  for (const event of events) {
    const item = document.createElement("div");
    item.className = "diff-card";
    item.textContent = `${event.type} at ${formatTimestamp(event.timestamp)}`;
    list.append(item);
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

  footer.append(applyButton);

  if (model.editError) {
    const error = document.createElement("p");
    error.className = "control-error";
    error.textContent = model.editError;
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
