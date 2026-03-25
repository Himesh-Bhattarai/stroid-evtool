/**
 * @module tests/normalizer
 * @memberof StroidDevtoolsTests
 * @typedef {Record<string, unknown>} NormalizerTestDocShape
 * @what owns Bridge normalizer and snapshot fallback tests.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Raw event alias mapping and null-snapshot fallback paths.
 * @public
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeDevtoolEvent,
  normalizeStoreSnapshot,
  snapshotRegistry,
  snapshotStore,
} from "../dist/src/bridge/normalizer.js";

test("normalizeDevtoolEvent maps common aliases", () => {
  const event = normalizeDevtoolEvent({
    eventType: "async:success",
    store: "cart",
    previous: { total: 2 },
    next: { total: 3 },
    mutation: "recalc",
    triggeredBy: "checkout",
    duration: 12.5,
  });

  assert.equal(event.type, "async:success");
  assert.equal(event.storeId, "cart");
  assert.equal(event.mutator, "recalc");
  assert.equal(event.causedBy, "checkout");
  assert.equal(event.performance?.duration, 12.5);
});

test("normalizeStoreSnapshot handles shape and async fields", () => {
  const snapshot = normalizeStoreSnapshot(
    {
      id: "inventory",
      type: "async",
      status: "loading",
      subscriberCount: 4,
      state: { ready: false },
      async: { duration: 9, cacheSource: "cache", triggerReason: "focus" },
    },
    "fallback",
  );

  assert.equal(snapshot?.storeId, "inventory");
  assert.equal(snapshot?.storeType, "async");
  assert.equal(snapshot?.status, "loading");
  assert.equal(snapshot?.subscriberCount, 4);
  assert.equal(snapshot?.async?.cacheSource, "cache");
});

test("snapshotRegistry and snapshotStore fall back correctly", () => {
  const registry = {
    onEvent() {
      return () => {};
    },
    getStores() {
      return {
        cart: {
          storeId: "cart",
          storeType: "sync",
          status: "idle",
          subscriberCount: 1,
          state: { total: 9 },
        },
      };
    },
    getStoreSnapshot(storeId) {
      if (storeId === "cart") {
        return {
          storeId: "cart",
          storeType: "sync",
          status: "success",
          subscriberCount: 2,
          currentState: { total: 10 },
        };
      }
      return null;
    },
  };

  const list = snapshotRegistry(registry);
  assert.equal(list.length, 1);
  assert.equal(list[0].storeId, "cart");

  const store = snapshotStore(registry, "cart");
  assert.equal(store.status, "success");
  assert.deepEqual(store.currentState, { total: 10 });

  const missing = snapshotStore(registry, "missing", {
    id: "evt_1",
    timestamp: Date.now(),
    type: "store:updated",
    storeId: "missing",
    before: { a: 1 },
    after: { a: 2 },
  });
  assert.equal(missing.storeId, "missing");
  assert.equal(missing.status, "idle");
});
