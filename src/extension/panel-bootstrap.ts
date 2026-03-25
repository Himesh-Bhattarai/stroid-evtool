/**
 * @module src/extension/panel-bootstrap
 * @memberof StroidDevtools
 * @typedef {Record<string, unknown>} ModuleDocShape
 * @what owns Core logic for src/extension/panel-bootstrap.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Runtime event normalization, UI render paths, or command routing in this module.
 * @param {unknown} [input] Module-level JSDoc anchor for tooling consistency.
 * @returns {void}
 * @public
 */
import { createBridgeChannel } from "../bridge/channel.js";
import { mountDevtoolsPanel } from "../panel/index.js";
import type { BridgeEnvelope, DevtoolCommand } from "../types.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function isBridgeEnvelope(value: unknown): value is BridgeEnvelope {
  const record = asRecord(value);
  return !!record && typeof record.type === "string";
}

function bootstrap(): void {
  const root = document.getElementById("app");
  if (!root) {
    return;
  }

  let port: any | null = null;
  let unsubscribeFallback: (() => void) | null = null;
  let fallbackChannel: ReturnType<typeof createBridgeChannel> | null = null;

  const app = mountDevtoolsPanel(root, {
    sendCommand(command: DevtoolCommand, route?: { tabId?: number; appId?: string }) {
      if (port && chrome?.devtools?.inspectedWindow) {
        port.postMessage({
          kind: "stroid:panel-command",
          targetTabId: route?.tabId ?? chrome.devtools.inspectedWindow.tabId,
          appId: route?.appId ?? null,
          command,
        });
        return;
      }

      fallbackChannel?.send({
        type: "bridge:command",
        appId: route?.appId,
        emittedAt: Date.now(),
        command,
      });
    },
  });

  if (chrome?.runtime?.connect && chrome?.devtools?.inspectedWindow) {
    app.setConnectionState("connecting");
    port = chrome.runtime.connect({ name: "stroid-devtools-panel" });
    port.onMessage.addListener((message: unknown) => {
      const record = asRecord(message);
      if (!record) {
        return;
      }

      if (record.kind === "stroid:panel-envelope" && isBridgeEnvelope(record.envelope)) {
        app.receive(
          record.envelope,
          typeof record.sourceTabId === "number" ? record.sourceTabId : null,
        );
        return;
      }

      if (record.kind === "stroid:targets" && Array.isArray(record.targets)) {
        app.setTargets(
          record.targets.filter((entry) => {
            const candidate = asRecord(entry);
            return (
              candidate &&
              typeof candidate.tabId === "number" &&
              typeof candidate.appId === "string"
            );
          }) as Array<{ tabId: number; appId: string; lastSeen?: number }>,
        );
      }
    });

    port.onDisconnect.addListener(() => {
      app.setConnectionState("disconnected");
    });

    port.postMessage({
      kind: "stroid:panel-ready",
      tabId: chrome.devtools.inspectedWindow.tabId,
    });
    port.postMessage({
      kind: "stroid:request-targets",
    });
  } else {
    app.setConnectionState("connecting");
    fallbackChannel = createBridgeChannel();
    unsubscribeFallback = fallbackChannel.subscribe((envelope) => {
      app.receive(envelope, null);
    });
    fallbackChannel.send({
      type: "bridge:command",
      emittedAt: Date.now(),
      command: { type: "panel:handshake" },
    });
  }

  window.addEventListener(
    "beforeunload",
    () => {
      unsubscribeFallback?.();
      fallbackChannel?.destroy();
      port?.disconnect?.();
      app.destroy();
    },
    { once: true },
  );
}

document.addEventListener("DOMContentLoaded", bootstrap);


