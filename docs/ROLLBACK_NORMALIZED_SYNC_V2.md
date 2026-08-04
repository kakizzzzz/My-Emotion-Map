# Roll back normalized sync v2

Rollback must preserve both the immutable `app_states` archive and any new
normalized user data. Never delete a migration file, truncate normalized tables,
or copy one owner's data to another owner.

## Before archive lockdown

If migration `202608040001` fails or any per-owner count, ID/order, reference or
semantic checksum differs, abort the transaction/maintenance window. Restore
the pre-window Postgres backup if any transaction boundary was crossed. Do not
apply retention or archive lockdown, and do not deploy the new Edge/frontend
commit.

## After database migration, before application deployment

Leave the normalized tables and immutable archive intact. Diagnose using
`supabase/verify-normalized-emotion.sql`. For one confirmed owner only, copy
`supabase/recover-normalized-emotion-for-user.sql`, insert that exact user UUID,
review the transaction, and run it during maintenance. The script deletes and
reconstructs normalized rows only for that owner, then re-verifies before
commit. Its default `NULL` deliberately fails closed.

## After frontend or Edge deployment

1. Re-open maintenance mode and record the failed frontend/function versions.
2. Restore the previous frontend and all previous Edge Function versions as one
   compatible set.
3. Do not point the old runtime at normalized tables unless that behavior
   existed in the recorded previous commit.
4. Because archive lockdown rejects legacy writes, restoring a snapshot-writing
   frontend requires a separate reviewed forward rollback migration that
   restores only the necessary owner policies/grants/function behavior. Never
   edit or remove `202608040003_emotion_archive_lockdown.sql` after deployment.
5. Preserve/download affected browser recovery bundles and complete backups
   before clearing any outbox. Do not clear an outbox merely because an HTTP
   request returned 200.
6. Run the verifier, two-owner isolation tests and account login/data closed
   loop before ending the rollback window.

## Data recovery rules

- Prefer entity/history recovery when new normalized edits exist after cutover.
  Reconstructing wholesale from the older archive can discard those edits.
- `app_states` is a read-only historical source, not the live rollback target.
- Same-user recovery only; the required UUID must match the archive owner.
- Retention deletes tombstones only after seven complete days. If investigating
  a deletion, stop the retention schedule before the cutoff and preserve an
  encrypted database backup.
- Any SQL fix is a new migration with explicit verification and rollback notes.

## Exit criteria

Rollback is complete only when the recorded frontend/functions are compatible
with the active schema, both owner-isolation directions pass, login/data
closed-loop passes, verifier output has no mismatch, and logs remain stable for
the agreed observation period.
