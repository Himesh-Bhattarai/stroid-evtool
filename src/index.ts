/**
 * @module src/index
 * @memberof StroidDevtools
 * @typedef {Record<string, unknown>} ModuleDocShape
 * @what owns Core logic for src/index.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Runtime event normalization, UI render paths, or command routing in this module.
 * @param {unknown} [input] Module-level JSDoc anchor for tooling consistency.
 * @returns {void}
 * @public
 */
export { EventBuffer } from "./buffer/index.js";
export { createStroidDevtoolsBridge } from "./bridge/index.js";
export { createBridgeChannel } from "./bridge/channel.js";
export { diff, hasDiff, summarizeDiff } from "./diff/index.js";
export type {
  BridgeEnvelope,
  BridgePacket,
  CreateBridgeOptions,
  DevtoolCommand,
  DevtoolEvent,
  DevtoolEventType,
  RuntimeMode,
  StroidDevtoolsBridge,
  StroidRegistryLike,
  StroidStoreSnapshot,
  StoreStatus,
  StoreType,
  Unsubscribe,
} from "./types.js";


