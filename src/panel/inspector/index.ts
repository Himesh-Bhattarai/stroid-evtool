import type { StroidStoreSnapshot } from "../../types.js";

export interface InspectorRenderModel {
  store: StroidStoreSnapshot | null;
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
    ? "Current snapshot, previous snapshot, and metadata."
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

  const currentSection = document.createElement("section");
  currentSection.className = "inspector-section";
  currentSection.append(
    createSectionHeading("Current State"),
    renderValueTree("root", model.store.currentState),
  );

  const previousSection = document.createElement("section");
  previousSection.className = "inspector-section";
  previousSection.append(
    createSectionHeading("Previous State"),
    renderValueTree("root", model.store.previousState),
  );

  const phaseNote = document.createElement("div");
  phaseNote.className = "phase-note";
  phaseNote.textContent =
    "Structural diff stays out of Phase 1 on purpose. The roadmap adds the real diff engine in Phase 2.";

  container.append(header, toolbar, metadata, currentSection, previousSection, phaseNote);
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
  depth = 0,
  seen = new WeakSet<object>(),
): HTMLElement {
  if (value === undefined) {
    return renderLeaf(label, "undefined");
  }

  if (value === null || typeof value !== "object") {
    return renderLeaf(label, formatPrimitive(value));
  }

  if (seen.has(value)) {
    return renderLeaf(label, "[Circular]");
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
    details.append(renderLeaf("empty", Array.isArray(value) ? "[]" : "{}"));
    return details;
  }

  for (const [entryLabel, entryValue] of entries) {
    details.append(renderValueTree(entryLabel, entryValue, depth + 1, seen));
  }

  return details;
}

function renderLeaf(label: string, value: string): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "state-leaf";

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
