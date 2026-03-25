import { createBridgePacket } from "../bridge/channel.js";
import type { DevtoolCommand } from "../types.js";

const PANEL_PORT_NAME = "stroid-devtools-panel";

const panelPorts = new Map<number, any>();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function isDevtoolCommand(value: unknown): value is DevtoolCommand {
  const record = asRecord(value);
  if (!record || typeof record.type !== "string") {
    return false;
  }

  switch (record.type) {
    case "panel:handshake":
      return true;
    case "store:reset":
    case "store:delete":
    case "store:refetch":
      return typeof record.storeId === "string";
    default:
      return false;
  }
}

function forwardCommandToPage(
  tabId: number,
  command: DevtoolCommand,
  appId?: string,
): void {
  chrome.tabs?.sendMessage(tabId, {
    kind: "stroid:forward-to-page",
    packet: createBridgePacket({
      type: "bridge:command",
      appId,
      emittedAt: Date.now(),
      command,
    }),
  });
}

chrome.runtime.onConnect.addListener((port: any) => {
  if (port.name !== PANEL_PORT_NAME) {
    return;
  }

  let tabId: number | null = null;

  port.onMessage.addListener((message: unknown) => {
    const record = asRecord(message);
    if (!record || typeof record.kind !== "string") {
      return;
    }

    if (record.kind === "stroid:panel-ready" && typeof record.tabId === "number") {
      tabId = record.tabId;
      panelPorts.set(record.tabId, port);
      forwardCommandToPage(record.tabId, { type: "panel:handshake" });
      return;
    }

    if (
      record.kind === "stroid:panel-command" &&
      typeof record.tabId === "number" &&
      isDevtoolCommand(record.command)
    ) {
      forwardCommandToPage(
        record.tabId,
        record.command,
        typeof record.appId === "string" ? record.appId : undefined,
      );
    }
  });

  port.onDisconnect.addListener(() => {
    if (tabId !== null && panelPorts.get(tabId) === port) {
      panelPorts.delete(tabId);
    }
  });
});

chrome.runtime.onMessage.addListener((message: unknown, sender: any) => {
  const record = asRecord(message);
  const tabId = sender?.tab?.id;

  if (!record || record.kind !== "stroid:bridge-envelope" || typeof tabId !== "number") {
    return;
  }

  const port = panelPorts.get(tabId);
  if (!port) {
    return;
  }

  port.postMessage({
    kind: "stroid:panel-envelope",
    envelope: asRecord(record.packet)?.envelope,
  });
});
