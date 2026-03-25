/**
 * @module src/bridge/channel
 * @memberof StroidDevtools
 * @typedef {Record<string, unknown>} ModuleDocShape
 * @what owns Core logic for src/bridge/channel.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Runtime event normalization, UI render paths, or command routing in this module.
 * @param {unknown} [input] Module-level JSDoc anchor for tooling consistency.
 * @returns {void}
 * @public
 */
import {
  DEFAULT_CHANNEL_KEY,
  STROID_DEVTOOLS_NAMESPACE,
  type BridgeEnvelope,
  type BridgePacket,
  type BridgeTransportMode,
  type Unsubscribe,
} from "../types.js";

export interface BridgeChannel {
  send(envelope: BridgeEnvelope): void;
  subscribe(listener: (envelope: BridgeEnvelope) => void): Unsubscribe;
  destroy(): void;
}

interface CreateBridgeChannelOptions {
  channelKey?: string;
  transport?: BridgeTransportMode;
}

export function createBridgePacket(
  envelope: BridgeEnvelope,
  channelKey = DEFAULT_CHANNEL_KEY,
): BridgePacket {
  return {
    namespace: STROID_DEVTOOLS_NAMESPACE,
    channelKey,
    envelope,
  };
}

export function isBridgePacket(
  value: unknown,
  channelKey = DEFAULT_CHANNEL_KEY,
): value is BridgePacket {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<BridgePacket>;
  return (
    candidate.namespace === STROID_DEVTOOLS_NAMESPACE &&
    candidate.channelKey === channelKey &&
    typeof candidate.envelope === "object" &&
    candidate.envelope !== null
  );
}

export function createBridgeChannel(
  options: CreateBridgeChannelOptions = {},
): BridgeChannel {
  const channelKey = options.channelKey ?? DEFAULT_CHANNEL_KEY;
  const transport = options.transport ?? "both";
  const listeners = new Set<(envelope: BridgeEnvelope) => void>();
  const canUseWindow =
    transport !== "broadcast" &&
    typeof window !== "undefined" &&
    typeof window.postMessage === "function";
  const broadcast =
    transport !== "window" && typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(channelKey)
      : null;

  const emit = (envelope: BridgeEnvelope): void => {
    for (const listener of listeners) {
      listener(envelope);
    }
  };

  const handleWindowMessage = (event: MessageEvent<unknown>): void => {
    if (typeof window === "undefined" || event.source !== window) {
      return;
    }

    if (!isBridgePacket(event.data, channelKey)) {
      return;
    }

    emit(event.data.envelope);
  };

  const handleBroadcastMessage = (event: MessageEvent<unknown>): void => {
    if (!isBridgePacket(event.data, channelKey)) {
      return;
    }

    emit(event.data.envelope);
  };

  if (canUseWindow) {
    window.addEventListener("message", handleWindowMessage);
  }

  if (broadcast) {
    broadcast.onmessage = handleBroadcastMessage;
  }

  return {
    send(envelope) {
      const packet = createBridgePacket(envelope, channelKey);

      if (canUseWindow) {
        window.postMessage(packet, "*");
      }

      if (broadcast) {
        broadcast.postMessage(packet);
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    destroy() {
      listeners.clear();

      if (canUseWindow) {
        window.removeEventListener("message", handleWindowMessage);
      }

      if (broadcast) {
        broadcast.onmessage = null;
        broadcast.close();
      }
    },
  };
}


