# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog, and this project follows semantic versioning intent.

## [Unreleased]

### Added

- Expanded README with full product positioning, architecture breakdown, setup flow, day-to-day usage, scenario format, and testing guidance.
- Added this changelog for release and audit visibility.

## [0.1.0] - 2026-03-25

### Added

- Runtime bridge with event normalization and command routing (`window` + `BroadcastChannel` transport support).
- DevTools extension shell with service worker relay and panel bootstrap wiring.
- Store registry, inspector, timeline, dependency graph, and performance panel.
- Structural diff engine and bounded event buffer.
- Async lifecycle tracking, field history, alerting, cause tracing, and store health scoring.
- Runtime control actions: edit/reset/delete/refetch, trigger mutator, create store, reset all.
- Runtime mode controls: debug, trace, freeze, replay.
- Snapshot save/compare flows and session export/import (`.stroid-session`).
- Scenario runner with per-step change summaries.
- Schema-aware validation and rule-based slow-analysis diagnostics.
- Multi-target runtime selection across tabs/apps.
- Unit tests covering feature behavior, helpers, edge cases, fuzzy diff behavior, and smoke API checks.
