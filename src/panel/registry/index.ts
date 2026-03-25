import type { DevtoolCommand, StroidStoreSnapshot } from "../../types.js";

export interface RegistryRenderModel {
  stores: StroidStoreSnapshot[];
  selectedStoreId: string | null;
  connectionState: "connecting" | "connected" | "disconnected";
  appId: string | null;
}

export interface RegistryHandlers {
  onSelectStore(storeId: string): void;
  onCommand(command: DevtoolCommand): void;
}

export function renderStoreRegistry(
  container: HTMLElement,
  model: RegistryRenderModel,
  handlers: RegistryHandlers,
): void {
  container.replaceChildren();

  const header = document.createElement("div");
  header.className = "column-header";

  const titleGroup = document.createElement("div");
  titleGroup.className = "column-header-copy";

  const title = document.createElement("h2");
  title.textContent = "Store Registry";

  const subtitle = document.createElement("p");
  subtitle.textContent = model.appId
    ? `Connected to ${model.appId}`
    : connectionLabel(model.connectionState);

  titleGroup.append(title, subtitle);

  const statusPill = document.createElement("span");
  statusPill.className = `metric-pill metric-pill--${model.connectionState}`;
  statusPill.textContent = connectionLabel(model.connectionState);

  header.append(titleGroup, statusPill);

  const stores = [...model.stores].sort((left, right) => {
    return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
  });

  const list = document.createElement("div");
  list.className = "store-list";

  if (stores.length === 0) {
    list.append(createEmptyState("Waiting for the bridge to publish stores."));
  }

  for (const store of stores) {
    const row = document.createElement("button");
    row.type = "button";
    row.className =
      store.storeId === model.selectedStoreId
        ? "store-row store-row--selected"
        : "store-row";
    row.addEventListener("click", () => {
      handlers.onSelectStore(store.storeId);
    });

    const rowTop = document.createElement("div");
    rowTop.className = "store-row-top";

    const name = document.createElement("strong");
    name.className = "store-name";
    name.textContent = store.storeId;

    const updated = document.createElement("span");
    updated.className = "store-updated";
    updated.textContent = formatTimestamp(store.updatedAt);

    rowTop.append(name, updated);

    const meta = document.createElement("div");
    meta.className = "store-meta";
    meta.append(
      createBadge(store.storeType, store.storeType),
      createBadge(store.status, store.status),
      createBadge(`${store.subscriberCount} subs`, "muted"),
    );

    row.append(rowTop, meta);
    list.append(row);
  }

  const footer = document.createElement("div");
  footer.className = "column-actions";

  const selectedStore = stores.find((store) => store.storeId === model.selectedStoreId) ?? null;

  if (selectedStore) {
    footer.append(
      createActionButton("Reset", () => {
        handlers.onCommand({ type: "store:reset", storeId: selectedStore.storeId });
      }),
      createActionButton(
        "Delete",
        () => {
          handlers.onCommand({ type: "store:delete", storeId: selectedStore.storeId });
        },
        true,
      ),
    );

    if (selectedStore.storeType === "async") {
      footer.append(
        createActionButton("Re-fetch", () => {
          handlers.onCommand({ type: "store:refetch", storeId: selectedStore.storeId });
        }),
      );
    }
  } else {
    footer.append(createGhostText("Select a store to unlock Phase 1 actions."));
  }

  container.append(header, list, footer);
}

function createActionButton(label: string, onClick: () => void, danger = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = danger ? "action-button action-button--danger" : "action-button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function createBadge(label: string, tone: string): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className = `badge badge--${tone}`;
  badge.textContent = label;
  return badge;
}

function createEmptyState(message: string): HTMLDivElement {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function createGhostText(message: string): HTMLParagraphElement {
  const text = document.createElement("p");
  text.className = "ghost-copy";
  text.textContent = message;
  return text;
}

function connectionLabel(state: RegistryRenderModel["connectionState"]): string {
  switch (state) {
    case "connected":
      return "Live";
    case "disconnected":
      return "Offline";
    default:
      return "Listening";
  }
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) {
    return "No updates";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}
