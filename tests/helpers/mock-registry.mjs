/**
 * @module tests/helpers/mock-registry
 * @memberof StroidDevtoolsTests
 * @what owns Mock Stroid runtime registry for bridge command/event tests.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Bridge routing and snapshot fallback tests.
 * @public
 */
export function createMockRegistry(overrides = {}) {
  let eventListener = null;
  const calls = {
    resetStore: [],
    editStore: [],
    deleteStore: [],
    refetchStore: [],
    triggerStoreMutator: [],
    createStore: [],
    resetAllStores: 0,
    setDevtoolsMode: [],
    replayEvents: [],
    dispatchDevtoolsCommand: [],
  };

  const stores = new Map(
    (overrides.stores ?? [
      [
        "cart",
        {
          storeId: "cart",
          storeType: "sync",
          status: "idle",
          subscriberCount: 0,
          currentState: { total: 0 },
        },
      ],
    ]).map(([id, store]) => [id, { ...store }]),
  );

  const registry = {
    onEvent(listener) {
      eventListener = listener;
      return () => {
        eventListener = null;
      };
    },
    getRegistrySnapshot() {
      return [...stores.values()];
    },
    getStoreSnapshot(storeId) {
      return stores.get(storeId) ?? null;
    },
    resetStore(storeId) {
      calls.resetStore.push(storeId);
    },
    editStore(storeId, state) {
      calls.editStore.push({ storeId, state });
      if (stores.has(storeId)) {
        stores.set(storeId, {
          ...stores.get(storeId),
          currentState: state,
        });
      }
    },
    deleteStore(storeId) {
      calls.deleteStore.push(storeId);
      stores.delete(storeId);
    },
    refetchStore(storeId) {
      calls.refetchStore.push(storeId);
    },
    triggerStoreMutator(storeId, mutator, args) {
      calls.triggerStoreMutator.push({ storeId, mutator, args });
    },
    createStore(storeId, options) {
      calls.createStore.push({ storeId, options });
      stores.set(storeId, {
        storeId,
        storeType: options?.storeType ?? "sync",
        status: "idle",
        subscriberCount: 0,
        currentState: options?.initialState ?? {},
      });
    },
    resetAllStores() {
      calls.resetAllStores += 1;
    },
    setDevtoolsMode(mode) {
      calls.setDevtoolsMode.push(mode);
    },
    replayEvents(speed) {
      calls.replayEvents.push(speed);
    },
    dispatchDevtoolsCommand(command) {
      calls.dispatchDevtoolsCommand.push(command);
    },
    emit(event) {
      if (eventListener) {
        eventListener(event);
      }
    },
    calls,
    stores,
  };

  return registry;
}
