# Normalized emotion sync v2

Status: code-complete on `refactor/normalized-emotion-sync-v2`; production not deployed.

Baseline: `main@05d67e9c295157f52250d3d017bc1dd890981023`.

## Data model

The cloud no longer treats one account as one uploaded JSON snapshot. Each
authenticated owner has one revision row and one preference row, with domain
entities stored separately:

- `emotion_settings`: data-model version, app schema, theme and the account's
  monotonic `dataset_revision`;
- `emotion_preferences`: profile name, about text, AI prompt, context count,
  communication tags and follow-up curve;
- `emotion_records`: the single canonical location/emotion/note entity. The old
  duplicated `moment` and `note` values are assembled only at the UI boundary;
- `emotion_conversations` and `emotion_messages`: messages belong to one
  conversation; conversation preview is derived from the last message;
- `emotion_followups`: belongs to one canonical record by `note_id`;
- `emotion_revisits`: belongs to one record and optionally one source follow-up;
- `emotion_entity_history`: the bounded before-image journal used for recovery.

All business rows are keyed by `user_id`. Records have unique moment and note
IDs per owner. Messages use `(user_id, conversation_id, id)`. Foreign keys and
partial unique indexes enforce one active follow-up, one revisit per source
follow-up, one companion conversation, and request/reply idempotency.

`app_states` is retained unchanged as an immutable service-only migration
archive. Runtime frontend and Edge code do not read it, and `save_app_state`
rejects new writes after archive lockdown.

## Mutation protocol

The browser produces only these normalized mutation types:

- `settings_update`, `preferences_update`;
- `record_upsert`, `record_soft_delete`;
- `conversation_upsert`, `conversation_soft_delete`;
- `message_upsert`, `message_soft_delete`;
- `followup_upsert`, `followup_soft_delete`;
- `revisit_upsert`, `revisit_soft_delete`.

`apply_emotion_mutations(expectedRevision, mutations)` authenticates the owner,
locks that account's settings row, validates the complete batch, writes all
entities atomically, records bounded history, and increments
`dataset_revision` exactly once. The browser never sends mutation `base` data,
IndexedDB sequence numbers, a complete workspace, credentials, device
language, avatar, viewport, or last conversation.

The server accepts at most 500 mutations per call. Larger imports and workspace
deletions remain in the durable outbox and continue in exact 500-item batches
after refresh or browser restart.

## Durable outbox and recovery

IndexedDB database `my-emotion-map-sync-v2` keeps account-isolated stores for
the mutation outbox, legacy conversion marker, and recovery bundles. Before a
network send, the exact `inFlightBatch` and expected revision are committed to
IndexedDB. A lost HTTP response therefore retries the same idempotent entity
changes instead of clearing unrelated work.

At startup the client:

1. reads the normalized account using stable 500-row pages and a three-attempt
   revision sandwich;
2. restores the account's newest outbox and exact in-flight batch;
3. converts the old local sync meta once, using base/local/remote hashes;
4. stores any ambiguous legacy or shared-field divergence in IndexedDB recovery;
5. applies remote state, queues local differences, or enters conflict without
   silently choosing one side.

Foreground, `pageshow`, online, visibility and revision-only BroadcastChannel
signals cause a remote reconcile. Only an empty outbox at the current remote
revision is shown as synced. Pending AI messages do not prevent record and
preference mutations from entering the outbox; completion triggers reconcile.

## Conflict actions

- **Safe merge** rebases disjoint changes, field-merges settings/preferences,
  creates explicit local conflict copies for same records/messages, preserves
  terminal follow-ups, and writes everything it cannot combine into recovery.
- **Load cloud** first persists a full recovery bundle, deletes only this
  account's outbox, then displays the remote canonical entities.
- **Keep local** first persists recovery, then re-diffs the exact local entities
  against the current remote revision; it does not send a workspace snapshot.

Remote tombstones participate in reconciliation, so an old local cache cannot
resurrect a deleted entity. Tombstones remain for seven complete days. The
retention job removes dependents before parents and keeps at most 20 history
entries per entity.

## AI and MCP reads

`emotion-chat` reads `dataset_revision`, formal non-draft records, and only the
target conversation's latest bounded messages. `emotion-map-mcp` queries only
normalized records. `emotion-map-action-mcp` reads only the revision and named
target record needed to create a proposal. Proposal confirmation still happens
in-app; completion is recorded only after its exact normalized mutation batch
has synced.

My Life Memory's MCP endpoint, manifest pinning, encryption, protocol, tools and
credential handling are unchanged. My Life Memory code and deployment are not
part of this migration.

## Backup, import and deletion

The readable HTML report remains available. A separate lossless JSON backup
contains versions, export time, dataset revision, all normalized entities,
theme, account preferences and a stable SHA-256 checksum. It excludes language,
viewport, last conversation, avatar data, credentials, sessions, tokens,
provider keys, outbox bases/sequences and recovery copies.

Import validates versions, checksum, every canonical field, uniqueness and all
references before showing counts. Future versions hard-stop. Merge keeps
disjoint IDs and records same-ID differences for recovery; replace first
downloads the current complete backup and persists an IndexedDB recovery
bundle. Both paths apply locally first, diff to mutations, and use the durable
outbox.

Workspace deletion requires typed confirmation. It empties the local workspace,
resets account preferences while retaining device language/avatar, and queues
soft deletes for every cloud entity. It never deletes the Supabase Auth user.

## Deployment state

The migrations, frontend, Edge Functions, verifier and recovery script are
repository artifacts only. No production SQL, RLS, Cron, Edge deployment,
frontend deployment or `main` merge is performed by this branch. Follow
`DEPLOY_NORMALIZED_SYNC_V2.md` during a scheduled maintenance window.
