# Deploy normalized sync v2

This is an operator runbook, not evidence that deployment occurred. The only
allowed Supabase project is `uifgpmmlvmfrauzbbrem`.

## Release artifacts

- migrations:
  - `202608040001_normalized_emotion_storage_v2.sql`
  - `202608040002_emotion_trash_retention.sql`
  - `202608040003_emotion_archive_lockdown.sql`
  - `202608040004_normalized_proposal_revisions.sql`
- read-only verifier: `supabase/verify-normalized-emotion.sql`
- explicit same-user recovery: `supabase/recover-normalized-emotion-for-user.sql`
- changed Edge Functions: `emotion-chat`, `emotion-map-mcp`,
  `emotion-map-action-mcp`
- frontend and Edge Functions must come from the same reviewed commit.

## Preconditions

1. Open a maintenance window and stop application releases.
2. Record the currently deployed frontend commit and every deployed Edge
   Function commit/version.
3. Read back the linked Supabase project. Stop immediately unless it is exactly
   `uifgpmmlvmfrauzbbrem`.
4. Back up Postgres using the platform-supported full backup procedure.
5. Export `public.app_states` separately with owner ID, revision, schema version,
   timestamps and payload intact. Encrypt the export and record its checksum.
6. Confirm Supabase Storage buckets and objects are outside this migration and
   will not be modified.
7. Confirm the reviewed branch is clean and all commands in the final
   validation section pass. Do not use `npm audit fix`.

## Database order

Use transactions and retain the complete SQL output.

1. Apply only `202608040001_normalized_emotion_storage_v2.sql`.
2. Run `supabase/verify-normalized-emotion.sql` for every archived owner.
3. Require all of these for every owner: counts, IDs, sort order, references and
   semantic checksum match; `migration_verified_at` must be present. Any
   mismatch ends the window. Roll back/restore before serving traffic.
4. Apply `202608040002_emotion_trash_retention.sql`.
5. Apply `202608040003_emotion_archive_lockdown.sql`. Confirm authenticated
   clients can no longer select `app_states` and `save_app_state` rejects writes;
   confirm service role can still read the archive.
6. Apply `202608040004_normalized_proposal_revisions.sql`.
7. Read back migrations, RLS flags, policies, grants, constraints, partial
   unique indexes and function ownership/search paths.
8. Confirm `pg_cron` contains exactly one enabled
   `emotion-trash-retention-daily` job. If `pg_cron` is unavailable, create and
   document one equivalent service-role schedule; do not claim Cron is active
   without readback.

Do not delete, truncate, redact or rewrite `app_states`. Do not edit historical
migration files to repair a deployed environment; add a new reviewed migration.

## Application order

1. Deploy the reviewed `emotion-chat`, `emotion-map-mcp` and
   `emotion-map-action-mcp` functions from the same commit. Preserve all current
   secret names, JWT requirements, origin allowlist, MCP token policy, quota and
   My Life Memory manifest/credential configuration.
2. Smoke unauthenticated requests and require denial without leaking provider
   or database bodies.
3. Deploy the frontend from that exact commit.
4. Keep the maintenance window open while the two-account matrix runs.

## Required two-account smoke

Use two disposable real accounts A and B. Do not use service-role requests as a
substitute for browser-owner checks.

- RLS: A cannot read or mutate any B entity, token, proposal, history or
  preference; repeat from B to A.
- A creates a record; B (same-account second device where applicable) receives
  it after foreground refresh.
- disjoint edits merge; same-record edits enter conflict; delete-versus-edit
  enters conflict; a remote tombstone does not resurrect.
- offline edits survive reload and flush in batches; an in-flight response-loss
  retry does not duplicate or clear later mutations.
- two different new message IDs merge; one request ID produces only one
  assistant response; pending completion triggers reconcile.
- terminal follow-ups do not revive, only one active follow-up remains, and one
  source follow-up produces one revisit.
- grounded chat uses normalized records and recent target-conversation context.
- read MCP denies the wrong owner. Action MCP creates a proposal only; explicit
  in-app confirmation applies it and completion waits for synced revision.
- My Life Memory connect/test/disconnect and manifest pinning still behave
  exactly as before; no My Life Memory deployment is part of this release.
- complete backup validates, import merge/replace survives reload, and typed
  workspace deletion stays empty on a second device after sync.

## Close the window

1. Re-run the normalized verifier and inspect Edge/Postgres logs for validation,
   authorization, revision-conflict, quota and retry spikes.
2. Confirm retention Cron readback and the immutable archive grant again.
3. Record database, function and frontend versions plus smoke-account cleanup.
4. End the window only after the observation period has no unexplained errors.
