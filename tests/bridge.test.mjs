/**
 * @module tests/bridge
 * @memberof StroidDevtoolsTests
 * @typedef {Record<string, unknown>} BridgeTestDocShape
 * @what owns Bridge packet and command routing test coverage.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Broadcast/window transport routing and teardown cleanup.
 * @public
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createBridgeChannel, createBridgePacket, isBridgePacket } from "../dist/src/bridge/channel.js";
import { createStroidDevtoolsBridge } from "../dist/src/bridge/index.js";
import { createMockRegistry } from "./helpers/mock-registry.mjs";

function wait(ms = 50) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("bridge packet helpers validate namespace and channel", () => {
  const envelope = {
    type: "bridge:command",
    emittedAt: Date.now(),
    command: { type: "panel:handshake" },
  };
  const packet = createBridgePacket(envelope, "test-key");
  assert.equal(isBridgePacket(packet, "test-key"), true);
  assert.equal(isBridgePacket(packet, "other-key"), false);
});

test("bridge publishes snapshot + event/patch envelopes from runtime events", async () => {
  const registry = createMockRegistry();
  const bridge = createStroidDevtoolsBridge(registry, {
    appId: "app-a",
    channelKey: "bridge-test-1",
    transport: "window",
  });

  const envelopes = [];
  const unsubscribe = bridge.subscribe((envelope) => {
    envelopes.push(envelope);
  });

  registry.emit({
    id: "evt_1",
    timestamp: Date.now(),
    type: "store:updated",
    storeId: "cart",
    before: { total: 1 },
    after: { total: 2 },
  });

  await wait();
  assert.equal(envelopes.some((envelope) => envelope.type === "bridge:event"), true);
  assert.equal(envelopes.some((envelope) => envelope.type === "bridge:store-patch"), true);

  unsubscribe();
  bridge.destroy();
});

test("bridge routes command variants and emits override events", async () => {
  const registry = createMockRegistry();
  delete registry.dispatchDevtoolsCommand;
  const channelKey = `bridge-test-${Date.now()}`;

  const bridge = createStroidDevtoolsBridge(registry, {
    appId: "app-route",
    channelKey,
    transport: "broadcast",
  });
  const panelChannel = createBridgeChannel({
    channelKey,
    transport: "broadcast",
  });

  const seen = [];
  const unsubscribe = bridge.subscribe((envelope) => {
    seen.push(envelope);
  });
  try {
    const commands = [
      { type: "store:reset", storeId: "cart" },
      { type: "store:edit", storeId: "cart", state: { total: 33 } },
      { type: "store:delete", storeId: "cart" },
      { type: "store:refetch", storeId: "cart" },
      { type: "store:trigger-mutator", storeId: "cart", mutator: "addItem", args: [1] },
      { type: "store:create", storeId: "inventory", storeType: "sync", initialState: { ok: true } },
      { type: "stores:reset-all" },
      { type: "devtools:set-mode", mode: "trace" },
      { type: "devtools:replay", speed: 0.5 },
    ];

    for (const command of commands) {
      panelChannel.send({
        type: "bridge:command",
        appId: "app-route",
        emittedAt: Date.now(),
        command,
      });
    }

    await wait(120);

    assert.equal(registry.calls.resetStore.length, 1);
    assert.equal(registry.calls.editStore.length, 1);
    assert.equal(registry.calls.deleteStore.length, 1);
    assert.equal(registry.calls.refetchStore.length, 1);
    assert.equal(registry.calls.triggerStoreMutator.length, 1);
    assert.equal(registry.calls.createStore.length, 1);
    assert.equal(registry.calls.resetAllStores, 1);
    assert.equal(registry.calls.setDevtoolsMode.length, 1);
    assert.equal(registry.calls.replayEvents.length, 1);
    assert.equal(
      seen.some(
        (envelope) => envelope.type === "bridge:event" && envelope.event.type === "devtool:override",
      ),
      true,
    );
  } finally {
    unsubscribe();
    panelChannel.destroy();
    bridge.destroy();
  }
});
