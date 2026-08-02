# My Life Memory connection

My Life Memory is a separate product and is never modified or deployed by this
repository. Built-in Emotion Map chat may read its fixed official read-only MCP
only after the current user connects it and asks an explicit My Life Memory,
cross-memory, route or photo question.

The browser submits a user-created token once to
`/functions/v1/my-life-memory-connection`. It cannot submit an endpoint,
manifest, model, evidence or token budget. The Edge Function verifies
`initialize`, the exact server identity, the full canonical nine-tool manifest
fingerprint and read-only annotations before encrypting the token with AES-GCM
in an owner-scoped row. Authenticated browser code can read status metadata but
has no grant on ciphertext or IV columns.

Normal questions remain local. External calls are deterministic, allowlisted,
byte/call bounded and separately labelled. My Life Memory tool content is
untrusted data: it cannot override instructions, count as an Emotion Map local
pattern or create/edit either product's records. Disconnect deletes the owner
connection row.

The fixed endpoint, canonical nine-tool manifest SHA-256 and a new AES-GCM
credential key were configured as Edge Function secrets in the dedicated My
Emotion Map project on 2026-08-02. The migration and connection/chat functions
were deployed; an unauthenticated request is rejected with HTTP 401. No My Life
Memory code or cloud project was changed.

Production connect/test/disconnect and two-account smoke are not yet claimed.
They require a real owner to generate a My Life Memory MCP token and connect it
through this app; that token must never be placed in source, documentation or a
frontend environment variable.
