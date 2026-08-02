# Shortcut, MCP and Star Inbox

## Platform boundary

The web app cannot read Apple Health directly, monitor it in the background or
promise an arbitrary heart-rate automation trigger. The supported path is an
installed iOS Shortcut using a system-supported manual, time, App or Workout
trigger.

## Shortcut v3

Settings → AI → Automation lets the user confirm an observation range, open an
official iCloud Shortcut only when a device-verified link is configured,
generate a 30-day pairing code and run a real connection test. The pairing
token is shown once, stored only as a SHA-256 hash on the server and revoked
separately from MCP access tokens.

The Shortcut sends one authenticated request to
`/functions/v1/shortcut-ingress`:

```json
{
  "version": 3,
  "eventId": "stable-sample-id",
  "timeZone": "Asia/Seoul",
  "context": "resting",
  "samples": [
    { "bpm": 112, "at": "2026-08-01T16:05:00+09:00" },
    { "bpm": 110, "at": "2026-08-01T16:04:00+09:00" },
    { "bpm": 109, "at": "2026-08-01T16:03:00+09:00" }
  ],
  "test": false
}
```

The shared `heart-v3` pure function is used by the Edge Function and local
compatibility receiver. It validates every sample, requires explicit offsets,
rejects future/stale/reverse-ordered data, deduplicates timestamps and uses
exactly the latest three accepted samples for both decision and displayed
median. Two of three resting samples must be outside the saved inclusive range.
Single-sample review requires explicit opt-in and a 5 bpm margin. Workout and
unknown contexts are suppressed by default; their stricter review modes also
require explicit opt-in.

Non-test observations with the same owner, token, high/low side and context are
merged into one episode inside the saved 30-minute cooldown. Test observations
are always separate. No decision diagnoses a condition or assigns an emotion.

The older URL-fragment receiver remains a local compatibility path, but now
uses the same `heart-v3` evaluator. Legacy fragments without distinct sample
timestamps safely degrade to a single accepted sample and are suppressed unless
the user explicitly enabled that policy.

The settings test never fabricates a local inbox item. It posts a version 3 test
observation to `shortcut-ingress`, then reads the inserted row back through the
signed-in owner's RLS session before reporting success. Failure returns an
unavailable/retryable state and creates no fake success.

## Inbox state

External observations enter Star Inbox as pending and without coordinates.
The browser reads all `pending` and `delivered` rows using a `(created_at,id)`
cursor, writes them idempotently into the owner workspace, then acknowledges
pending IDs as delivered. An interrupted acknowledgement is retried; 20 known
rows cannot starve row 21.
Dismissal updates the external observation only. Review requests current
browser location and records it as confirmation-time location, never as the
health sample's event location. A formal star exists only after the user saves
the draft.

Follow-ups never enter Star Inbox. They exist only in the companion chat and
offer exactly: lighter, stronger, different, same, or skip.

## MCP

My Life Memory input and Emotion Map output are separate connections. Their
current contracts are documented in `MY_LIFE_MEMORY_CONNECTION.md` and
`EMOTION_MAP_MCP.md`. Neither shares state or revocation with Shortcut pairing.

## Deployment status

The Shortcut application code and migrations are implemented and locally
tested in this repository. This document does not claim that the migrations,
Edge Functions or an iCloud share link have been production-verified.
Production Supabase A/B and real-iPhone Shortcut smoke tests remain release
gates.
