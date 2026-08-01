# Supabase profile compatibility

The prototype is still local-only. It does not create a Supabase client, send
requests, or require environment variables.

The first compatible profile contract intentionally contains only:

| Local field | Supabase column | Shape |
|---|---|---|
| `profileId` | `profiles.id` | UUID; later supplied by `auth.users.id` |
| `profileName` | `profiles.display_name` | Trimmed text, 1–80 characters |

`src/domain/profileIdentity.ts` owns the row mapper. `supabase/schema.sql`
contains the matching table and owner-only RLS policies.

The bundled identity is fictional Demo data. Its UUID is for local rendering
and mapping tests only; it must not be inserted into `profiles` unless a real
authenticated user with that exact `auth.users.id` exists.
