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

## Product-direction checkpoint — account-only workspace

Status: complete. This user-directed change supersedes the Phase 1 Demo-entry
surface without rewriting the earlier checkpoint.

| Requirement | Status | Verification |
| --- | --- | --- |
| Account-only entry | fixed | login has no Demo control or guest bypass; an authenticated Supabase session is required before any workspace opens |
| Own-data workspace | fixed | every successful session loads only `loadAppData(user.id, 'real')`; settings no longer exposes Demo loading or exit controls |
| Account ID semantics | fixed | Supabase `account_id` is shown as a read-only ID and never used as the editable local profile-name value |
| Legacy same-name cleanup | fixed | an old local profile name equal to the account ID is normalized to blank and saved separately from the account identity |

Checkpoint evidence:

- Checkpoint-scope Vitest: 25 test files / 128 tests passed. The separately
  preserved, uncommitted Phase 3 heart-observation draft was excluded from this
  count.
- Full working-tree `npm run check`: 26 test files / 133 tests passed;
  typecheck, lint, architecture gates and production build passed.
- Playwright: 8/8 Chromium Mobile and 8/8 WebKit iPhone tests passed. Both
  engines verify that signed-out users cannot open a workspace, the Demo entry
  is absent, and a legacy `profileName === account_id` value is not rendered as
  the editable local profile name.
- Historical Demo-format parsing and rejection tests remain as compatibility
  safeguards, but no user-facing route can enter or upload that workspace.

## Phase 2 — Chat, follow-up, inbox and editor polish

Status: complete; this section and its changes form the dedicated Phase 2
checkpoint.

| Finding | Status | Verification |
| --- | --- | --- |
| P1-CHAT-014 320px composer | fixed | 320px E2E checks textarea width >=220px and 44px send control in Chromium and WebKit |
| P1-CHAT-015 chat delivery state | fixed | canonical requestId-backed pending/failed/stopped messages, same-request retry, one assistant response and Edge idempotency migration |
| P1-CHAT-016 long-thread scroll | fixed | 100-message component test checks one initial scroll; ResizeObserver follows late layout changes only near the bottom |
| P1-CHAT-017 clarification choices | fixed | maximum three structured choices, HMAC-bound expiring continuation tokens and server-only confirmed-candidate restriction |
| P1-CHAT-018 directional feedback | fixed | lighter/stronger/different/same/skip use the same short neutral saved feedback; confetti removed |
| P1-FOLLOWUP-019 revisit direction | fixed | schema v5 migration, one revisit per non-skip followUpId, stable id when currentEmotion is added |
| P1-CHAT-020 Chat navigation | fixed | primary row directly opens Chat; separate 44px disclosure only expands history; false Today grouping removed |
| P1-INBOX-021 per-item seen | fixed | opening the inbox is read-only; expand/review/dismiss marks only the acted-on item |
| P1-INBOX-022 server pending decisions | fixed | every pending server item remains visible with saved decision reason, threshold snapshot, algorithm version and signal level |
| P1-INBOX-023 stale location links | fixed | deletion removes every linked location and confirmation field before another review |

Phase 2 evidence:

- `npm run check`: 25 test files / 128 tests passed; typecheck, lint,
  architecture, production build and the source-size hard gate passed.
- Playwright: 11/11 Chromium Mobile and 11/11 WebKit iPhone tests passed,
  including the 320px composer, neutral revisit feedback, editor draft exit,
  direct Chat navigation and drawer-return behavior.
- Chat request validation rejects client-supplied evidence, model, token-budget
  and system-prompt controls. Continuation tokens do not contain raw note IDs.
- `schemaVersion` is now 5. The v4 per-user local key is read as a recovery
  source and is not deleted during migration; future-schema hard stops remain.
- Migration `202608020002_phase2_chat_inbox.sql` is local-only until the linked
  project receives an explicit, successful migration apply. No MCP surface was
  added or expanded in this phase.
