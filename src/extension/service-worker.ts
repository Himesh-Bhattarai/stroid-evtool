/**
 * @module src/extension/service-worker
 * @memberof StroidDevtools
 * @typedef {Record<string, unknown>} ModuleDocShape
 * @what owns Core logic for src/extension/service-worker.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Runtime event normalization, UI render paths, or command routing in this module.
 * @param {unknown} [input] Module-level JSDoc anchor for tooling consistency.
 * @returns {void}
 * @public
 */
import { createBridgePacket } from "../bridge/channel.js";
import type { DevtoolCommand } from "../types.js";

const PANEL_PORT_NAME = "stroid-devtools-panel";
const panelPorts = new Set<any>();
const panelContext = new WeakMap<any, { inspectedTabId: number | null }>();
const runtimeTargets = new Map<string, { tabId: number; appId: string; lastSeen: number }>();

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
    case "stores:reset-all":
      return true;
    case "devtools:set-mode":
      return (
        record.mode === "debug" ||
        record.mode === "trace" ||
        record.mode === "freeze" ||
        record.mode === "replay"
      );
    case "devtools:replay":
      return typeof record.speed === "number";
    case "store:reset":
    case "store:delete":
    case "store:refetch":
      return typeof record.storeId === "string";
    case "store:trigger-mutator":
      return (
        typeof record.storeId === "string" &&
        typeof record.mutator === "string" &&
        (record.args === undefined || Array.isArray(record.args))
      );
    case "store:create":
      return (
        typeof record.storeId === "string" &&
        (record.storeType === undefined ||
          record.storeType === "sync" ||
          record.storeType === "async" ||
          record.storeType === "derived" ||
          record.storeType === "unknown")
      );
    case "store:edit":
      return typeof record.storeId === "string" && "state" in record;
    default:
      return false;
  }
}

function isBridgeEnvelope(value: unknown): value is { appId?: string } {
  const record = asRecord(value);
  return !!record && typeof record.type === "string";
}

function targetKey(tabId: number, appId: string): string {
  return `${tabId}:${appId}`;
}

function listTargets(): Array<{ tabId: number; appId: string; lastSeen: number }> {
  return [...runtimeTargets.values()].sort((left, right) => {
    return right.lastSeen - left.lastSeen;
  });
}

function notifyTargets(): void {
  const targets = listTargets();
  for (const port of panelPorts) {
    port.postMessage({
      kind: "stroid:targets",
      targets,
    });
  }
}

function recordTarget(tabId: number, appId: string): void {
  runtimeTargets.set(targetKey(tabId, appId), {
    tabId,
    appId,
    lastSeen: Date.now(),
  });
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

function sendHandshakeToKnownTabs(): void {
  chrome.tabs?.query({}, (tabs: Array<{ id?: number }>) => {
    for (const tab of tabs) {
      if (typeof tab.id !== "number") {
        continue;
      }
      forwardCommandToPage(tab.id, { type: "panel:handshake" });
    }
  });
}

chrome.runtime.onConnect.addListener((port: any) => {
  if (port.name !== PANEL_PORT_NAME) {
    return;
  }

  panelPorts.add(port);
  panelContext.set(port, { inspectedTabId: null });

  port.onMessage.addListener((message: unknown) => {
    const record = asRecord(message);
    if (!record || typeof record.kind !== "string") {
      return;
    }

    if (record.kind === "stroid:panel-ready" && typeof record.tabId === "number") {
      panelContext.set(port, { inspectedTabId: record.tabId });
      recordTarget(record.tabId, "stroid-runtime");
      notifyTargets();
      forwardCommandToPage(record.tabId, { type: "panel:handshake" });
      sendHandshakeToKnownTabs();
      return;
    }

    if (record.kind === "stroid:request-targets") {
      port.postMessage({
        kind: "stroid:targets",
        targets: listTargets(),
      });
      return;
    }

    if (
      record.kind === "stroid:panel-command" &&
      isDevtoolCommand(record.command)
    ) {
      const context = panelContext.get(port);
      const targetTabId =
        typeof record.targetTabId === "number"
          ? record.targetTabId
          : context?.inspectedTabId;

      if (typeof targetTabId !== "number") {
        return;
      }

      if (typeof record.appId === "string") {
        recordTarget(targetTabId, record.appId);
      }

      forwardCommandToPage(
        targetTabId,
        record.command,
        typeof record.appId === "string" ? record.appId : undefined,
      );
    }
  });

  port.onDisconnect.addListener(() => {
    panelPorts.delete(port);
  });
});

chrome.runtime.onMessage.addListener((message: unknown, sender: any) => {
  const record = asRecord(message);
  const tabId = sender?.tab?.id;

  if (!record || record.kind !== "stroid:bridge-envelope" || typeof tabId !== "number") {
    return;
  }

  const envelope = asRecord(record.packet)?.envelope;
  if (!isBridgeEnvelope(envelope)) {
    return;
  }

  const appId =
    typeof envelope.appId === "string" && envelope.appId
      ? envelope.appId
      : "stroid-runtime";
  recordTarget(tabId, appId);
  notifyTargets();

  for (const port of panelPorts) {
    port.postMessage({
      kind: "stroid:panel-envelope",
      sourceTabId: tabId,
      envelope,
    });
  }
});


