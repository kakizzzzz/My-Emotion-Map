# My Emotion Map

My Emotion Map is a local-first React/Vite app for saving moments as stars,
reviewing them by place and date, and revisiting a saved record later.

The data model keeps unknown feelings unknown, preserves wall time without
inventing a timezone, and separates every signed-in account. A successful
sign-in opens only that account's real workspace; the local profile name is not
the cloud account ID.

Account/password auth, revisioned sync, photo assistance, grounded chat,
Shortcut ingress and MCP access are implemented through the dedicated My
Emotion Map Supabase project. My Life Memory is never modified. Its read-only
MCP is queried only after the user connects it and asks an explicit My Life
Memory, cross-memory, route or photo question.

## Local development

```bash
npm install
npm run dev
```

The local URL is `http://127.0.0.1:3000`. Browser code may contain only the
public Supabase URL and publishable key. SiliconFlow credentials and service
role credentials belong only in Edge Function secrets.

For a project-path deployment, set `VITE_APP_BASE_PATH` to the public base
path. An optional official iCloud Shortcut URL may be supplied through
`VITE_SHORTCUT_INSTALL_URL`; it is accepted only when it is an iCloud
Shortcuts URL.

## Validation

```bash
npm run check
npm run check:all
```

`check` runs TypeScript, ESLint, unit/component tests, architecture checks
and the production build. `check:all` also runs the mobile Chromium and iPhone
WebKit flows. CI repeats both groups.

References:

- `docs/ARCHITECTURE.md` — state and module ownership.
- `docs/MAP_DATA_LICENSES.md` — map sources and attribution.
- `docs/SHORTCUT_MCP_STAR_INBOX.md` — Shortcut and inbox boundaries.
- `docs/MY_LIFE_MEMORY_CONNECTION.md` — fixed read-only input connection.
- `docs/EMOTION_MAP_MCP.md` — read-only external output and separate actions.
- `docs/SECURITY.md` — secrets, RLS, sync and AI grounding.
