# Emotion Map MCP

## Direction and capability split

Emotion Map External Access is an outbound interface for a user's own formal
Emotion Map records. It is not the My Life Memory input connection.

The default endpoint is `/functions/v1/emotion-map-mcp`. An `output` token has
only `records:read`; its manifest contains seven read-only tools:

- `research_emotion_context`
- `search_emotion_records`
- `list_emotion_locations`
- `get_location_emotion_context`
- `get_day_emotion_context`
- `summarize_emotion_range`
- `export_emotion_report`

There is no `open_record` tool because the application does not currently have
a verified owner-scoped deep-link consumer. There are no coordinate, health or
image tools in the default manifest.

Proposal capability is isolated at
`/functions/v1/emotion-map-action-mcp`. It requires an explicitly issued
`action` token with `proposals:write`. Its three tools only queue idempotent
proposals. They cannot change a record directly, and the app's existing
revision, fingerprint, recovery-journal and confirmation flow remains required
before anything is applied.

## Tool contract

The manifest, public schemas and validator live separately. Every object schema
uses `additionalProperties: false`; string, date and limit bounds are enforced
before database access. Tool text content is serialized from the exact same
value as `structuredContent`, and successful output is checked against the
selected `outputSchema`.

`research_emotion_context` reuses the grounded chat retrieval computation. It
returns an explicit retrieval status, bounded records, aggregates computed from
the complete authorized formal set, limitations, privacy-safe ambiguity options
and a short-lived signed continuation token. The token exposes no raw note ID.
Drafts, unfinished stars, inbox items, Demo data and unknown future snapshot
schemas are excluded or rejected.

## Stateless transport and privacy

Both endpoints use authenticated stateless JSON-RPC POST. They support protocol
negotiation for `2025-06-18` and `2025-03-26`, `ping`, bounded batches and MCP
protocol response headers. Notifications receive 202 with no JSON-RPC body.
Empty or oversized batches, illegal IDs, unsupported versions, unknown fields
and invalid dates are rejected.

If an HTTP `Origin` header is present, it must be in `MCP_ALLOWED_ORIGINS`;
non-browser clients may omit Origin. Raw tokens are accepted only in the bearer
header, hashed before lookup, never logged and never returned. Every app-state
query filters by the token owner, and successful tool use updates
`last_used_at`.

`MCP_CONTINUATION_SECRET` is an Edge Function secret used only to sign research
continuations. Its value must never enter frontend variables, repository files,
logs, errors or build output.

## Deployment status

Migration `202608020005_phase5_output_mcp.sql`, both MCP endpoints, the exact
Origin allowlist and the continuation signing secret were deployed to the
dedicated My Emotion Map project on 2026-08-02. Both endpoints are ACTIVE with
gateway JWT verification disabled because they authenticate only their own
hashed output/action bearer tokens. Unauthenticated POST requests return HTTP
401.

A production MCP client handshake, two-account denial, token expiry/revocation,
`last_used_at` update and proposal confirmation smoke still require real
owner-issued test tokens and remain release gates.
