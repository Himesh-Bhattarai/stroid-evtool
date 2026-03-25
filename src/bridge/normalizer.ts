import {
  DEVTOOL_EVENT_TYPES,
  STORE_STATUSES,
  STORE_TYPES,
  type DevtoolEvent,
  type DevtoolEventType,
  type StroidRegistryLike,
  type StroidStoreSnapshot,
  type StoreStatus,
  type StoreType,
} from "../types.js";

const EVENT_TYPE_SET = new Set<string>(DEVTOOL_EVENT_TYPES);
const STORE_TYPE_SET = new Set<string>(STORE_TYPES);
const STORE_STATUS_SET = new Set<string>(STORE_STATUSES);

let eventSequence = 0;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  return value as UnknownRecord;
}

function readString(record: UnknownRecord | null, keys: string[]): string | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function readNumber(record: UnknownRecord | null, keys: string[]): number | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function readBoolean(record: UnknownRecord | null, keys: string[]): boolean | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
}

function readUnknown(record: UnknownRecord | null, keys: string[]): unknown {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function nextEventId(): string {
  eventSequence += 1;
  return `evt_${Date.now()}_${eventSequence}`;
}

function normalizeEventType(value: string | undefined): DevtoolEventType {
  if (value && EVENT_TYPE_SET.has(value)) {
    return value as DevtoolEventType;
  }

  return "store:updated";
}

function normalizeStoreType(value: string | undefined, record: UnknownRecord | null): StoreType {
  if (value && STORE_TYPE_SET.has(value)) {
    return value as StoreType;
  }

  if (readBoolean(record, ["isDerived", "derived"]) === true) {
    return "derived";
  }

  if (readBoolean(record, ["isAsync", "async"]) === true) {
    return "async";
  }

  return "sync";
}

function normalizeStoreStatus(
  value: string | undefined,
  record: UnknownRecord | null,
): StoreStatus {
  if (value && STORE_STATUS_SET.has(value)) {
    return value as StoreStatus;
  }

  if (readBoolean(record, ["isLoading", "loading"]) === true) {
    return "loading";
  }

  if (readUnknown(record, ["error", "lastError"]) !== undefined) {
    return "error";
  }

  if (readBoolean(record, ["isReady", "success"]) === true) {
    return "success";
  }

  return "idle";
}

function getSubscriberCount(record: UnknownRecord | null): number {
  const directCount = readNumber(record, ["subscriberCount", "subscriptionCount"]);
  if (typeof directCount === "number") {
    return directCount;
  }

  const subscribers = readUnknown(record, ["subscribers"]);
  if (Array.isArray(subscribers)) {
    return subscribers.length;
  }

  return 0;
}

function buildStoreFallback(storeId: string, event?: DevtoolEvent): StroidStoreSnapshot {
  return {
    storeId,
    storeType: event?.type.startsWith("async:") ? "async" : "sync",
    status: inferStatusFromEvent(event),
    subscriberCount: 0,
    createdAt: event?.timestamp,
    updatedAt: event?.timestamp,
    currentState: event?.after,
    previousState: event?.before,
    lastEventId: event?.id,
    meta: event?.meta,
  };
}

function inferStatusFromEvent(event?: DevtoolEvent): StoreStatus {
  switch (event?.type) {
    case "async:start":
      return "loading";
    case "async:success":
      return "success";
    case "async:error":
      return "error";
    default:
      return "idle";
  }
}

function isIterableSource(value: unknown): value is Iterable<unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Symbol.iterator in value;
}

function toStoreArray(source: Iterable<unknown> | Record<string, unknown> | unknown[]): unknown[] {
  if (Array.isArray(source)) {
    return source;
  }

  if (isIterableSource(source)) {
    return [...source];
  }

  return Object.values(source as Record<string, unknown>);
}

export function normalizeDevtoolEvent(rawEvent: unknown): DevtoolEvent {
  const record = asRecord(rawEvent);
  const metaRecord =
    asRecord(readUnknown(record, ["meta", "metadata"])) ??
    (record ? { rawEventType: readUnknown(record, ["type", "eventType"]) } : undefined);

  return {
    id: readString(record, ["id"]) ?? nextEventId(),
    timestamp: readNumber(record, ["timestamp", "time", "createdAt", "updatedAt"]) ?? Date.now(),
    type: normalizeEventType(readString(record, ["type", "eventType"])),
    storeId: readString(record, ["storeId", "idRef", "store"]),
    before: readUnknown(record, ["before", "previousState", "previous", "prev"]),
    after: readUnknown(record, ["after", "currentState", "state", "value", "next"]),
    mutator: readString(record, ["mutator", "action", "mutation"]),
    causedBy: readString(record, ["causedBy", "cause", "triggeredBy"]),
    depth: readNumber(record, ["depth"]),
    performance: {
      duration:
        readNumber(asRecord(readUnknown(record, ["performance"])), ["duration"]) ??
        readNumber(record, ["duration"]),
    },
    meta: metaRecord,
  };
}

export function normalizeStoreSnapshot(
  rawStore: unknown,
  fallbackStoreId?: string,
  event?: DevtoolEvent,
): StroidStoreSnapshot | null {
  const record = asRecord(rawStore);
  const storeId =
    readString(record, ["storeId", "id", "name"]) ??
    fallbackStoreId ??
    event?.storeId;

  if (!storeId) {
    return null;
  }

  const metaRecord = asRecord(readUnknown(record, ["meta", "metadata"])) ?? event?.meta;
  const asyncRecord = asRecord(readUnknown(record, ["async"]));

  return {
    storeId,
    storeType: normalizeStoreType(readString(record, ["storeType", "type", "kind"]), record),
    status: normalizeStoreStatus(readString(record, ["status"]), record),
    subscriberCount: getSubscriberCount(record),
    createdAt:
      readNumber(record, ["createdAt"]) ??
      event?.timestamp,
    updatedAt:
      readNumber(record, ["updatedAt", "lastUpdated"]) ??
      event?.timestamp,
    currentState:
      readUnknown(record, ["currentState", "state", "snapshot", "value"]) ??
      event?.after,
    previousState:
      readUnknown(record, ["previousState", "previous", "prev"]) ??
      event?.before,
    lastEventId: event?.id ?? readString(record, ["lastEventId"]),
    async: {
      duration:
        readNumber(asyncRecord, ["duration"]) ??
        event?.performance?.duration,
      cacheSource: readString(asyncRecord, ["cacheSource"]) as "cache" | "network" | undefined,
      triggerReason: readString(asyncRecord, ["triggerReason"]),
      error:
        readString(asyncRecord, ["error"]) ??
        (typeof readUnknown(record, ["error", "lastError"]) === "string"
          ? (readUnknown(record, ["error", "lastError"]) as string)
          : undefined),
      lastStartedAt: readNumber(asyncRecord, ["lastStartedAt"]),
      lastFinishedAt: readNumber(asyncRecord, ["lastFinishedAt"]),
    },
    meta: metaRecord,
  };
}

export function snapshotRegistry(registry: StroidRegistryLike): StroidStoreSnapshot[] {
  const rawStores =
    (typeof registry.getRegistrySnapshot === "function" && registry.getRegistrySnapshot()) ||
    (typeof registry.getStores === "function" && registry.getStores()) ||
    [];

  return toStoreArray(rawStores)
    .map((rawStore) => normalizeStoreSnapshot(rawStore))
    .filter((store): store is StroidStoreSnapshot => store !== null);
}

export function snapshotStore(
  registry: StroidRegistryLike,
  storeId: string,
  event?: DevtoolEvent,
): StroidStoreSnapshot {
  if (typeof registry.getStoreSnapshot === "function") {
    const directSnapshot = normalizeStoreSnapshot(
      registry.getStoreSnapshot(storeId),
      storeId,
      event,
    );

    if (directSnapshot) {
      return directSnapshot;
    }
  }

  const registrySnapshot = snapshotRegistry(registry).find((store) => store.storeId === storeId);
  return registrySnapshot ?? buildStoreFallback(storeId, event);
}
