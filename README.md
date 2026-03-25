# Stroid DevTools

> The control room for Stroid state systems. Runtime behavior becomes visible, explainable, and reproducible.

Stroid DevTools is a browser extension and runtime debugger built specifically for Stroid. It gives you one place to inspect stores, trace why state changed, visualize dependencies, replay runtime behavior, and control the system from a dedicated DevTools panel.

Built for complex state systems where logs and basic devtools are not enough.

---

## The Problem With Every Other Devtool

Most devtools answer one question: **what changed?**

They show you a log. They show you a diff. They stop there.

Stroid DevTools answers three questions:

- **What** changed
- **Why** it changed
- **What else** moved because of it

That difference matters most when you are debugging async chains, derived store propagation, or mutation violations — the situations where a log is useless and you need to see the system.

---

## Quick Demo (30 seconds)

[short video — coming soon]

1. Open DevTools → Stroid panel
2. Select a store
3. Watch updates in timeline
4. Click event → see diff + cause trace
5. Run scenario → reproduce bug

Debugging becomes visual, traceable, and reproducible.

---

## How It Compares

| Capability | Stroid DevTools | Redux DevTools | Zustand | React Query |
|---|---|---|---|---|
| Store registry view | ✔ | ✗ | ✗ | ✗ |
| Causal chain tracing | ✔ | ✗ | ✗ | ✗ |
| Dependency graph | ✔ | ✗ | ✗ | ✗ |
| Derived store trace | ✔ | ✗ | ✗ | ✗ |
| PSR constraint visibility | ✔ | ✗ | ✗ | ✗ |
| Async lifecycle tracking | ✔ | ✗ | ✗ | ✔ |
| Freeze propagation mid-flight | ✔ | ✗ | ✗ | ✗ |
| Scenario runner | ✔ | ✗ | ✗ | ✗ |
| Store health scoring | ✔ | ✗ | ✗ | ✗ |
| Field-level history | ✔ | partial | ✗ | ✗ |

The registry and dependency graph are the foundation. Everything else builds on top of them. No other tool has both.

---

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

---

## DevTools Connection

Stroid DevTools automatically connects when the extension is installed in development mode.

Manual bridge setup is available for advanced control:

```ts
import { createStroidDevtoolsBridge } from "stroid-devtools";

const bridge = createStroidDevtoolsBridge(stroidRegistry, {
  appId: "checkout-app",
  channelKey: "stroid-devtools",
  transport: "both", // "window" | "broadcast" | "both"
});
```

---

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
- Was this mutation blocked by a constraint, and why?

---

## Daily Workflow

### 1) Connect and target the right runtime

Open the panel and pick the target app or tab from the top selector. Handshake runs automatically when the target changes.

### 2) Inspect a store

Select a store from the registry. Review current vs previous state. Use state search to find keys or values quickly.

### 3) Trace behavior in timeline

Filter by store and event type. Pause recording when you want to inspect a stable slice. Jump to a timeline row to inspect that event snapshot.

### 4) Understand why it changed

Open the cause trace for the full causal chain. Use the dependency graph to see upstream and downstream impact. Check alerts and health score for instability patterns.

### 5) Reproduce and test fixes

Run a scenario script in the inspector. Save snapshots before and after. Compare snapshots to verify the fix. Export a `.stroid-session` file to share with teammates.

---

## Core Capabilities

Three layers, in order of depth:

**Observation** — see what is happening

- Store registry with status, subscribers, update freshness, and controls
- Store inspector with current and previous state, structural diff, and field-level history
- Timeline with event rows, filters, pause, clear, and jump-to-event
- Async lifecycle tracking (`async:start`, `async:success`, `async:error`)

**Explanation** — understand why it is happening

- Dependency graph with live propagation flash
- Event cause tracing using `causedBy` chains
- Derived store trace with changed inputs and recompute cost
- PSR constraint panel — shows blocked mutations, violations, and unsafe overrides
- Smart alerts (over-subscription, thrashing, loop suspicion)
- Store health scoring
- Rule-based slow-analysis diagnostics

**Control** — change behavior and reproduce issues

- Edit store state directly
- Reset, delete, and refetch stores
- Trigger mutators with JSON args
- Create stores at runtime
- Reset all stores
- Runtime modes: `debug`, `trace`, `freeze`, `replay`
- Scenario runner with scripted command and wait steps
- Snapshot save, compare, and restore
- Session export and import as `.stroid-session`
- Multi-target switching across tabs and apps

---

## PSR Integration

If your app uses PSR (the Stroid pre-commit validation layer), the devtool surfaces it automatically.

The constraint panel shows:

```
✔ cart.total >= 0
✔ inventory.stock >= reserved
✖ user.balance >= payment  ← violated at 14:03:21
```

Blocked mutations appear in the timeline in red. Unsafe commits appear in orange with the override reason. Violation frequency is tracked per store over the session.

This is the only devtool that makes pre-commit governance visible instead of silent.

---

## Runtime Modes

| Mode | What it does |
|---|---|
| `debug` | Default. Normal observation. |
| `trace` | Records full causal chains at every depth. Intentionally slower. |
| `freeze` | Stops propagation mid-flight. Inspect intermediate state across all stores. |
| `replay` | Replays buffered events at controlled speed. |

`freeze` is especially powerful: it is the only way to inspect the exact state of every store at a specific point mid-propagation, before downstream effects complete.

---

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

The scenario runner eliminates manual reproduction. Instead of clicking through the app to recreate a bug, you write the sequence once and run it as many times as needed.

---

## Architecture

### Three-Layer Model

```
┌─────────────────────────────────┐
│         DevTools Panel          │  what the developer sees
├─────────────────────────────────┤
│         Bridge Layer            │  collects, normalizes, emits events
├─────────────────────────────────┤
│         Stroid Runtime          │  your actual stores, PSR, registry
└─────────────────────────────────┘
```

The Bridge is isolated from the panel. It observes the runtime and forwards normalized events. It never owns state and never slows down the app.

### File Roles

**`src/panel/index.tsx`**
Panel coordinator. Connects registry, inspector, timeline, dependency graph, performance view, and command routing.

**`src/panel/insights.ts`**
Interpretation layer. Derives cause traces, dependency relationships, derived-store recompute traces, constraint state views, and store health scores.

**`src/panel/session-tools.ts`**
Runtime analysis and simulation layer. Powers snapshots, snapshot comparison, scenario runner, performance reports, "why is this slow?" diagnostics, schema validation, and session export and import.

**`src/bridge/index.ts` and `src/bridge/channel.ts`**
Bridge layer. Normalizes runtime events, sends and receives bridge envelopes, supports `postMessage` and `BroadcastChannel`, and routes panel commands back to the runtime.

---

## Registry Contract

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

- `dispatchDevtoolsCommand(command)` — single command dispatcher

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `P` | Pause / resume timeline recording |
| `C` | Clear timeline |
| `F` | Focus store filter |
| `G` | Toggle timeline / graph view |

---

## Testing

Run full build and tests:

```bash
npm test
```

Run tests only:

```bash
npm run test:unit
```

Current suite covers feature tests, edge-case tests, helper contract tests, fuzzy and randomized diff tests, and smoke tests for the public API.

---

## Project Structure

```
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

---

## Governance

- Commit status taxonomy: `STATUS.md`
- Contribution guide: `CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.MD`
- Security policy: `SECURITY.md`
- License: `LICENSE` (MIT)
- Release history: `CHANGELOG.md`