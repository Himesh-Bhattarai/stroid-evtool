/**
 * @module src/panel/graph/index
 * @memberof StroidDevtools
 * @typedef {Record<string, unknown>} ModuleDocShape
 * @what owns Core logic for src/panel/graph/index.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Runtime event normalization, UI render paths, or command routing in this module.
 * @param {unknown} [input] Module-level JSDoc anchor for tooling consistency.
 * @returns {void}
 * @public
 */
import type { DependencyEdge } from "../insights.js";
import type { StroidStoreSnapshot } from "../../types.js";

export interface GraphRenderModel {
  stores: StroidStoreSnapshot[];
  edges: DependencyEdge[];
  selectedStoreId: string | null;
  flashStoreIds: string[];
  flashEdgeKeys: string[];
  onSelectStore(storeId: string): void;
  onViewChange(view: "timeline" | "graph" | "performance"): void;
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
    createToggleButton("Performance", false, () => {
      model.onViewChange("performance");
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

  const positions = layoutNodes(model.stores, model.edges);
  const flashStoreIds = new Set(model.flashStoreIds);
  const flashEdgeKeys = new Set(model.flashEdgeKeys);
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

  const footer = document.createElement("div");
  footer.className = "ghost-copy";
  const defaultFooter = model.selectedStoreId
    ? `Selected ${model.selectedStoreId}. Connected nodes are highlighted.`
    : "Select a store to highlight propagation neighbors.";
  footer.textContent = defaultFooter;

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
      edgeClass(edge, model.selectedStoreId, relatedIds, flashEdgeKeys),
    );
    line.addEventListener("mouseenter", () => {
      footer.textContent = `${edge.kind} edge ${edge.from} -> ${edge.to} (${edge.count} events)`;
    });
    line.addEventListener("mouseleave", () => {
      footer.textContent = defaultFooter;
    });
    canvas.append(line);
  }

  for (const store of model.stores) {
    const point = positions.get(store.storeId);
    if (!point) {
      continue;
    }

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute(
      "class",
      nodeClass(store.storeId, model.selectedStoreId, relatedIds, flashStoreIds),
    );
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

  container.append(header, canvas, footer);
}

function layoutNodes(
  stores: StroidStoreSnapshot[],
  edges: DependencyEdge[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const velocities = new Map<string, { x: number; y: number }>();

  for (const store of stores) {
    const seed = hash(store.storeId);
    positions.set(store.storeId, {
      x: 80 + (seed % 480),
      y: 60 + ((seed * 13) % 300),
    });
    velocities.set(store.storeId, { x: 0, y: 0 });
  }

  const centerX = 320;
  const centerY = 210;
  const repulsion = 8_000;
  const springLength = 120;
  const springStrength = 0.006;
  const centerPull = 0.0025;
  const damping = 0.86;

  for (let tick = 0; tick < 140; tick += 1) {
    const forces = new Map<string, { x: number; y: number }>();
    for (const store of stores) {
      forces.set(store.storeId, { x: 0, y: 0 });
    }

    for (let index = 0; index < stores.length; index += 1) {
      for (let peer = index + 1; peer < stores.length; peer += 1) {
        const left = positions.get(stores[index].storeId);
        const right = positions.get(stores[peer].storeId);
        if (!left || !right) {
          continue;
        }

        const dx = left.x - right.x;
        const dy = left.y - right.y;
        const distanceSq = Math.max(120, dx * dx + dy * dy);
        const force = repulsion / distanceSq;
        const fx = force * dx;
        const fy = force * dy;

        const leftForce = forces.get(stores[index].storeId);
        const rightForce = forces.get(stores[peer].storeId);
        if (leftForce && rightForce) {
          leftForce.x += fx;
          leftForce.y += fy;
          rightForce.x -= fx;
          rightForce.y -= fy;
        }
      }
    }

    for (const edge of edges) {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) {
        continue;
      }

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const stretch = distance - springLength;
      const springForce = stretch * springStrength;
      const fx = (dx / distance) * springForce;
      const fy = (dy / distance) * springForce;

      const fromForce = forces.get(edge.from);
      const toForce = forces.get(edge.to);
      if (fromForce && toForce) {
        fromForce.x += fx;
        fromForce.y += fy;
        toForce.x -= fx;
        toForce.y -= fy;
      }
    }

    for (const store of stores) {
      const position = positions.get(store.storeId);
      const velocity = velocities.get(store.storeId);
      const force = forces.get(store.storeId);
      if (!position || !velocity || !force) {
        continue;
      }

      force.x += (centerX - position.x) * centerPull;
      force.y += (centerY - position.y) * centerPull;

      velocity.x = (velocity.x + force.x) * damping;
      velocity.y = (velocity.y + force.y) * damping;
      position.x = clamp(position.x + velocity.x, 32, 608);
      position.y = clamp(position.y + velocity.y, 32, 388);
    }
  }

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
  flashStoreIds: Set<string>,
): string {
  const classes = ["graph-node"];
  if (storeId === selectedStoreId) {
    classes.push("graph-node--selected");
  } else if (relatedIds.has(storeId)) {
    classes.push("graph-node--related");
  }
  if (flashStoreIds.has(storeId)) {
    classes.push("graph-node--flash");
  }
  return classes.join(" ");
}

function edgeClass(
  edge: DependencyEdge,
  selectedStoreId: string | null,
  relatedIds: Set<string>,
  flashEdgeKeys: Set<string>,
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
  if (flashEdgeKeys.has(edgeKey(edge.from, edge.to))) {
    classes.push("graph-edge--flash");
  }
  return classes.join(" ");
}

function edgeKey(from: string, to: string): string {
  return `${from}->${to}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hash(value: string): number {
  let output = 0;
  for (let index = 0; index < value.length; index += 1) {
    output = (output * 31 + value.charCodeAt(index)) >>> 0;
  }
  return output;
}


