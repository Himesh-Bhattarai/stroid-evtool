/**
 * @module tests/smoke
 * @memberof StroidDevtoolsTests
 * @typedef {Record<string, unknown>} SmokeTestDocShape
 * @what owns Public API smoke tests for package exports.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Entry-point export map regressions.
 * @public
 */
import assert from "node:assert/strict";
import test from "node:test";

import * as api from "../dist/src/index.js";

test("public API smoke: expected exports exist", () => {
  const required = [
    "EventBuffer",
    "createStroidDevtoolsBridge",
    "createBridgeChannel",
    "diff",
    "hasDiff",
    "summarizeDiff",
  ];

  for (const key of required) {
    assert.equal(typeof api[key], "function", `missing export ${key}`);
  }
});
