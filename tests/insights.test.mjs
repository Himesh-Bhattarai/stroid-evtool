/**
 * @module tests/insights
 * @memberof StroidDevtoolsTests
 * @typedef {Record<string, unknown>} InsightsTestDocShape
 * @what owns Dependency, cause-trace, and health scoring tests.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Causal graph assembly and health/constraint summarization.
 * @public
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCauseTrace,
  buildConstraintStates,
  buildDependencyEdges,
  buildDerivedTrace,
  computeStoreHealth,
} from "../dist/src/panel/insights.js";

function evt(overrides = {}) {
  return {
    id: overrides.id ?? `evt_${Math.random().toString(16).slice(2)}`,
    timestamp: overrides.timestamp ?? Date.now(),
    type: overrides.type ?? "store:updated",
    storeId: overrides.storeId,
    causedBy: overrides.causedBy,
    performance: overrides.performance,
    meta: overrides.meta,
  };
}

test("buildDependencyEdges combines dependency and causal edges", () => {
  const stores = new Map([
    ["cart", { storeId: "cart" }],
    ["summary", { storeId: "summary" }],
    ["discount", { storeId: "discount" }],
  ]);

  const edges = buildDependencyEdges(stores, [
    evt({
      storeId: "summary",
      meta: { dependencies: ["cart", "discount"] },
    }),
    evt({
      storeId: "summary",
      causedBy: "cart",
    }),
  ]);

  assert.equal(edges.some((edge) => edge.from === "cart" && edge.to === "summary"), true);
  assert.equal(edges.some((edge) => edge.kind === "causal"), true);
});

test("buildCauseTrace walks backward by causedBy chain", () => {
  const now = Date.now();
  const trace = buildCauseTrace("summary", [
    evt({
      id: "1",
      timestamp: now - 30,
      storeId: "summary",
      type: "store:updated",
      causedBy: "cart",
    }),
    evt({
      id: "2",
      timestamp: now - 20,
      storeId: "cart",
      type: "store:updated",
      mutator: "addItem",
    }),
  ]);

  assert.equal(trace.length > 0, true);
  assert.equal(trace[0].label.includes("summary"), true);
});

test("buildDerivedTrace extracts expression inputs and cost", () => {
  const trace = buildDerivedTrace(
    {
      storeId: "summary",
      storeType: "derived",
      status: "idle",
      subscriberCount: 0,
    },
    [
      evt({
        storeId: "summary",
        meta: {
          expression: "summary = fn(cart, discounts)",
          dependencies: ["cart", "discounts"],
          changedInputs: ["cart"],
        },
        performance: { duration: 2.4 },
      }),
    ],
  );

  assert.equal(trace?.expression.includes("summary"), true);
  assert.equal(trace?.inputs.length, 2);
  assert.equal(trace?.recomputeCost, 2.4);
});

test("buildConstraintStates and computeStoreHealth produce stable outputs", () => {
  const now = Date.now();
  const constraints = buildConstraintStates("cart", [
    evt({
      timestamp: now - 5,
      type: "psr:blocked",
      storeId: "cart",
      meta: { constraints: ["cart.total >= 0"] },
    }),
  ]);
  assert.equal(constraints.length, 1);
  assert.equal(constraints[0].status, "violated");

  const health = computeStoreHealth(
    {
      storeId: "cart",
      storeType: "derived",
      status: "error",
      subscriberCount: 15,
      async: { duration: 10, lastOutcome: "error" },
    },
    {
      lastDiff: null,
      fieldHistory: new Map(),
      subscriptionHistory: [],
      subscriberIds: [],
      psrEvents: [],
      alerts: [{ level: "danger", message: "x" }],
      updateTimestamps: [now - 900, now - 700, now - 500, now - 300, now - 100],
    },
  );
  assert.equal(health.score < 100, true);
  assert.equal(health.reasons.length > 0, true);
});
