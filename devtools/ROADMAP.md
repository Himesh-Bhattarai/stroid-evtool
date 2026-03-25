# DO_THIS_REPORT.md
## Stroid Devtool — Architecture to Production
 
---
 
## 0. What This Is
 
This is not a feature wishlist.
This is a build contract.
 
Every section answers one question:
**What exactly do you build, and in what order, and why?**
 
---
 
## 1. Core Identity (never forget this)
 
Stroid Devtool is not:
 
- A logger
- A Redux DevTools clone
- A state viewer
 
Stroid Devtool is:
 
> **A runtime inspector for a live state engine.**
 
That distinction changes every decision — UI, architecture, data model, everything.
 
---
 
## 2. Architectural Foundation
 
### 2.1 The Three-Layer Model
 
```
┌─────────────────────────────────┐
│         Devtool UI Panel        │  ← what the developer sees
├─────────────────────────────────┤
│         Devtool Bridge          │  ← collects, normalizes, emits events
├─────────────────────────────────┤
│         Stroid Runtime          │  ← your actual stores, PSR, registry
└─────────────────────────────────┘
```
 
The Bridge is the critical layer. It must:
 
- Never slow down the runtime
- Never own real state
- Only observe and forward
 
### 2.2 The Bridge Contract
 
The Bridge connects to Stroid via a subscription hook, not by wrapping stores.
 
```ts
// Bridge attaches here
stroidRegistry.onEvent((event) => {
  bridge.emit(event);
});
```
 
Event types the Bridge must handle:
 
```ts
type DevtoolEvent = {
  id: string;
  timestamp: number;
  type:
    | "store:created" | "store:updated" | "store:deleted" | "store:reset"
    | "async:start" | "async:success" | "async:error"
    | "dependency:triggered"
    | "subscription:added" | "subscription:removed"
    | "psr:preview" | "psr:commit" | "psr:blocked"
    | "devtool:override" | "replay:step" | "freeze:start" | "freeze:end";
 
  storeId?: string;
  before?: unknown;
  after?: unknown;
  mutator?: string;
 
  causedBy?: string;  // storeId or PSR mutation id
  depth?: number;     // causal chain depth
 
  performance?: {
    duration?: number;
  };
 
  meta?: Record<string, unknown>;
};
```
 
The `causedBy` and `depth` fields are what enable causal tracing and Trace Mode.
 
### 2.3 The Panel Architecture
 
The UI panel runs in an iframe or browser extension panel, isolated from app memory.
 
Communication is via `postMessage` or a shared `BroadcastChannel`.
 
```
App Runtime
    │
    ▼
Bridge (in-app, tiny, zero UI)
    │
    ▼  postMessage / BroadcastChannel
    │
    ▼
Devtool Panel (isolated iframe or extension)
    │
    ├── Store Registry
    ├── Store Inspector
    ├── Timeline
    ├── Dependency Graph
    └── Control Panel
```
 
### 2.4 Data Store Inside The Panel
 
The panel needs its own local state to hold the event history. Use a simple ring buffer.
 
```ts
const MAX_EVENTS = 5000; // configurable
 
class EventBuffer {
  private events: DevtoolEvent[] = [];
 
  push(event: DevtoolEvent) {
    if (this.events.length >= MAX_EVENTS) {
      this.events.shift();
    }
    this.events.push(event);
  }
 
  getAll() { return this.events; }
  getByStore(id: string) { return this.events.filter(e => "storeId" in e && e.storeId === id); }
  clear() { this.events = []; }
}
```
 
Never hold unbounded history. The ring buffer prevents memory blowup in long sessions.
 
---
 
## 3. Features — What To Build
 
### 3.1 Store Registry (Phase 1 — MUST)
 
**What it shows:**
 
| Column | Source |
|---|---|
| Store name | `storeId` |
| Store type | sync / async / derived |
| Status | idle / loading / success / error |
| Subscriber count | subscription events |
| Last updated | `store:updated` timestamp |
 
**What it allows:**
 
- Click a store → open inspector
- Reset store → emit reset command to Bridge
- Delete store → emit delete command
- Force re-fetch (async stores only)
 
**Why first:** Without this, nothing else has context. It is the root of the tree.
 
---
 
### 3.2 Store Inspector (Phase 1 — MUST)
 
Activated when user selects a store from the registry.
 
**What it shows:**
 
- Current state as an expandable JSON tree
- Previous state (last snapshot before latest update)
- Diff view between previous and current (see section 4.1)
- Metadata: `createdAt`, `updatedAt`, subscriber count, store type
 
**What it allows:**
 
- Expand / collapse tree nodes
- Search inside state (filter by key or value)
- Copy current snapshot to clipboard
- Manual edit (see Control Panel, section 3.5)
 
---
 
### 3.3 Timeline (Phase 1 — MUST)
 
Every mutation that passes through the Bridge gets a row.
 
**Each row contains:**
 
```
[timestamp]  [store name]  [mutator name]  [before → after summary]
```
 
**What it supports:**
 
- Jump to state: clicking a row restores the panel view to that snapshot (not time travel in the app, just in the inspector)
- Filter by store
- Filter by event type
- Pause recording (freeze the buffer, app keeps running)
- Clear all
 
**Why it matters:** Without timeline, you are debugging blind. State view alone tells you where you are. Timeline tells you how you got there.
 
---
 
### 3.4 Diff Engine (Phase 2 — MUST)
 
Not a JSON dump. A real structural diff.
 
**Rules:**
 
- Show only what changed, not the full object
- Highlight added keys in green
- Highlight removed keys in red
- Highlight modified values with before/after
 
**Implementation approach:**
 
Use a recursive deep diff algorithm. Do not use `JSON.stringify` comparison.
 
```ts
function diff(before: unknown, after: unknown): DiffResult {
  // recursively compare
  // return { added, removed, modified } tree
}
```
 
**Where it appears:**
 
- Inside the Store Inspector (current vs previous)
- Inside each Timeline row (inline diff summary)
- Inside PSR commit results
 
This is the difference between a toy devtool and a professional one.
 
---
 
### 3.5 Async Lifecycle Tracking (Phase 2 — MUST for Stroid)
 
Since Stroid has `fetchStore`, this is a first-class feature, not an afterthought.
 
**Per async store, show:**
 
```
async:start  ──►  loading  ──►  async:success  (or async:error)
    │                                │
 timestamp                     duration (ms)
```
 
**Extra fields to show:**
 
- Request duration (ms)
- Cache hit vs network fetch
- Revalidation trigger reason (focus / manual / interval)
- Error message if failed
 
**Why this matters:** React Query DevTools succeeded largely because of this exact view. Stroid has the same capability natively. Use it.
 
---
 
### 3.6 Dependency Graph (Phase 3 — POWERFUL)
 
Visual graph where nodes are stores and edges are dependencies.
 
**What it shows:**
 
- Which stores depend on which
- Which stores triggered which on the last update
- Derived/computed stores visually distinct from base stores
 
**Rendering:**
 
Use a force-directed graph (D3 or similar). Nodes repel, edges pull.
 
**Interactive:**
 
- Click a node → opens that store in the inspector
- Hover an edge → shows the dependency relationship type
- Highlight propagation path on store update (flash the affected nodes)
 
**Why this is your biggest weapon:** No other state lib devtool shows this clearly because most libs don't have a registry. Stroid does. This makes Stroid feel like a reactive system, not just a store bag.
 
---
 
### 3.7 Event Cause Tracing (Phase 3 — POWERFUL)
 
When a store updates, show the causal chain.
 
```
cartSummary updated
  └─ caused by: cart updated
       └─ caused by: psr.commit({ store: "cart", path: ["items", 0, "qty"] })
```
 
**How to implement:**
 
Every `store:updated` event carries a `causedBy` field populated by the Bridge when it detects a dependency trigger chain.
 
```ts
type UpdateEvent = {
  type: "store:updated";
  storeId: string;
  causedBy?: string; // storeId or PSR mutation id
  // ...
}
```
 
This view answers "why did this store change?" which is the most common debugging question in reactive systems.
 
---
 
### 3.8 Subscription Debugging (Phase 2)
 
**Show per store:**
 
- How many subscribers currently
- Subscriber identifiers (component name or hook instance if available)
- Subscription count change over time (mini sparkline)
 
**Why useful:**
 
- Detect memory leaks (store has subscribers after component unmounts)
- Detect over-subscribing (20 components subscribing to the same store)
- Detect unnecessary renders
 
---
 
### 3.9 Control Panel (Phase 2)
 
Direct runtime control from the devtool panel.
 
**Actions:**
 
| Action | What it does |
|---|---|
| Edit state | Inject arbitrary state into a store |
| Reset store | Restore to initial state |
| Delete store | Remove from registry |
| Force re-fetch | Trigger async fetch manually |
| Trigger mutator | Call a named mutator with test args |
| Create store | Register a new store at runtime |
| Reset all | Clear all stores to initial state |
 
**Safety rule:** All control panel actions are tagged as `devtool:override` in the event log. They appear in the Timeline but visually distinct (yellow or flagged).
 
---
 
### 3.10 PSR Integration (Phase 2 — if PSR is present)
 
If the user has PSR attached, the devtool gets extra insight automatically.
 
**Additional timeline rows:**
 
- `psr:preview` — shows the mutation and the full impact report
- `psr:commit` — shows the mutation and result
- `psr:blocked` — shows what was blocked and which constraint fired
 
**Visual treatment:**
 
- Blocked mutations appear in red in the Timeline
- Unsafe commits (`commitUnsafe`) appear in orange with the reason
 
This makes PSR's governance visible. Without this, PSR is silent.
 
---
 
### 3.11 Snapshot System (Phase 4)
 
**Actions:**
 
- Save named snapshot of all store states
- Compare two snapshots (full diff across all stores)
- Restore a snapshot (sends restore commands through Bridge to each store)
 
**Storage:** `localStorage` or IndexedDB inside the panel. Never in the app runtime.
 
---
 
### 3.12 Performance Metrics (Phase 4)
 
**Per store:**
 
- Update frequency (updates/min)
- Average time between updates
- Async resolve time (p50, p95)
 
**Global:**
 
- Total updates/sec (real-time counter)
- Heaviest stores by update volume
- Stores with highest subscriber count
 
**Rendering:** Mini sparklines per store in the registry view. Full chart in a dedicated Performance tab.
 
---
 
## 4. UI Layout
 
```
┌──────────────┬──────────────────────┬─────────────────────┐
│ Store List   │   Store Inspector    │  Timeline / Graph   │
│              │                      │                     │
│ [cart]       │  State Tree          │  Toggle:            │
│ [inventory]  │  Previous State      │  [Timeline] [Graph] │
│ [cartSummary]│  Diff View           │                     │
│              │  Metadata            │  Events list        │
│              │                      │  or                 │
│              │  Control Panel       │  Dependency graph   │
└──────────────┴──────────────────────┴─────────────────────┘
```
 
**UX rules:**
 
- Zero lag. Panel updates must feel instant.
- No overwhelming logs. Timeline is paginated, max 100 rows visible at a time.
- Keyboard shortcuts: `P` pause, `C` clear, `F` filter, `G` graph toggle.
- Dark mode default. Developers live in dark mode.
 
---
 
## 5. Build Order (Strict)
 
### Phase 1 — MVP (ship this first)
 
- [ ] Bridge architecture (event emitter, postMessage channel)
- [ ] Updated `DevtoolEvent` type (with `causedBy`, `depth`, `performance`)
- [ ] Store Registry view
- [ ] Store Inspector (state tree, metadata)
- [ ] Basic Timeline (events, timestamps, store name)
- [ ] Connect to real Stroid registry
 
**Goal:** A developer can open the panel and see all stores updating in real time.
 
---
 
### Phase 2 — Useful (this is where it becomes a real tool)
 
- [ ] Diff engine (structural, not string)
- [ ] Async lifecycle tracking
- [ ] Subscription debugging
- [ ] Control panel (edit, reset, re-fetch)
- [ ] PSR integration (if PSR attached)
- [ ] Pause / filter / clear in Timeline
- [ ] Runtime modes: Debug, Trace, Freeze, Replay
- [ ] Field-level history (State Evolution View)
- [ ] Smart alerts (over-subscription, thrashing, loop detection)
 
**Goal:** A developer can debug a real bug without `console.log`.
 
---
 
### Phase 3 — Powerful (this is where you beat everyone)
 
- [ ] Dependency graph (visual, interactive)
- [ ] Event cause tracing (causal chain per update)
- [ ] Derived store computation trace
- [ ] Live Constraints Panel (PSR evolution)
- [ ] Store Health System
- [ ] Timeline jump-to-state (inspector only)
- [ ] Performance sparklines in registry
 
**Goal:** A developer can understand *why* something happened, not just *what* happened.
 
---
 
### Phase 4 — Elite
 
- [ ] Scenario Runner (scripted simulation flows)
- [ ] "Why is this slow?" analysis (rule-based diagnosis)
- [ ] State schema awareness
- [ ] Snapshot system (save, compare, restore)
- [ ] Full performance tab (p50/p95, update frequency)
- [ ] Session export as `.stroid-session`
- [ ] Multi-instance / multi-tab view
 
**Goal:** A developer can reproduce, share, audit, and simulate any state bug.
 
---
 
## 5.5 Additional Features By Phase
 
## 5.5 Additional Features By Phase
 
### Phase 2 Additions
 
#### Runtime Modes
 
The panel is not just passive. It has operating modes.
 
**Debug Mode** — default, current behavior.
 
**Trace Mode** — full causal chain recording, intentionally slower:
 
```ts
devtools.enableTraceMode({ depth: "full" });
```
 
Shows the full propagation chain per user action:
 
```
User clicks "Add to Cart"
→ mutator: addToCart
→ cart updated
→ cartSummary recomputed
→ discountStore recalculated
```
 
**Freeze Mode** — stops propagation mid-flight so you can inspect intermediate state:
 
```ts
devtools.freezePropagation();
```
 
Like pausing a physics engine mid-step. Inspect every store at the exact moment a chain was interrupted.
 
**Replay Mode** — replays buffered events at controlled speed:
 
```ts
devtools.replay({ speed: 0.5 }); // slow motion
```
 
This is meaningful time travel — not just state swapping, but watching the system move again.
 
---
 
#### Field-Level History (State Evolution View)
 
Timeline shows events. This shows how a single field evolved.
 
Click any field in the inspector (e.g. `cart.total`) and see:
 
```
[100] → [120] → [150] → [130]
```
 
Graphed over time. Useful for:
 
- Pricing bugs
- Derived value inconsistencies
- Async overwrites stomping each other
 
---
 
#### Smart Alerts
 
The devtool watches for problems and surfaces them without the developer having to look.
 
| Alert | Trigger |
|---|---|
| Over-subscription | Store has unusually high subscriber count |
| Infinite loop detection | Store A → Store B → Store A cycle detected |
| Thrashing | Store updated N times in 1 second |
 
These appear as banners in the panel, not buried in logs.
 
---
 
### Phase 3 Additions
 
#### Derived Store Computation Trace
 
For every derived/computed store, show:
 
```
cartSummary = fn(cart, discounts)
 
Inputs:
  cart.items     → changed ✓ (triggered recompute)
  discounts      → unchanged
 
Recompute cost: 2.1ms
Recompute count this session: 240
```
 
Detects expensive derived logic and unnecessary recomputations before they become production problems.
 
---
 
#### Live Constraints Panel (PSR Evolution)
 
If PSR is attached, show all active constraints in a live panel:
 
```
✔ cart.total >= 0
✔ inventory.stock >= reserved
✖ user.balance >= payment  ← violated at 14:03:21
```
 
**Violation Heatmap:**
 
Which stores violate constraints most often, and how frequently. This turns PSR from hidden logic into a visible contract system.
 
---
 
#### Store Health System
 
Every store gets a computed health score based on:
 
- Update frequency
- Subscriber churn
- Async error rate
- Recomputation cost (derived stores)
 
Output shown in the registry:
 
```
cartStore     ⚠️ unstable
  - high update frequency (120/min)
  - frequent async errors (12% error rate)
 
inventoryStore  ✔ healthy
```
 
---
 
### Phase 4 Additions
 
#### Scenario Runner
 
Upgrades the Control Panel from manual one-off actions to scripted flows:
 
```ts
devtools.runScenario({
  name: "Checkout Flow",
  steps: [
    () => addToCart(itemA),
    () => addToCart(itemB),
    () => applyDiscount("SUMMER"),
    () => checkout(),
  ],
});
```
 
UI shows step-by-step execution with state snapshot and diff after each step.
 
This turns the devtool into a simulation and testing environment, not just an inspector.
 
---
 
#### "Why Is This Slow?" Analysis
 
Click any store → panel analyzes and outputs a plain-English diagnosis:
 
```
cartSummary is slow because:
  - recomputed 240 times in 10 seconds
  - depends on cart (high churn store)
  - expensive reduce() detected in computation
```
 
Rule-based, not AI. Fast, accurate, actionable.
 
---
 
#### State Schema Awareness
 
Optional — stores can declare a schema:
 
```ts
createStore("cart", schema<Cart>());
```
 
When a schema is present, the devtool:
 
- Shows typed field labels in the inspector
- Flags writes that violate the shape
- Validates current state against the schema on demand
 
Bridges the runtime and the type system visually.
 
---
 
#### Session Export (Upgraded)
 
Not a raw JSON dump. A structured `.stroid-session` file containing:
 
- Full timeline
- All snapshots
- Dependency graph at export time
- Performance metrics
- PSR violation history
 
Importable in another devtool instance. Shareable with teammates to reproduce bugs.
 
---
 
#### Multi-Instance View
 
If multiple Stroid apps are running (microfrontends, multi-tab):
 
- Show all registries in a sidebar switcher
- Switch context without closing the panel
- Compare registries side by side
 
---
 
## 6. What You Are Beating
 
| Tool | What it does well | What it misses |
|---|---|---|
| Redux DevTools | Timeline, time travel | No dependency graph, not store-centric |
| Zustand DevTools | Simple | Shallow, no system insight |
| React Query DevTools | Async lifecycle | Not general state, no graph |
| MobX DevTools | Reactive graph | Complex, MobX-specific |
 
**Your edge:** Registry-centric design + dependency graph + PSR integration + async lifecycle in one panel.
 
---
 
## 7. Package Structure
 
```
stroid-devtools/
├── src/
│   ├── bridge/
│   │   ├── index.ts          ← attaches to Stroid runtime
│   │   ├── channel.ts        ← postMessage / BroadcastChannel
│   │   └── normalizer.ts     ← normalizes raw events to DevtoolEvent
│   ├── panel/
│   │   ├── index.tsx         ← panel root
│   │   ├── registry/         ← Store Registry feature
│   │   ├── inspector/        ← Store Inspector feature
│   │   ├── timeline/         ← Timeline feature
│   │   ├── graph/            ← Dependency Graph feature
│   │   ├── control/          ← Control Panel feature
│   │   └── psr/              ← PSR integration views
│   ├── diff/
│   │   └── index.ts          ← diff engine
│   ├── buffer/
│   │   └── index.ts          ← ring buffer
│   └── types.ts              ← DevtoolEvent and all shared types
├── package.json
└── README.md
```
 
---
 
## 7.5 Discipline Rule
 
Every feature must pass one test before it gets built:
 
> **"Does this help debug a real bug faster?"**
 
If the answer is "it looks cool" — cut it.
If the answer is "developers will stare at it but not use it" — cut it.
Charts everywhere, analytics dashboards, pretty graphs with no action = failure.
 
The devtool succeeds when a developer opens it, finds the bug in under 60 seconds, and closes it.
 
---
 
## 8. The Brutal Truth
 
If Phase 1 ships and it only shows a state tree with a log, it will feel like every other devtool.
 
The thing that makes this worth building is the dependency graph + cause tracing combo in Phase 3.
 
That is what makes a developer say:
 
> "I can see the entire state system moving."
 
Everything before Phase 3 is infrastructure. Phase 3 is the product.
 
Build Phase 1 and 2 fast. Do not over-engineer them. Get to Phase 3.
 
---
 
## 9. One-Line Version
 
> Stroid Devtool = Registry Inspector + Timeline + Dependency Graph + Control Panel, built in that order, shipped as `stroid-devtools` on npm.
 