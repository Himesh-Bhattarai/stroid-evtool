# Roadmap Compliance Audit

Last audited: 2026-03-25  
Source of truth: `ROADMAP.md`

## Status Summary

- Phase 1: **Complete**
- Phase 2: **Mostly complete** (some control-panel items remain)
- Phase 3: **Mostly complete** (graph rendering details remain)
- Phase 4: **Partially complete** (multi-instance still missing)

## Line-By-Line Implementation Status

### 2. Architectural Foundation

| Requirement | Status | Evidence |
|---|---|---|
| Three-layer model (Panel / Bridge / Runtime) | Done | `src/panel/index.tsx`, `src/bridge/index.ts`, `src/types.ts` |
| Bridge observes and forwards, does not own runtime state | Done | `src/bridge/index.ts` |
| Registry subscription hook (`onEvent`) | Done | `src/bridge/index.ts` |
| Event contract with `causedBy`, `depth`, `performance` | Done | `src/types.ts` |
| Panel isolation transport (`postMessage`/`BroadcastChannel`) | Done | `src/bridge/channel.ts`, `src/extension/*` |
| Ring buffer with bounded history | Done | `src/buffer/index.ts` |

### 3. Features

| Requirement | Status | Evidence |
|---|---|---|
| Store Registry columns/actions | Done | `src/panel/registry/index.ts` |
| Store Inspector current/previous/diff/metadata | Done | `src/panel/inspector/index.ts` |
| Inspector expand/collapse tree nodes | Done | `src/panel/inspector/index.ts` (`<details>`) |
| Inspector search inside state | Missing | Not implemented in inspector UI |
| Copy current snapshot | Done | `src/panel/inspector/index.ts` (`Copy JSON`) |
| Timeline rows + store/event context | Done | `src/panel/timeline/index.ts` |
| Timeline jump-to-state (inspector-only snapshot) | Done | `src/panel/timeline/index.ts`, `src/panel/index.tsx` |
| Timeline filter/pause/clear | Done | `src/panel/timeline/index.ts`, `src/panel/index.tsx` |
| Diff engine (structural recursive) | Done | `src/diff/index.ts` |
| Async lifecycle tracking | Done | `src/panel/index.tsx`, `src/panel/inspector/index.ts` |
| Subscription debugging + sparkline | Done | `src/panel/analytics.ts`, `src/panel/registry/index.ts`, `src/panel/inspector/index.ts` |
| Control panel: edit/reset/delete/refetch/reset-all | Done | `src/panel/inspector/index.ts`, `src/panel/registry/index.ts`, `src/bridge/index.ts` |
| Control panel: trigger mutator | Missing | No command/type/UI for mutator invocation |
| Control panel: create store | Missing | No command/type/UI for runtime store creation |
| Override actions flagged as `devtool:override` | Done | `src/bridge/index.ts`, `src/panel/timeline/index.ts` |
| PSR preview/commit/blocked integration | Done | `src/types.ts`, `src/panel/analytics.ts`, `src/panel/insights.ts`, `src/panel/inspector/index.ts` |
| Unsafe PSR commit in orange | Partial | `psr:blocked` and override styles exist; explicit unsafe commit variant not implemented |
| Snapshot save/compare/restore | Done | `src/panel/session-tools.ts`, `src/panel/inspector/index.ts`, `src/panel/index.tsx` |
| Performance metrics (per-store/global) + tab | Done | `src/panel/session-tools.ts`, `src/panel/performance/index.ts` |

### 4. UI Layout / UX Rules

| Requirement | Status | Evidence |
|---|---|---|
| Three-column layout (Registry / Inspector / Timeline+Graph) | Done | `src/panel/index.tsx` |
| Timeline max 100 visible rows | Done | `src/panel/timeline/index.ts` |
| Keyboard shortcuts `P`, `C`, `F`, `G` | Done | `src/panel/index.tsx` |
| Dark mode default | Done | `static/extension/panel.css` (`color-scheme: dark`) |

### 5. Build Order Check

| Phase checklist | Status | Notes |
|---|---|---|
| Phase 1 (MVP) | Done | Bridge, event type, registry, inspector, timeline, runtime integration all present |
| Phase 2 (Useful) | Partial | Core done; trigger mutator/create store remain |
| Phase 3 (Powerful) | Partial | Core done; graph is interactive but not force-directed/edge-hover-flash feature set |
| Phase 4 (Elite) | Partial | Scenario runner, slow analysis, schema, snapshots, performance tab, session export done; multi-instance/multi-tab missing |

### 5.5 Additional Features

| Requirement | Status | Notes |
|---|---|---|
| Runtime modes: Debug/Trace/Freeze/Replay | Done | Mode commands + UI toggles present |
| Field-level history | Done | Inspector field history section present |
| Smart alerts (over-subscription/thrashing/loop) | Partial | Over-subscription + thrashing present; explicit loop-cycle detector not found |
| Derived trace | Done | Inputs/change flags/cost/count in inspector |
| Live constraints panel | Done | Constraints section with PSR events |
| Constraint violation heatmap | Missing | Not implemented |
| Store health system | Done | Score + reasons + registry badges/sparklines |
| Scenario runner with per-step snapshot+diff UI | Partial | Scenario execution/log exists; per-step snapshot+diff visualization not implemented |
| Why-is-this-slow diagnosis | Done | Rule-based analysis section present |
| State schema awareness (typed labels + violation checks) | Partial | Schema mismatch checks present; typed field labels and write-time validation UI are limited |
| Session export share format | Done | `.stroid-session` export helper + UI button |
| Session import | Missing | No import workflow |
| Multi-instance / multi-tab switcher | Missing | Single active app context in panel |

## What Remains To Reach Full Roadmap Compliance

1. Add mutator trigger and runtime store creation controls.
2. Upgrade graph to force-directed layout and edge-hover relationship details.
3. Add propagation-path flash on update.
4. Add multi-instance/multi-tab app switcher.
5. Add loop-cycle detection and constraints violation heatmap.
6. Add scenario step-by-step snapshot+diff visualization.
7. Add session import workflow.
