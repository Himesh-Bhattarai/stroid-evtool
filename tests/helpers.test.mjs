/**
 * @module tests/helpers
 * @memberof StroidDevtoolsTests
 * @typedef {Record<string, unknown>} HelpersTestDocShape
 * @what owns Test helper contract validation.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Mock behavior drift from runtime browser semantics.
 * @public
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createMockRegistry } from "./helpers/mock-registry.mjs";
import { createMockStorage } from "./helpers/mock-storage.mjs";

test("helper: mock storage behaves like localStorage surface", () => {
  const storage = createMockStorage({ a: "1" });
  assert.equal(storage.getItem("a"), "1");
  storage.setItem("b", 2);
  assert.equal(storage.getItem("b"), "2");
  storage.removeItem("a");
  assert.equal(storage.getItem("a"), null);
  storage.clear();
  assert.deepEqual(storage.dump(), {});
});

test("helper: mock registry captures command calls", () => {
  const registry = createMockRegistry();
  registry.resetStore("cart");
  registry.editStore("cart", { total: 9 });
  registry.deleteStore("cart");

  assert.equal(registry.calls.resetStore.length, 1);
  assert.equal(registry.calls.editStore.length, 1);
  assert.equal(registry.calls.deleteStore.length, 1);
});
