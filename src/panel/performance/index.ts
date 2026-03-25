/**
 * @module src/panel/performance/index
 * @memberof StroidDevtools
 * @typedef {Record<string, unknown>} ModuleDocShape
 * @what owns Core logic for src/panel/performance/index.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Runtime event normalization, UI render paths, or command routing in this module.
 * @param {unknown} [input] Module-level JSDoc anchor for tooling consistency.
 * @returns {void}
 * @public
 */
import type { PerformanceReport } from "../session-tools.js";

export interface PerformanceRenderModel {
  report: PerformanceReport;
  activeView: "timeline" | "graph" | "performance";
  onViewChange(view: "timeline" | "graph" | "performance"): void;
}

export function renderPerformanceView(
  container: HTMLElement,
  model: PerformanceRenderModel,
): void {
  container.replaceChildren();

  const header = document.createElement("div");
  header.className = "column-header";

  const titleGroup = document.createElement("div");
  titleGroup.className = "column-header-copy";

  const title = document.createElement("h2");
  title.textContent = "Performance";

  const subtitle = document.createElement("p");
  subtitle.textContent = "Global pressure, async percentiles, and per-store update cadence.";

  titleGroup.append(title, subtitle);

  const toggles = document.createElement("div");
  toggles.className = "view-toggle";
  toggles.append(
    createToggle("Timeline", model.activeView === "timeline", () => {
      model.onViewChange("timeline");
    }),
    createToggle("Graph", model.activeView === "graph", () => {
      model.onViewChange("graph");
    }),
    createToggle("Performance", model.activeView === "performance", () => {
      model.onViewChange("performance");
    }),
  );

  header.append(titleGroup, toggles);

  const globalSection = document.createElement("section");
  globalSection.className = "inspector-section";

  const globalGrid = document.createElement("div");
  globalGrid.className = "metadata-grid";
  globalGrid.append(
    createMetricCard("Updates / Sec", String(model.report.global.totalUpdatesPerSecond)),
    createMetricCard(
      "Heaviest Store",
      model.report.global.heaviestStores[0]
        ? `${model.report.global.heaviestStores[0].storeId} (${model.report.global.heaviestStores[0].updates}/min)`
        : "n/a",
    ),
    createMetricCard(
      "Highest Subscribers",
      model.report.global.highestSubscribers[0]
        ? `${model.report.global.highestSubscribers[0].storeId} (${model.report.global.highestSubscribers[0].subscribers})`
        : "n/a",
    ),
  );
  globalSection.append(globalGrid);

  const storeSection = document.createElement("section");
  storeSection.className = "inspector-section";
  storeSection.append(createHeading("Store Metrics"));

  const list = document.createElement("div");
  list.className = "diff-list";

  for (const metric of model.report.stores) {
    const card = document.createElement("div");
    card.className = "diff-card";

    const top = document.createElement("div");
    top.className = "diff-card-top";

    const name = document.createElement("strong");
    name.textContent = metric.storeId;

    const updates = document.createElement("span");
    updates.className = "badge badge--loading";
    updates.textContent = `${metric.updatesPerMinute}/min`;

    top.append(name, updates);

    const body = document.createElement("p");
    body.className = "diff-values";
    body.textContent = [
      metric.averageIntervalMs !== null ? `avg ${(metric.averageIntervalMs).toFixed(1)}ms` : "avg n/a",
      metric.asyncP50 !== null ? `p50 ${metric.asyncP50.toFixed(1)}ms` : "p50 n/a",
      metric.asyncP95 !== null ? `p95 ${metric.asyncP95.toFixed(1)}ms` : "p95 n/a",
      `subs ${metric.subscriberCount}`,
    ].join(" | ");

    card.append(top, body);
    list.append(card);
  }

  if (model.report.stores.length === 0) {
    list.append(createEmptyState("Performance metrics appear once stores begin emitting updates."));
  }

  storeSection.append(list);
  container.append(header, globalSection, storeSection);
}

function createToggle(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = active ? "mode-chip mode-chip--active" : "mode-chip";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function createMetricCard(label: string, value: string): HTMLDivElement {
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

function createHeading(label: string): HTMLHeadingElement {
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


