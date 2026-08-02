# Codex remediation progress

Baseline: `main@b8a33a4d64d6aa32212ce83f5626135e3ab77c4d`
Working branch: `fix/phase-0-data-safety-v5`

## Phase 0 — Protect data before feature work

Status: complete and checkpointed as `cad9c14`.

| Finding | Status | Verification |
| --- | --- | --- |
| P0-SCHEMA-001 future schema downgrade | fixed | migration, import, local-load and cloud remote rejection tests |
| P0-SYNC-002 blank cloud row | fixed | authenticated empty workspace creates revision 1 |
| P0-SYNC-003 revision-only comparison | fixed | base/local/remote hash decision-table tests |
| P0-SYNC-004 dirty tab overwrite | fixed | BroadcastChannel integration test pauses with recovery copies |
| P0-SYNC-005 unstable request ID | fixed | persisted request ID survives reload and same-payload retry |
| P0-EDITOR-006 implicit save on exit | fixed | reducer and component tests cover save, draft, discard, delete, Escape and backdrop |
| P0-MCP-007 accepted-before-apply | fixed | claim/journal/apply/sync-complete state-machine tests and SQL migration |
| P0-PRIVACY-008 chat draft key | fixed | account, real/Demo and conversation namespace tests plus cleanup |

Phase 0 evidence:

- `npm run check`: 18 test files / 102 tests passed; typecheck, lint,
  architecture and production build passed.
- Playwright: all 14 Chromium Mobile and WebKit iPhone tests passed, including
  320px, reduced motion, tablet, landscape, desktop and 200% zoom flows.
- Secret-pattern scan of source and build inputs returned no credential-like
  values.
- Linked Supabase project was verified as `uifgpmmlvmfrauzbbrem`; migrations
  `202608010001`–`202608010004` match remote. Migration
  `202608020001_proposal_apply_state.sql` is local-only and must not be marked
  deployed until a successful database dry-run and apply. Two dry-run attempts
  ended before SQL execution because the direct Postgres connection was
  terminated; no remote write occurred.

No application schema-version bump and no new MCP tools were introduced in
Phase 0.

## Phase 1 — Demo entry, onboarding and trustworthy sample behavior

Status: complete; this section and its changes form the dedicated Phase 1
checkpoint.

| Finding | Status | Verification |
| --- | --- | --- |
| P1-DEMO-009 Demo entry | fixed | 44px top control, confirmation/cancel/Escape and input-preservation component + E2E tests |
| P1-DEMO-010 first-run onboarding | fixed | shared three-screen real/Demo flow, versioned per-workspace seen keys, skip leaves snapshots empty |
| P1-DEMO-011 sample provenance | fixed | five-record `synthetic_demo` manifest and `demo:synthetic:campus-day` identifiers; old Demo cache key retired |
| P1-DEMO-012 Demo chat | fixed | eight deterministic lookup/comparison/pattern prompts, Demo-only evidence IDs, zero Edge fetches |
| P1-MAP-013 Demo viewport | fixed | MapLibre `fitBounds`, orientation padding, reduced-motion duration and one-fit-per-generation guard |

Phase 1 evidence:

- `npm run check`: 21 test files / 114 tests passed; typecheck, lint,
  architecture and production build passed.
- Playwright: 11/11 Chromium Mobile and 11/11 WebKit iPhone tests passed.
- All five Demo stars were checked inside the map viewport at 390×844,
  320×568 and 844×390 in both browser engines.
- Demo chat component verification confirms no network `fetch`; real workspace
  storage and camera remain separate from the disposable Demo workspace.
- `schemaVersion` remains 4 and no MCP surface was added or expanded.
