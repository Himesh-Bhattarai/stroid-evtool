# Stroid DevTools

Stroid DevTools is a runtime debugger for state systems.

It gives you one control room to inspect stores, trace why state changed, visualize dependencies, replay and snapshot runtime behavior, and control the runtime safely from a DevTools panel.

Instead of asking "what happened?", you can see:

- what changed
- why it changed
- what it affected

## Quick Demo (30 Seconds)

1. Open the **Stroid Devtool** panel in browser DevTools.
2. Select a store from the registry.
3. Watch live updates in the timeline.
4. Click an event row to inspect diff + cause trace.
5. Run a scenario and compare snapshots to reproduce a bug.

Now debugging is visual and traceable instead of guesswork.

## Install And Run (2-Minute Quick Start)

### 1) Install dependencies

```bash
npm install
```

### 2) Build extension + library output

```bash
npm run build
```

Build output is written to `dist/`.

### 3) Load extension in Chromium browser

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder
5. Open your app tab, then open DevTools
6. Open the **Stroid Devtool** panel

## Daily Workflow

### 1) Connect and target the right runtime

- Open panel and pick target app/tab from the top selector.
- Handshake runs automatically when target changes.

### 2) Inspect a store

- Select a store from registry.
- Review current vs previous state.
- Use state search to find keys/values quickly.

### 3) Trace behavior in timeline

- Filter by store and event type.
- Pause recording when you want to inspect a stable slice.
- Jump to a timeline row to inspect that event snapshot.

### 4) Explain why it changed

- Open cause trace for causal chain.
- Use dependency graph to see upstream/downstream impact.
- Check alerts and health score for instability patterns.

### 5) Reproduce and test fixes

- Run a scenario script in inspector.
- Save snapshots before/after.
- Compare snapshots to verify the fix.
- Export a `.stroid-session` file to share with teammates.

## What Problems It Solves

- Which store changed, and when?
- What exactly changed inside it?
- What caused that change?
- Which other stores were affected?
- Why is this store updating so often?
- Is async state failing, retrying, or stuck?
- Does current state still match the expected schema?
- Can I capture this moment and compare it later?
- Can I replay a bug instead of reproducing it manually?

## Why It Matters

- Eliminates blind debugging
- Makes state transitions visible and traceable
- Surfaces hidden issues in async and reactive flows
- Turns runtime behavior into something explainable
- Enables reproducible debugging with snapshots and replay

## Core Capabilities

- Inspect stores and state changes in real time
- Trace causal chains of updates
- Visualize dependency graph propagation
- Replay and snapshot runtime behavior
- Diagnose performance and schema issues

## Advanced Features

### Observation

- Store registry with status, subscribers, update freshness, and controls
- Store inspector with current/previous state and structural diff
- Timeline with event rows, filters, pause/clear, and jump-to-event
- Async lifecycle tracking (`async:start`, `async:success`, `async:error`)
- Field-level history in inspector

### Explanation

- Dependency graph with propagation flash
- Event cause tracing using `causedBy` chains
- Derived trace with changed inputs and recompute cost
- Constraint status panel for PSR events
- Smart alerts (over-subscription, thrashing, loop suspicion)
- Store health scoring
- Rule-based slow-analysis hints

### Control

- Edit store state
- Reset, delete, and refetch store
- Trigger mutator with JSON args
- Create store at runtime
- Reset all stores
- Runtime modes (`debug`, `trace`, `freeze`, `replay`)
- Scenario runner (scripted command/wait steps)
- Snapshot save/compare/restore
- Session export/import
- Multi-target switching across tabs/apps

## DevTools Philosophy

The system is built around three layers:

- Observation: see what is happening
- Explanation: understand why it is happening
- Control: change behavior and reproduce issues

That design turns the panel from a passive viewer into an active debugging platform.

## Architecture Overview

### `src/panel/index.tsx`
Panel coordinator. It connects registry, inspector, timeline, dependency graph, performance view, and command routing.

### `src/panel/insights.ts`
Interpretation layer. It derives:

- cause traces
- dependency relationships
- derived-store recompute traces
- constraint state views
- store health scores

### `src/panel/session-tools.ts`
Runtime analysis and simulation layer. It powers:

- snapshots and snapshot comparison
- scenario runner
- performance reports
- "why is this slow?" diagnostics
- schema validation
- session export/import (`.stroid-session`)

### `src/bridge/index.ts` and `src/bridge/channel.ts`
Runtime bridge layer. It:

- normalizes runtime events
- sends/receives bridge envelopes
- supports `postMessage` and `BroadcastChannel`
- routes panel commands back to the runtime

## Runtime Integration

Attach the bridge inside the app that owns the Stroid registry:

```ts
import { createStroidDevtoolsBridge } from "stroid-devtools";

const bridge = createStroidDevtoolsBridge(stroidRegistry, {
  appId: "checkout-app",
  channelKey: "stroid-devtools",
  transport: "both", // "window" | "broadcast" | "both"
});
```

### Expected registry contract

Required:

- `onEvent(listener)`

Recommended for full feature support:

- `getRegistrySnapshot()` or `getStores()`
- `getStoreSnapshot(storeId)`
- `resetStore(storeId)`
- `editStore(storeId, state)`
- `deleteStore(storeId)`
- `refetchStore(storeId)`
- `triggerStoreMutator(storeId, mutator, args?)`
- `createStore(storeId, options?)`
- `resetAllStores()`
- `setDevtoolsMode(mode)`
- `replayEvents(speed)`

Alternative command path:

- `dispatchDevtoolsCommand(command)` (single command dispatcher)

## Scenario Runner Format

Use JSON in the scenario editor:

```json
{
  "name": "Checkout Flow",
  "steps": [
    {
      "type": "command",
      "label": "Edit cart",
      "command": {
        "type": "store:edit",
        "storeId": "cart",
        "state": { "total": 12 }
      }
    },
    {
      "type": "wait",
      "label": "Settle",
      "ms": 50
    }
  ]
}
```

## Keyboard Shortcuts

- `P`: pause/resume timeline recording
- `C`: clear timeline
- `F`: focus store filter
- `G`: toggle timeline/graph view

## Testing

Run full build + tests:

```bash
npm test
```

Run tests only:

```bash
npm run test:unit
```

Current suite includes feature tests, edge-case tests, helper contract tests, fuzzy/randomized diff tests, and smoke tests for public API.

## Project Structure

```text
src/
  bridge/
  buffer/
  diff/
  extension/
  panel/
  types.ts
static/extension/
tests/
scripts/build.mjs
```

## Roadmap And Governance

- Product build contract: `ROADMAP.md`
- Commit status taxonomy: `STATUS.md`
- Contribution guide: `CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Security policy: `SECURITY.md`
- License: `LICENSE` (MIT)
- Release history: `CHANGELOG.md`

## One-line Summary

Stroid DevTools is the control room for state systems: runtime behavior becomes visible, explainable, and reproducible.
