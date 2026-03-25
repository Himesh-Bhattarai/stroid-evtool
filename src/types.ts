export const STROID_DEVTOOLS_NAMESPACE = "stroid:devtools";
export const DEFAULT_CHANNEL_KEY = "stroid-devtools";

export const DEVTOOL_EVENT_TYPES = [
  "store:created",
  "store:updated",
  "store:deleted",
  "store:reset",
  "async:start",
  "async:success",
  "async:error",
  "dependency:triggered",
  "subscription:added",
  "subscription:removed",
  "psr:preview",
  "psr:commit",
  "psr:blocked",
  "devtool:override",
  "replay:step",
  "freeze:start",
  "freeze:end",
] as const;

export const STORE_TYPES = ["sync", "async", "derived", "unknown"] as const;
export const STORE_STATUSES = ["idle", "loading", "success", "error"] as const;

export type DevtoolEventType = (typeof DEVTOOL_EVENT_TYPES)[number];
export type StoreType = (typeof STORE_TYPES)[number];
export type StoreStatus = (typeof STORE_STATUSES)[number];
export type BridgeTransportMode = "window" | "broadcast" | "both";
export type RuntimeMode = "debug" | "trace" | "freeze" | "replay";
export type Unsubscribe = () => void;

export interface DevtoolEvent {
  id: string;
  timestamp: number;
  type: DevtoolEventType;
  storeId?: string;
  before?: unknown;
  after?: unknown;
  mutator?: string;
  causedBy?: string;
  depth?: number;
  performance?: {
    duration?: number;
  };
  meta?: Record<string, unknown>;
}

export interface StoreAsyncSnapshot {
  duration?: number;
  cacheSource?: "cache" | "network";
  triggerReason?: string;
  error?: string;
  lastStartedAt?: number;
  lastFinishedAt?: number;
  lastOutcome?: "success" | "error";
}

export interface StroidStoreSnapshot {
  storeId: string;
  storeType: StoreType;
  status: StoreStatus;
  subscriberCount: number;
  createdAt?: number;
  updatedAt?: number;
  currentState?: unknown;
  previousState?: unknown;
  lastEventId?: string;
  async?: StoreAsyncSnapshot;
  meta?: Record<string, unknown>;
}

export type DevtoolCommand =
  | {
      type: "store:reset";
      storeId: string;
    }
  | {
      type: "store:edit";
      storeId: string;
      state: unknown;
    }
  | {
      type: "store:delete";
      storeId: string;
    }
  | {
      type: "store:refetch";
      storeId: string;
    }
  | {
      type: "stores:reset-all";
    }
  | {
      type: "devtools:set-mode";
      mode: RuntimeMode;
    }
  | {
      type: "devtools:replay";
      speed: number;
    }
  | {
      type: "panel:handshake";
    };

export interface BridgeEventEnvelope {
  type: "bridge:event";
  appId: string;
  emittedAt: number;
  event: DevtoolEvent;
}

export interface BridgeSnapshotEnvelope {
  type: "bridge:snapshot";
  appId: string;
  emittedAt: number;
  stores: StroidStoreSnapshot[];
}

export interface BridgeStorePatchEnvelope {
  type: "bridge:store-patch";
  appId: string;
  emittedAt: number;
  store: StroidStoreSnapshot;
}

export interface BridgeCommandEnvelope {
  type: "bridge:command";
  appId?: string;
  emittedAt: number;
  command: DevtoolCommand;
}

export type BridgeEnvelope =
  | BridgeEventEnvelope
  | BridgeSnapshotEnvelope
  | BridgeStorePatchEnvelope
  | BridgeCommandEnvelope;

export interface BridgePacket {
  namespace: typeof STROID_DEVTOOLS_NAMESPACE;
  channelKey: string;
  envelope: BridgeEnvelope;
}

export interface StroidRegistryLike {
  onEvent(listener: (event: unknown) => void): Unsubscribe;
  getRegistrySnapshot?(): Iterable<unknown> | Record<string, unknown> | unknown[];
  getStores?(): Iterable<unknown> | Record<string, unknown> | unknown[];
  getStoreSnapshot?(storeId: string): unknown;
  resetStore?(storeId: string): void;
  editStore?(storeId: string, state: unknown): void;
  deleteStore?(storeId: string): void;
  refetchStore?(storeId: string): void;
  resetAllStores?(): void;
  setDevtoolsMode?(mode: RuntimeMode): void;
  replayEvents?(speed: number): void;
  dispatchDevtoolsCommand?(command: DevtoolCommand): void;
}

export interface CreateBridgeOptions {
  appId?: string;
  channelKey?: string;
  transport?: BridgeTransportMode;
}

export interface StroidDevtoolsBridge {
  appId: string;
  emitSnapshot(): void;
  subscribe(listener: (envelope: BridgeEnvelope) => void): Unsubscribe;
  destroy(): void;
}
