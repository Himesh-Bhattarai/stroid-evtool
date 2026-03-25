/**
 * @module tests/helpers/mock-storage
 * @memberof StroidDevtoolsTests
 * @what owns In-memory `localStorage` test helper.
 * @who owns Stroid Devtools maintainers.
 * @likelyBreakpoint Snapshot/session tests that rely on browser storage.
 * @public
 */
export function createMockStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
    dump() {
      return Object.fromEntries(map.entries());
    },
  };
}
