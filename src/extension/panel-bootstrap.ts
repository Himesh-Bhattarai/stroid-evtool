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
    sendCommand(command: DevtoolCommand) {
      if (port && chrome?.devtools?.inspectedWindow) {
        port.postMessage({
          kind: "stroid:panel-command",
          tabId: chrome.devtools.inspectedWindow.tabId,
          appId: null,
          command,
        });
        return;
      }

      fallbackChannel?.send({
        type: "bridge:command",
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
      if (!record || record.kind !== "stroid:panel-envelope" || !isBridgeEnvelope(record.envelope)) {
        return;
      }

      app.receive(record.envelope);
    });

    port.onDisconnect.addListener(() => {
      app.setConnectionState("disconnected");
    });

    port.postMessage({
      kind: "stroid:panel-ready",
      tabId: chrome.devtools.inspectedWindow.tabId,
    });
  } else {
    app.setConnectionState("connecting");
    fallbackChannel = createBridgeChannel();
    unsubscribeFallback = fallbackChannel.subscribe((envelope) => {
      app.receive(envelope);
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
