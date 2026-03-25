/**
 * @module tests/session-tools
 * @memberof StroidDevtoolsTests
 * @typedef {Record<string, unknown>} SessionToolsTestDocShape
 * @what owns Snapshot/session/scenario utility test coverage.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Local storage IO, schema validation, and scenario diffs.
 * @public
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { createMockStorage } from "./helpers/mock-storage.mjs";
import {
  analyzeWhySlow,
  buildPerformanceReport,
  buildSchemaReport,
  buildSchemaTypeMap,
  compareSnapshots,
  exportSession,
  importSnapshots,
  loadSnapshots,
  parseScenarioDefinition,
  parseSessionExport,
  runScenarioDefinition,
  saveSnapshot,
  validateStateAgainstSchema,
} from "../dist/src/panel/session-tools.js";

const previousWindow = globalThis.window;
const previousLocalStorage = globalThis.localStorage;

beforeEach(() => {
  globalThis.window = { setTimeout: globalThis.setTimeout };
  globalThis.localStorage = createMockStorage();
});

afterEach(() => {
  globalThis.window = previousWindow;
  globalThis.localStorage = previousLocalStorage;
});

test("save/load/compare snapshots works in localStorage", () => {
  const stores = [
    {
      storeId: "cart",
      storeType: "sync",
      status: "idle",
      subscriberCount: 1,
      currentState: { total: 10 },
    },
  ];
  const firstList = saveSnapshot("app-one", "base", stores);
  assert.equal(firstList.length, 1);
  assert.equal(loadSnapshots("app-one").length, 1);

  const secondList = saveSnapshot("app-one", "after", [
    {
      ...stores[0],
      currentState: { total: 11 },
    },
  ]);

  const comparison = compareSnapshots(secondList[1], secondList[0]);
  assert.equal(comparison?.stores.length, 1);
  assert.equal(comparison?.stores[0].summary.includes("~"), true);
});

test("performance, slow-analysis and schema helpers return stable reports", () => {
  const now = Date.now();
  const store = {
    storeId: "summary",
    storeType: "derived",
    status: "success",
    subscriberCount: 4,
    currentState: { total: 12, user: { id: "x" } },
    async: { lastOutcome: "error" },
    meta: { schema: { total: "number", user: { id: "string" } } },
  };

  const report = buildPerformanceReport([store], [
    { id: "1", timestamp: now - 900, type: "store:updated", storeId: "summary" },
    { id: "2", timestamp: now - 500, type: "dependency:triggered", storeId: "summary" },
    {
      id: "3",
      timestamp: now - 100,
      type: "async:success",
      storeId: "summary",
      performance: { duration: 6 },
    },
  ]);
  assert.equal(report.stores.length, 1);

  const slow = analyzeWhySlow(
    store,
    {
      lastDiff: null,
      fieldHistory: new Map(),
      subscriptionHistory: [],
      subscriberIds: [],
      psrEvents: [],
      alerts: [{ level: "warning", message: "a" }],
      updateTimestamps: [now - 500, now - 300, now - 100],
    },
    {
      expression: "summary = fn(cart)",
      inputs: [{ name: "cart", changed: true }],
      recomputeCount: 4,
      recomputeCost: 12,
    },
    {
      label: "unstable",
      score: 40,
      reasons: ["high update frequency"],
      sparkline: [1, 2, 3],
      updatesPerMinute: 80,
    },
  );
  assert.equal(slow?.reasons.length > 0, true);

  const schemaReport = buildSchemaReport(store);
  assert.equal(schemaReport?.issues.length, 0);

  const typeMap = buildSchemaTypeMap(store);
  assert.equal(typeMap["user.id"], "string");
});

test("schema validation catches incorrect payloads", () => {
  const report = validateStateAgainstSchema(
    { total: "number", items: { count: "number" } },
    { total: "oops", items: { count: 2 } },
    "cart schema",
  );

  assert.equal(report?.label, "cart schema");
  assert.equal(report?.issues.length, 1);
  assert.equal(report?.issues[0].path, "total");
});

test("scenario runner returns per-step change summaries", async () => {
  const commands = [];
  const stores = [
    {
      storeId: "cart",
      storeType: "sync",
      status: "idle",
      subscriberCount: 1,
      currentState: { total: 10 },
    },
  ];

  const scenario = parseScenarioDefinition(
    JSON.stringify({
      name: "checkout flow",
      steps: [
        {
          type: "command",
          label: "edit cart",
          command: { type: "store:edit", storeId: "cart", state: { total: 12 } },
        },
        { type: "wait", label: "settle", ms: 5 },
      ],
    }),
  );

  const result = await runScenarioDefinition(
    scenario,
    (command) => {
      commands.push(command);
      if (command.type === "store:edit") {
        stores[0] = { ...stores[0], currentState: command.state };
      }
    },
    () => stores,
  );

  assert.equal(commands.length, 1);
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0].changes.length > 0, true);
});

test("session export/import roundtrip parses safely", () => {
  const exported = exportSession(
    "checkout",
    [{ id: "1", timestamp: 1, type: "store:updated", storeId: "cart" }],
    [],
    [],
    buildPerformanceReport([], []),
    [],
  );

  const parsed = parseSessionExport(exported);
  assert.equal(parsed.appId, "checkout");
  assert.equal(parsed.timeline.length, 1);

  const imported = importSnapshots("checkout", [
    {
      id: "snap_1",
      appId: "checkout",
      name: "base",
      createdAt: Date.now(),
      stores: [],
    },
  ]);
  assert.equal(imported.length, 1);
});
