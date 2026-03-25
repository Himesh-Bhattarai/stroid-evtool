/**
 * @module tests/analytics
 * @memberof StroidDevtoolsTests
 * @typedef {Record<string, unknown>} AnalyticsTestDocShape
 * @what owns Analytics diagnostics test coverage.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Alert thresholds, diff sampling, or subscription metrics.
 * @public
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDiagnostics,
  createStoreDiagnostics,
} from "../dist/src/panel/analytics.js";

function event(overrides = {}) {
  return {
    id: overrides.id ?? `evt_${Math.random().toString(16).slice(2)}`,
    timestamp: overrides.timestamp ?? Date.now(),
    type: overrides.type ?? "store:updated",
    storeId: overrides.storeId ?? "cart",
    before: overrides.before,
    after: overrides.after,
    causedBy: overrides.causedBy,
    meta: overrides.meta,
  };
}

test("applyDiagnostics tracks field history and last diff", () => {
  let diagnostics = createStoreDiagnostics();
  diagnostics = applyDiagnostics(
    diagnostics,
    event({
      before: { cart: { total: 10 } },
      after: { cart: { total: 11 } },
    }),
    1,
  );

  assert.equal(diagnostics.lastDiff !== null, true);
  assert.equal(diagnostics.fieldHistory.has("cart.total"), true);
});

test("applyDiagnostics tracks subscription history and IDs", () => {
  let diagnostics = createStoreDiagnostics();
  diagnostics = applyDiagnostics(
    diagnostics,
    event({
      type: "subscription:added",
      meta: { subscriberName: "CheckoutSummary" },
    }),
    12,
  );
  diagnostics = applyDiagnostics(
    diagnostics,
    event({
      type: "subscription:removed",
      meta: { subscriberName: "CheckoutSummary" },
    }),
    11,
  );

  assert.equal(diagnostics.subscriptionHistory.length, 2);
  assert.equal(diagnostics.subscriberIds.includes("CheckoutSummary"), false);
});

test("applyDiagnostics raises over-subscription, thrashing, and loop alerts", () => {
  let diagnostics = createStoreDiagnostics();
  const base = 1_000_000;

  for (let i = 0; i < 6; i += 1) {
    diagnostics = applyDiagnostics(
      diagnostics,
      event({
        timestamp: base + i * 100,
        type: "store:updated",
        causedBy: i === 5 ? "cart" : undefined,
        storeId: "cart",
      }),
      12,
    );
  }

  const joined = diagnostics.alerts.map((alert) => alert.message).join(" | ");
  assert.equal(joined.includes("Over-subscription risk"), true);
  assert.equal(joined.includes("Thrashing detected"), true);
  assert.equal(joined.includes("Loop suspicion"), true);
});
