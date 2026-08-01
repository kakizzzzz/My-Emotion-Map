# My Emotion Map

My Emotion Map is a React/Vite interaction prototype for recording how places
and moments feel. A person can place a star, add context, review it in the
calendar, and revisit the record later.

The current prototype is local-first. New records may remain explicitly
unknown, GPS photos preserve reliable EXIF wall time without guessing, and a
manually run iOS Shortcut can pass one recent heart-rate observation through a
validated URL fragment into the Star Inbox. The web app cannot read Apple
Health or run monitoring in the background.

Optional email magic-link sign-in, owner-only revisioned sync, photo assistance
and grounded chat are isolated behind Supabase. The two AI functions use
different server-selected SiliconFlow models; provider credentials never belong
in browser code. My Life Memory is not queried or modified.

## Local development

```bash
npm install
npm run dev
```

The default preview is `http://127.0.0.1:3000`. No cloud account or provider
credential is required for local recording. Cloud controls stay unavailable
until the deployment supplies the public Supabase URL and publishable key.

A fresh browser starts in clearly labelled Demo mode with sample map records
and the fictional profile `Mina Park`. The local profile ID uses the same UUID
shape as Supabase `profiles.id`; no data is sent to Supabase. Exit Demo mode
from Settings → General preferences → Local data management to start with an
empty real-data space.

## Validation

```bash
npm run check
npm run check:all
```

`check` runs TypeScript, ESLint, unit/component tests, architecture checks and a
production build. `check:all` adds the system-Chrome Playwright flows.

Additional product references:

- `docs/ARCHITECTURE.md` — frontend module boundaries and state ownership.
- `docs/MAINTAINABILITY.md` — source-size and import-boundary checks.
- `docs/MAP_DATA_LICENSES.md` — map sources, attribution and operational risk.
- `docs/SUPABASE_PROFILE_COMPATIBILITY.md` — local profile mapping and minimal
  owner-only Supabase schema.
- `docs/SHORTCUT_MCP_STAR_INBOX.md` — real Shortcut fragment contract and
  inbox state machine.
- `docs/SECURITY.md` — secret, RLS, CAS, CORS and grounded-AI boundaries.
