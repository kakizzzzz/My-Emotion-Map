# Codex remediation progress

Baseline: `main@b8a33a4d64d6aa32212ce83f5626135e3ab77c4d`
Working branch: `fix/phase-0-data-safety-v5`

## Phase 0 — Protect data before feature work

Status: implementation complete; local quality gate green. Phase 1 remains
locked until this checkpoint is committed.

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
