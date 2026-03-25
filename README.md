# Stroid Devtools

Stroid Devtools is a registry-first browser DevTools extension for inspecting a live Stroid runtime. This repository now ships the strict Phase 1 MVP from the roadmap: the bridge contract, the extension shell, the store registry, the store inspector, and the basic timeline.

## Phase 1 scope

- Bridge architecture with an event emitter plus `postMessage` / `BroadcastChannel` transport
- Shared `DevtoolEvent` contract including `causedBy`, `depth`, and `performance`
- Store registry with reset, delete, and async re-fetch actions
- Store inspector with current state, previous state, and metadata
- Timeline with timestamps, store IDs, event types, and mutation summaries
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

The roadmap says not to jump ahead, so these stay out of Phase 1 for now:

- Structural diff engine
- Pause / filter / clear timeline controls
- Subscription debugging dashboard
- Full control panel editing
- PSR panels
- Dependency graph and cause-trace visualizer
