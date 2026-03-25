import type { DependencyEdge } from "../insights.js";
import type { StroidStoreSnapshot } from "../../types.js";

export interface GraphRenderModel {
  stores: StroidStoreSnapshot[];
  edges: DependencyEdge[];
  selectedStoreId: string | null;
  onSelectStore(storeId: string): void;
  onViewChange(view: "timeline" | "graph"): void;
}

export function renderDependencyGraph(
  container: HTMLElement,
  model: GraphRenderModel,
): void {
  container.replaceChildren();

  const header = document.createElement("div");
  header.className = "column-header";

  const titleGroup = document.createElement("div");
  titleGroup.className = "column-header-copy";

  const title = document.createElement("h2");
  title.textContent = "Dependency Graph";

  const subtitle = document.createElement("p");
  subtitle.textContent = "Visualize store relationships and propagation paths.";

  titleGroup.append(title, subtitle);

  const toggles = document.createElement("div");
  toggles.className = "view-toggle";
  toggles.append(
    createToggleButton("Timeline", false, () => {
      model.onViewChange("timeline");
    }),
    createToggleButton("Graph", true, () => {
      model.onViewChange("graph");
    }),
  );

  header.append(titleGroup, toggles);

  if (model.stores.length === 0) {
    container.append(header, createEmptyState("The graph appears once stores start publishing dependencies."));
    return;
  }

  const canvas = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.setAttribute("class", "graph-canvas");
  canvas.setAttribute("viewBox", "0 0 640 420");

  const positions = layoutNodes(model.stores);
  const relatedIds = new Set<string>();
  if (model.selectedStoreId) {
    relatedIds.add(model.selectedStoreId);
    for (const edge of model.edges) {
      if (edge.from === model.selectedStoreId || edge.to === model.selectedStoreId) {
        relatedIds.add(edge.from);
        relatedIds.add(edge.to);
      }
    }
  }

  for (const edge of model.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) {
      continue;
    }

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(from.x));
    line.setAttribute("y1", String(from.y));
    line.setAttribute("x2", String(to.x));
    line.setAttribute("y2", String(to.y));
    line.setAttribute(
      "class",
      edgeClass(edge, model.selectedStoreId, relatedIds),
    );
    canvas.append(line);
  }

  for (const store of model.stores) {
    const point = positions.get(store.storeId);
    if (!point) {
      continue;
    }

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", nodeClass(store.storeId, model.selectedStoreId, relatedIds));
    group.addEventListener("click", () => {
      model.onSelectStore(store.storeId);
    });

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(point.x));
    circle.setAttribute("cy", String(point.y));
    circle.setAttribute("r", "28");

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(point.x));
    label.setAttribute("y", String(point.y + 44));
    label.setAttribute("text-anchor", "middle");
    label.textContent = store.storeId;

    group.append(circle, label);
    canvas.append(group);
  }

  const footer = document.createElement("div");
  footer.className = "ghost-copy";
  footer.textContent = model.selectedStoreId
    ? `Selected ${model.selectedStoreId}. Connected nodes are highlighted.`
    : "Select a store to highlight propagation neighbors.";

  container.append(header, canvas, footer);
}

function layoutNodes(stores: StroidStoreSnapshot[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const total = stores.length;
  const centerX = 320;
  const centerY = 190;
  const radiusX = 220;
  const radiusY = 130;

  stores.forEach((store, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(total, 1);
    positions.set(store.storeId, {
      x: centerX + Math.cos(angle) * radiusX,
      y: centerY + Math.sin(angle) * radiusY,
    });
  });

  return positions;
}

function createEmptyState(message: string): HTMLDivElement {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function createToggleButton(
  label: string,
  active: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = active ? "mode-chip mode-chip--active" : "mode-chip";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function nodeClass(
  storeId: string,
  selectedStoreId: string | null,
  relatedIds: Set<string>,
): string {
  const classes = ["graph-node"];
  if (storeId === selectedStoreId) {
    classes.push("graph-node--selected");
  } else if (relatedIds.has(storeId)) {
    classes.push("graph-node--related");
  }
  return classes.join(" ");
}

function edgeClass(
  edge: DependencyEdge,
  selectedStoreId: string | null,
  relatedIds: Set<string>,
): string {
  const classes = ["graph-edge", `graph-edge--${edge.kind}`];
  if (
    selectedStoreId &&
    (edge.from === selectedStoreId ||
      edge.to === selectedStoreId ||
      (relatedIds.has(edge.from) && relatedIds.has(edge.to)))
  ) {
    classes.push("graph-edge--highlighted");
  }
  return classes.join(" ");
}
