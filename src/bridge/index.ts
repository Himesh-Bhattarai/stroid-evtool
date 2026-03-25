import { createBridgeChannel } from "./channel.js";
import { normalizeDevtoolEvent, snapshotRegistry, snapshotStore } from "./normalizer.js";
import type {
  BridgeEnvelope,
  CreateBridgeOptions,
  DevtoolCommand,
  DevtoolEvent,
  StroidDevtoolsBridge,
  StroidRegistryLike,
  Unsubscribe,
} from "../types.js";

class EnvelopeEmitter {
  private readonly listeners = new Set<(envelope: BridgeEnvelope) => void>();

  emit(envelope: BridgeEnvelope): void {
    for (const listener of this.listeners) {
      listener(envelope);
    }
  }

  subscribe(listener: (envelope: BridgeEnvelope) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

function routeCommand(registry: StroidRegistryLike, command: DevtoolCommand): void {
  if (typeof registry.dispatchDevtoolsCommand === "function") {
    registry.dispatchDevtoolsCommand(command);
    return;
  }

  switch (command.type) {
    case "panel:handshake":
      return;
    case "store:reset":
      registry.resetStore?.(command.storeId);
      return;
    case "store:delete":
      registry.deleteStore?.(command.storeId);
      return;
    case "store:refetch":
      registry.refetchStore?.(command.storeId);
      return;
  }
}

function createOverrideEvent(command: DevtoolCommand, failure?: Error): DevtoolEvent {
  const storeId = "storeId" in command ? command.storeId : undefined;
  return {
    id: `override_${Date.now()}_${command.type}`,
    timestamp: Date.now(),
    type: "devtool:override",
    storeId,
    mutator: command.type,
    meta: {
      source: "panel",
      failed: Boolean(failure),
      error: failure?.message,
    },
  };
}

export function createStroidDevtoolsBridge(
  registry: StroidRegistryLike,
  options: CreateBridgeOptions = {},
): StroidDevtoolsBridge {
  const appId = options.appId ?? "stroid-runtime";
  const channel = createBridgeChannel({
    channelKey: options.channelKey,
    transport: options.transport,
  });
  const emitter = new EnvelopeEmitter();

  const publish = (envelope: BridgeEnvelope): void => {
    emitter.emit(envelope);
    channel.send(envelope);
  };

  const emitSnapshot = (): void => {
    publish({
      type: "bridge:snapshot",
      appId,
      emittedAt: Date.now(),
      stores: snapshotRegistry(registry),
    });
  };

  const emitStorePatch = (storeId: string, event?: DevtoolEvent): void => {
    publish({
      type: "bridge:store-patch",
      appId,
      emittedAt: Date.now(),
      store: snapshotStore(registry, storeId, event),
    });
  };

  const unsubscribeRegistry = registry.onEvent((rawEvent) => {
    const event = normalizeDevtoolEvent(rawEvent);

    publish({
      type: "bridge:event",
      appId,
      emittedAt: Date.now(),
      event,
    });

    if (event.storeId) {
      emitStorePatch(event.storeId, event);
    } else if (event.type === "store:created" || event.type === "store:deleted") {
      emitSnapshot();
    }
  });

  const unsubscribeChannel = channel.subscribe((envelope) => {
    if (envelope.type !== "bridge:command") {
      return;
    }

    if (envelope.appId && envelope.appId !== appId) {
      return;
    }

    if (envelope.command.type === "panel:handshake") {
      emitSnapshot();
      return;
    }

    let failure: Error | undefined;

    try {
      routeCommand(registry, envelope.command);
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }

    const overrideEvent = createOverrideEvent(envelope.command, failure);
    publish({
      type: "bridge:event",
      appId,
      emittedAt: Date.now(),
      event: overrideEvent,
    });

    if ("storeId" in envelope.command) {
      emitStorePatch(envelope.command.storeId, overrideEvent);
      return;
    }

    emitSnapshot();
  });

  emitSnapshot();

  return {
    appId,
    emitSnapshot,
    subscribe(listener) {
      return emitter.subscribe(listener);
    },
    destroy() {
      unsubscribeRegistry();
      unsubscribeChannel();
      channel.destroy();
    },
  };
}
