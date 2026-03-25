# Contributing to Stroid Devtools

Thanks for contributing. This repo is roadmap-driven and quality-gated.

## Ground Rules

- Build against `ROADMAP.md` and keep scope aligned to the current phase.
- Prefer small PRs that solve one concrete debugging problem.
- Keep runtime overhead low. The bridge must observe and forward, not own app state.
- Do not break existing event contracts in `src/types.ts` without clear migration notes.

## Local Setup

```bash
npm install
npm run typecheck
npm run build
```

Load `dist/` as an unpacked Chromium extension for manual validation.

## Commit Style

This repository uses STATUS-style commit messages:

```text
status(###): short summary
```

Use `STATUS.md` as the source of truth for valid status codes.

## Pull Request Checklist

- [ ] Roadmap alignment checked (`ROADMAP.md`)
- [ ] Typecheck passes (`npm run typecheck`)
- [ ] Build passes (`npm run build`)
- [ ] UI behavior verified in extension panel
- [ ] New behavior covered in docs (`README.md` or `ROADMAP_COMPLIANCE.md`)
- [ ] No unrelated files changed

## Coding Expectations

- Keep TypeScript strict and explicit.
- Prefer readable, composable functions over deeply coupled logic.
- Keep panel rendering responsive (no unbounded loops, no unbounded memory growth).
- If you add new commands/events, update:
  - `src/types.ts`
  - bridge routing/validation
  - panel UI handling

## Reporting Issues

- Use the issue templates in `.github/ISSUE_TEMPLATE`.
- For security issues, follow `SECURITY.md` instead of opening a public issue.
