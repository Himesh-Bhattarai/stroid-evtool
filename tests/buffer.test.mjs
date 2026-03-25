/**
 * @module tests/buffer
 * @memberof StroidDevtoolsTests
 * @typedef {Record<string, unknown>} BufferTestDocShape
 * @what owns Event buffer regression and edge-case tests.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Ring-buffer trimming and defensive copy behavior.
 * @public
 */
import assert from "node:assert/strict";
import test from "node:test";

import { EventBuffer } from "../dist/src/buffer/index.js";

test("EventBuffer keeps only max events", () => {
  const buffer = new EventBuffer(3);
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);
  buffer.push(4);

  assert.deepEqual(buffer.getAll(), [2, 3, 4]);
});

test("EventBuffer.clear removes all events", () => {
  const buffer = new EventBuffer(2);
  buffer.push("a");
  buffer.push("b");
  buffer.clear();

  assert.deepEqual(buffer.getAll(), []);
});

test("EventBuffer.getAll returns a defensive copy", () => {
  const buffer = new EventBuffer(2);
  buffer.push({ a: 1 });
  const copy = buffer.getAll();
  copy.push({ a: 2 });

  assert.equal(buffer.getAll().length, 1);
});
