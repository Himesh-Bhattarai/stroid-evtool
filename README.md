# Stroid Devtools

Stroid Devtools is a registry-first browser DevTools extension for inspecting a live Stroid runtime. The repository now covers Phase 1 and the first real Phase 2 debugging layer from the roadmap: structural diffing, async and subscription diagnostics, timeline controls, runtime modes, and direct state editing hooks.

## Current scope

- Bridge architecture with an event emitter plus `postMessage` / `BroadcastChannel` transport
- Shared `DevtoolEvent` contract including `causedBy`, `depth`, and `performance`
- Store registry with reset, delete, reset-all, and async re-fetch actions
- Store inspector with current state, previous state, structural diff, field history, subscription debugging, PSR activity, and edit-state controls
- Timeline with timestamps, store IDs, diff summaries, pause/filter/clear controls, and runtime mode toggles
- Async lifecycle and alert diagnostics surfaced directly in the panel
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

## What is intentionally not built yet

The roadmap says not to jump ahead, so these still remain for later phases:

- Dependency graph and cause-trace visualizer
- Live constraints and store health panels
- Snapshot compare/restore flows
- Scenario runner and session export
