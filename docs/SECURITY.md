# Security boundary

My Emotion Map is local-first. My Life Memory is a separate product and is not
queried, modified, deployed or used as a backend by this repository.

## Secrets and provider isolation

- The real SiliconFlow credential is read only inside Edge Functions with
  `Deno.env.get("SILICONFLOW_API_KEY")`.
- Provider credentials are forbidden from frontend code, every `VITE_*`
  variable, repository files, documentation values, fixtures, logs, error
  responses and build output.
- The allowed provider base URL and both model IDs are checked against fixed
  server constants. Clients cannot choose a model, token budget, temperature,
  system prompt or evidence.
- `photo-assist` uses the configured photo model only. `emotion-chat` uses the
  configured chat model only. The functions do not share a model setting.
- Provider error bodies and generated raw drafts are never returned or logged.

## Photo assistance

The browser resizes one selected photo to at most 672px, paints it into a new
canvas and exports a bounded JPEG. This removes the original EXIF before the
image leaves the browser. The Edge Function independently checks JPEG format,
size, dimensions and absence of an EXIF marker. It receives no coordinates,
heart rate, history or other records.

The result is schema-checked and limited to one factual scene title plus zero to
two optional questions. The fixed purpose question remains frontend-owned.
Failure never blocks the GPS/EXIF record. A late response is applied only inside
the still-open editor and never replaces a user-edited title.

## Grounded chat

The client submits only the current question, language, conversation ID and
known cloud revision. The Edge Function authenticates the user, reads the
owner-scoped snapshot through the same bearer token, excludes Demo, drafts,
inbox drafts and unfinished records, and selects at most six authorized E1–E6
records.

The model returns internal claims, not public evidence. The server validates
schema, evidence keys, ownership, minimum evidence counts, record dates and
numbers, unknown semantics, diagnosis, causal language, personality inference,
unsolicited advice and unsupported positive/negative conclusions. High-risk
output is never shown. One restricted retry is allowed; otherwise a fixed safe
fallback is returned. Public note IDs, titles, dates, places, match reasons and
confidence are built from the authorized records by the server.

## Cloud data and rate limits

`app_states` is owner-only under RLS. Writes use compare-and-swap with expected
revision and an idempotent request UUID. Demo snapshots are rejected and
conflicts pause upload after local and remote recovery copies are stored.

`claim_ai_quota` atomically enforces five photo requests and ten chat requests
per authenticated user per hour. Direct table access is revoked.

MCP and Shortcut use different random personal tokens. Only SHA-256 hashes are
stored. Tokens expire, can be revoked, and never appear in browser persistence,
README examples, fixtures, function logs or error responses. MCP read and
proposal scopes are separate; proposals require in-app confirmation. Shortcut
observations are owner-scoped pending inputs, not formal records or AI evidence.
Proposal confirmation is recoverable and idempotent: the server claims an
operation as `accepting`, the client journals the exact transition, and the
server moves it to `applied` only after the resulting workspace revision is
synced. Revision or target-fingerprint drift stops the operation.

## Required deployment verification

- use an exact `ALLOWED_ORIGINS` list, never `*`;
- apply migrations only to the dedicated My Emotion Map project;
- run cross-user RLS and RPC tests with two non-production test accounts;
- verify Auth redirect URLs, session expiry, CAS conflict and idempotent retry;
- verify provider unavailable, balance, rate-limit, timeout and invalid-JSON
  responses without exposing provider bodies;
- scan source and built assets for credential patterns before GitHub upload;
- test real JPEG/HEIC photos and Shortcut transport on an iPhone.
- verify MCP cross-user denial, token expiry/revocation and proposal-only writes.
