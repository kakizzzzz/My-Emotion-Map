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
| Account-name semantics | fixed | Supabase `account_id` is the signed-in account name shown as the primary identity; the internal UUID remains hidden |
| Same-name preservation | fixed | a saved local display name equal to the account name is preserved rather than silently cleared; the optional field cannot replace the signed-in identity |

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

## Phase 3 — Heart algorithm and near-automatic Shortcut

Status: implementation complete and checkpoint-ready. The production iCloud
share link and real-iPhone smoke remain explicitly blocked external evidence;
the app does not show a fabricated install link or successful connection.

| Finding | Status | Verification |
| --- | --- | --- |
| P1-HEART-024 per-sample freshness | fixed | shared evaluator validates offset, range, future/age, descending order, span and conflicting duplicates for every sample |
| P1-HEART-025 decision/display mismatch | fixed | Edge and compatibility receiver import the same pure function; decision and rounded median use exactly the same latest-three set |
| P1-HEART-026 context policy | fixed | workout and unknown suppress by default; opt-in strict modes and margin behavior have shared vectors |
| P1-HEART-027 token policy snapshot | fixed | pairing persists algorithm/Shortcut versions, single-sample flag, context policies, cooldown and immutable thresholds; changed preferences require re-pairing |
| P1-HEART-028 episode/cooldown | fixed | service-role RPC merges only same owner/token/side/context inside the saved cooldown; test observations stay separate and event ledger prevents repeat merges |
| P1-SHORTCUT-029 delivery queue | fixed | owner RPC paginates by `(created_at,id)`, includes pending/delivered, merges by observation ID and retries idempotent acknowledgement |
| P1-SHORTCUT-030 setup and test | fixed in code; production smoke blocked | four-step vertical wizard, current/expired/version metadata and real Edge + RLS readback; no local 108 bpm fabrication |
| P1-MCP-038 mixed credential card | fixed | input MCP, output MCP and Shortcut pairing use separate state and separate revoke actions |

Phase 3 evidence:

- `npm run typecheck`, lint, architecture gates and production build pass.
- Vitest: 29 test files / 145 tests passed, including shared heart vectors,
  server-contract checks, 25-row cursor/ack recovery, episode in-place updates,
  immutable pairing policy, owner readback and separate credential UI state.
- Playwright: 9/9 Chromium Mobile and 9/9 WebKit iPhone tests passed. The
  Shortcut choices are vertical and at least 44px; real test remains disabled
  before a pairing code exists.
- Secret-pattern scan found no API-key/JWT-shaped value and no local fake test
  insertion path.
- Linked project remains `uifgpmmlvmfrauzbbrem`. `supabase db push --dry-run`
  succeeded and listed migrations `202608020001`–`202608020003` while explicitly
  performing no push. The database migration and revised `shortcut-ingress`
  Edge Function are still local-only.
- `VITE_SHORTCUT_INSTALL_URL` is accepted only for an `icloud.com/shortcuts`
  URL. No link is configured or claimed as verified in this repository; an
  iPhone-created share link and version smoke are Phase 7 release gates.

No LLM, diagnosis, emotion inference or new MCP surface was added to the heart
path. Health observations remain outside grounded chat until the user creates a
formal saved record.

## Phase 4 — Connect built-in AI to My Life Memory MCP

Status: implementation complete and checkpoint-ready. Production connection
smoke remains blocked until the fixed My Life Memory endpoint, canonical
manifest SHA-256, AES-GCM credential key and a real user-generated MCP token are
configured in the dedicated My Emotion Map project. No My Life Memory backend
write or deployment was performed.

| Finding | Status | Verification |
| --- | --- | --- |
| P1-MCP-IN-031 built-in input direction | fixed in code; production smoke blocked | settings now separates Assistant, My Life Memory, External Access and Shortcut; input token is one-time, Edge-encrypted and owner-scoped |
| P1-MCP-IN-032 deterministic source routing | fixed | ordinary map queries stay local; explicit cross-memory/route/photo queries use a bounded allowlisted plan; external evidence has separate M keys and source chips |
| My Life Memory identity and manifest | fixed in code | `initialize`, exact `my-life-memory` identity, nine read-only tools and full canonical `tools/list` SHA-256 are required before persistence |
| External prompt injection | fixed | tool text is bounded and marked untrusted; system/developer override phrases are rejected by post-generation validation |
| Account and disconnect isolation | fixed in code; cloud A/B smoke pending | RLS metadata policy plus every service-role read/write filter by authenticated `user_id`; disconnect deletes the encrypted credential row |
| Future-schema preservation | fixed | external evidence persistence raises the app schema to v6, while the Phase 0 future-schema hard stop remains intact |

Phase 4 evidence:

- `npm run check` passes: TypeScript for the app and Edge Functions, ESLint,
  35 Vitest files / 166 tests, import and source-size architecture gates, and
  the production Vite build.
- Playwright passes 9/9 Chromium Mobile and 9/9 WebKit iPhone tests, including
  the account-only workspace, 320px layout, reduced motion and accessibility
  smoke paths. The My Life Memory card was also inspected at 320px with no
  horizontal overflow; connect/disconnect controls remain at least 44px.
- Secret-pattern scans found no API-key/JWT-shaped value, credential logging or
  browser token persistence. The My Life Memory credential field clears before
  the network await and no endpoint is accepted from the client.
- The linked project reference was read back as `uifgpmmlvmfrauzbbrem` before a
  read-only `supabase db push --dry-run`. It listed migrations
  `202608020001`–`202608020004` and explicitly performed no push.
- The migration and `my-life-memory-connection` / revised `emotion-chat` Edge
  Functions remain local-only. Production connect, account A/B and disconnect
  smoke are deferred to the Phase 7 release gate because the fixed endpoint,
  full manifest fingerprint, encryption key and real owner token are not stored
  in this repository and must not be invented.

## Phase 5 — Rebuild Emotion Map Output MCP

Status: implementation complete and checkpoint-ready. No migration or Edge
Function has been deployed; production MCP clients remain a Phase 7 smoke gate.

| Finding | Status | Verification |
| --- | --- | --- |
| P1-MCP-OUT-033 mixed read/action manifest | fixed in code | default `output` token and endpoint contain seven read-only tools; three proposal tools require the separate action endpoint and explicit `action` token |
| P1-MCP-OUT-034 weak schemas and validation | fixed | manifest, public schema and strict validator are separate; unknown fields, impossible dates and limits fail before owner-state loading; structured output is schema checked |
| P1-MCP-OUT-035 CRUD-only retrieval | fixed | `research_emotion_context` reuses grounded retrieval, returns ambiguity options, signed continuation, complete authorized counts and explicit zero results |
| P1-MCP-OUT-036 incomplete transport | fixed in code | stateless modern/legacy version negotiation, headers, ping, bounded batch, notification no-body behavior, legal IDs, Origin policy and `last_used_at` touch |
| P1-MCP-OUT-037 broken deep link | fixed by removal | `open_record` is absent from the read manifest and server; no unusable link is advertised |
| Future-schema output safety | fixed | read and action tools reject an app snapshot newer than schema v6 instead of parsing it |

Phase 5 evidence:

- `npm run check` passes: TypeScript for the app and Edge Functions, ESLint,
  42 Vitest files / 189 tests, import and source-size architecture gates, and
  the production Vite build.
- The new tests cover exact read/action manifests, strict input and output
  schemas, ambiguity and signed continuation behavior, complete-set aggregate
  counts, future-schema fail-closed behavior, owner-row denial, notification
  and bounded batch transport, protocol versions, token kind migration and
  output-only revocation/status UI.
- Playwright passes 9/9 Chromium Mobile and 9/9 WebKit iPhone tests, including
  320px, reduced-motion, keyboard, accessibility, landscape, tablet, desktop
  and 200% zoom paths.
- Secret scans found no API-key/JWT-shaped value, credential logging or browser
  token persistence. Raw MCP tokens remain one-time UI values only.
- The linked project reference was read back as `uifgpmmlvmfrauzbbrem` before a
  read-only `supabase db push --dry-run`. It listed migrations
  `202608020001`–`202608020005` and explicitly performed no push.
- Production protocol handshakes, token expiry/revocation, two-account denial,
  `last_used_at`, research continuation and action-confirmation smoke remain
  blocked until Phase 7 deploys the local migrations and both Edge endpoints.

## Phase 6 — Grounded retrieval v3 and time correctness

Status: implementation complete and checkpoint-ready. No database migration or
Edge Function was deployed in this phase.

| Finding | Status | Verification |
| --- | --- | --- |
| P1-AI-039 explicit selection vs history | fixed | request contract separates `explicitNoteIds` and `conversationAnchorNoteIds`; a new topic ignores weak history and current date/emotion constraints outrank record IDs |
| P1-AI-040 intent-specific ambiguity | fixed | lookup/reflection alone use close-top ambiguity; comparison resolves two targets first and pattern uses the full eligible set |
| P1-AI-041 complete aggregates | fixed | `computationSet` is uncapped, display evidence is at most six, default answer chips are at most two, and facts include `computedFromCount`, `scope` and 90-minute episode grouping |
| P1-AI-042 deterministic references | fixed | server-owned recent conversation state resolves first/second/third, previous record and same place within eight messages; unresolved references request clarification |
| P1-AI-043 shared parsing | fixed | client and Edge import one pure three-language normalization/date/intent core; impossible dates fail and count/recent/clarification have distinct intents |
| P1-AI-044 generation state | fixed | rejected writing returns `generation_rejected` with `retrievalStatus=supported`, a shared three-claim ceiling, bounded evidence and a new-request retry action |
| P1-AI-045 local search | fixed | prebuilt O(M+N) search documents exclude system question text, normalize Simplified/Traditional input, debounce 120 ms and cap UI results at eight |
| P1-TIME-046 source timestamps | fixed | explicit EXIF/health offsets produce the exact UTC instant and source offset; no-offset EXIF stays wall time only; revisit provenance prefers `occurredAtUtc` |
| Account profile semantics | fixed | the signed-in account remains the visible ID while the initial local nickname follows the My Life Memory language pattern (`用户account`, `User account`, `사용자 account`); UUIDs stay hidden |
| AI and integration settings | fixed | assistant styles are centered, user prompt text stays local and maps only to allowlisted tone tags, input/output MCP pages are separate, and normal sync noise is hidden while conflict/upload-confirmation safety remains |
| Apple Health setup clarity | fixed in code; production install blocked | the page is a four-step install/range/pair/device-test flow; advanced review policy is folded, all controls remain at least 44px, and pairing is disabled without a device-verified iCloud Shortcut link |

Phase 6 evidence:

- TypeScript for the app and Edge Functions, ESLint, import/source-size
  architecture gates and the production Vite build pass.
- Vitest passes 43 files / 210 tests. New contracts cover unrelated-topic
  anchor removal, ordinal/place references, explicit-date precedence,
  same-name lookup ambiguity, two-group comparisons, 20-record aggregates,
  90-minute episodes, generation-state invariants, a prebuilt 5,000-record
  search p95 below 50 ms, invalid dates and cross-zone photo/heart/revisit time.
- Playwright passes 9/9 Chromium Mobile and 9/9 WebKit iPhone tests, including
  account-only login, empty personal workspaces, editor/revisit flows, 320px,
  reduced motion, accessibility, landscape, desktop and 200% zoom. The browser
  suite also checks that the Assistant/connection modules are equal-width,
  style choices are centered, advanced health policies remain vertical and an
  unavailable Shortcut install path cannot fabricate pairing or test success.
- Secret-pattern and credential-log/browser-persistence scans returned no
  matches. Client requests still cannot choose a model, token limit, prompt or
  evidence array.
- The linked project reference was read back as `uifgpmmlvmfrauzbbrem`. Two
  non-writing `supabase db push --dry-run` attempts reached only the connection
  stage and then timed out/terminated; no SQL or remote change occurred. Phase
  6 adds no migration, so production deployment remains a Phase 7 decision.

## Phase 7 — Release gates and production smoke

Status: backend deployed; GitHub Pages release uses the Phase 7 checkpoint.
Hardware and two-owner smoke items that require user-controlled devices or
credentials remain explicitly blocked rather than fabricated.

| Gate | Status | Evidence |
| --- | --- | --- |
| Rewrite behavior-preserving tests | fixed | current tests enforce account-only entry, explicit editor exits, direct Chat navigation, grounded retrieval state, equal-width AI settings and non-fake Shortcut setup |
| Dead/oversized settings CSS | fixed | Apple automation styles moved to a focused stylesheet; the 120-file source-size hard gate passes |
| Local quality before deploy | passed | typecheck, ESLint, 43 Vitest files / 210 tests, import boundaries and production build; Playwright 9/9 Chromium Mobile and 9/9 WebKit iPhone |
| Dedicated Supabase migrations | deployed | SQL Editor transaction committed versions `202608020001`–`202608020005`; a readback returned exactly those five latest rows |
| Edge Functions and secrets | deployed | seven functions read back ACTIVE with intended JWT boundaries; required provider, MCP and encrypted My Life Memory settings exist only as Edge secrets |
| Unauthenticated endpoint denial | passed | photo, chat, My Life Memory connection, Shortcut, read MCP and action MCP each returned HTTP 401 without credentials |
| iPhone Shortcut | blocked | no device-verified iCloud share link exists; pairing remains disabled and no install/test success is claimed |
| Supabase account A/B | blocked | requires two disposable real owner sessions; static RLS/RPC tests pass but no production identities were invented |
| My Life Memory MCP owner token | blocked | fixed endpoint and full manifest fingerprint are configured, but a real owner-generated token is still required for connect/test/disconnect smoke |
| Emotion Map MCP client | blocked | requires real output/action tokens for handshake, expiry/revocation, cross-owner denial, `last_used_at` and proposal confirmation smoke |

The direct CLI Postgres channel was unavailable from this host during the write.
The same five migrations were therefore applied as one explicit transaction in
the authenticated Supabase SQL Editor for project `uifgpmmlvmfrauzbbrem`; any
statement failure would have rolled back the transaction. CLI/API operations
were still used for project/secret/function verification. No other Supabase
project and no My Life Memory code or cloud resource was changed.
