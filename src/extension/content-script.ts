/**
 * @module src/extension/content-script
 * @memberof StroidDevtools
 * @typedef {Record<string, unknown>} ModuleDocShape
 * @what owns Core logic for src/extension/content-script.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Runtime event normalization, UI render paths, or command routing in this module.
 * @param {unknown} [input] Module-level JSDoc anchor for tooling consistency.
 * @returns {void}
 * @public
 */
const STROID_DEVTOOLS_NAMESPACE = "stroid:devtools";
const DEFAULT_CHANNEL_KEY = "stroid-devtools";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as Record<string, unknown>;
}

function isBridgePacket(value: unknown): boolean {
  const record = asRecord(value);
  return (
    record?.namespace === STROID_DEVTOOLS_NAMESPACE &&
    record.channelKey === DEFAULT_CHANNEL_KEY &&
    typeof record.envelope === "object" &&
    record.envelope !== null
  );
}

window.addEventListener("message", (event) => {
  if (event.source !== window || !isBridgePacket(event.data)) {
    return;
  }

  chrome.runtime?.sendMessage({
    kind: "stroid:bridge-envelope",
    packet: event.data,
  });
});

chrome.runtime?.onMessage?.addListener((message: unknown) => {
  const record = asRecord(message);
  if (record?.kind !== "stroid:forward-to-page" || !isBridgePacket(record.packet)) {
    return;
  }

  window.postMessage(record.packet, "*");
});


