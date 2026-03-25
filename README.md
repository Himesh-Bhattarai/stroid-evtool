# Stroid Devtools

Stroid Devtools is a registry-first browser DevTools extension for inspecting a live Stroid runtime. The repository now covers Phase 1 through the core of Phase 4 from the roadmap, including dependency graphing, cause tracing, snapshots, scenario execution, schema checks, and a dedicated performance view.

## Current scope

- Bridge architecture with an event emitter plus `postMessage` / `BroadcastChannel` transport
- Shared `DevtoolEvent` contract including `causedBy`, `depth`, and `performance`
- Store registry with reset, delete, reset-all, and async re-fetch actions
- Store inspector with current state, previous state, structural diff, field history, cause trace, subscription debugging, live constraints, store health, PSR activity, jump-to-state snapshots, and edit-state controls
- Timeline with timestamps, store IDs, diff summaries, pause/filter/clear controls, runtime mode toggles, and click-to-inspect snapshots
- Dependency graph view with interactive store selection and highlighted propagation neighbors
- Store health scoring plus lightweight performance sparklines in the registry
- Async lifecycle and alert diagnostics surfaced directly in the panel
- Snapshot lab with save/compare/restore workflows
- Scenario runner for scripted command sequences
- Scenario step-by-step diff summaries after each scripted action
- Schema awareness and rule-based "Why is this slow?" diagnostics
- Session export as `.stroid-session`
- Session import from `.stroid-session`
- Performance tab with global and per-store metrics
- Keyboard shortcuts: `P` pause, `C` clear, `F` focus filter, `G` graph toggle
- Multi-target switcher for multiple app instances / tabs
- Control panel mutator trigger and runtime store creation
- Extension messaging path that relays runtime events from the page into the DevTools panel

## Build

```bash
npm run build
```

The build writes the compiled extension into `dist/`. Load `dist/` as an unpacked Chromium extension.

## Runtime integration

Attach the bridge inside the app that owns the Stroid registry:

```ts
import { createStroidDevtoolsBridge } from "stroid-devtools";

createStroidDevtoolsBridge(stroidRegistry, {
  appId: "checkout-app",
});
```

The bridge expects a registry-like object with:

- `onEvent(listener)` to stream runtime events
- `getRegistrySnapshot()` or `getStores()` to provide store metadata and snapshots
- `getStoreSnapshot(storeId)` for precise store updates after events
- `resetStore(storeId)`, `deleteStore(storeId)`, and `refetchStore(storeId)` or a single `dispatchDevtoolsCommand(command)`

## Project layout

```text
src/
  bridge/
  buffer/
  panel/
  extension/
  types.ts
static/extension/
scripts/build.mjs
```

## Roadmap status

Roadmap compliance is tracked in `ROADMAP_COMPLIANCE.md` and is currently marked complete for the audited contract.
