/**
 * @module tests/diff
 * @memberof StroidDevtoolsTests
 * @typedef {Record<string, unknown>} DiffTestDocShape
 * @what owns Structural diff, edge-case, and fuzzy/randomized tests.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Recursive traversal, array handling, or path change output.
 * @public
 */
import assert from "node:assert/strict";
import test from "node:test";

import { diff, hasDiff, summarizeDiff } from "../dist/src/diff/index.js";

test("diff tracks added, removed, and modified paths", () => {
  const before = {
    cart: { total: 10, items: [{ id: "a", qty: 1 }] },
    coupon: "X",
  };
  const after = {
    cart: { total: 14, items: [{ id: "a", qty: 2 }, { id: "b", qty: 1 }] },
    note: "new",
  };

  const result = diff(before, after);
  assert.equal(result.added > 0, true);
  assert.equal(result.removed > 0, true);
  assert.equal(result.modified > 0, true);
  assert.equal(hasDiff(result), true);
});

test("summarizeDiff returns no structural changes when identical", () => {
  const result = diff({ a: 1 }, { a: 1 });
  assert.equal(hasDiff(result), false);
  assert.equal(summarizeDiff(result), "no structural changes");
});

test("fuzzy: diff never throws on random nested values", () => {
  for (let index = 0; index < 120; index += 1) {
    const left = randomValue(3, index * 17 + 1);
    const right = randomValue(3, index * 17 + 7);
    const result = diff(left, right);
    assert.equal(typeof result.added, "number");
    assert.equal(typeof result.removed, "number");
    assert.equal(typeof result.modified, "number");
    assert.equal(Array.isArray(result.changes), true);
  }
});

function randomValue(depth, seed) {
  const state = { value: seed >>> 0 };
  const next = () => {
    state.value = (state.value * 1664525 + 1013904223) >>> 0;
    return state.value / 0xffffffff;
  };

  const build = (remaining) => {
    const pick = next();
    if (remaining <= 0 || pick < 0.2) {
      return primitive(next());
    }

    if (pick < 0.6) {
      const size = Math.floor(next() * 4);
      const obj = {};
      for (let i = 0; i < size; i += 1) {
        obj[`k${i}`] = build(remaining - 1);
      }
      return obj;
    }

    const size = Math.floor(next() * 4);
    const arr = [];
    for (let i = 0; i < size; i += 1) {
      arr.push(build(remaining - 1));
    }
    return arr;
  };

  return build(depth);
}

function primitive(value) {
  if (value < 0.25) {
    return null;
  }
  if (value < 0.5) {
    return Math.round(value * 1000);
  }
  if (value < 0.75) {
    return value > 0.625;
  }
  return `s${Math.round(value * 1000)}`;
}
