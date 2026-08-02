# Shortcut, MCP and Star Inbox

## Platform boundary

The web app cannot read Apple Health directly, monitor it in the background or
promise an arbitrary heart-rate automation trigger. The supported path is an
installed iOS Shortcut using a system-supported manual, time, App or Workout
trigger.

## Shortcut v2

Settings → AI → Automation lets the user confirm an observation range, open an
official iCloud Shortcut when configured, generate a 30-day pairing code and
send a local test observation. The pairing token is shown once, stored only as
a SHA-256 hash on the server and can be revoked.

The Shortcut sends one authenticated request to
`/functions/v1/shortcut-ingress`:

```json
{
  "version": 2,
  "eventId": "stable-sample-id",
  "timeZone": "Asia/Seoul",
  "context": "resting",
  "samples": [
    { "bpm": 92, "at": "2026-08-01T16:05:00+09:00" }
  ],
  "test": false
}
```

The server permits 1–12 samples at 20–260 bpm, rejects stale/future samples,
uses the median for display and normally requires two of the latest three
resting samples to be outside the confirmed range. Workout and low-sample
observations are not compared with the resting range; they remain explicitly
low-signal and require user review. Event IDs are unique per user.

The older URL-fragment receiver remains a local compatibility path. It is
disabled until the range is confirmed, and its single-sample mode is disabled
by default.

## Inbox state

External observations enter Star Inbox as pending and without coordinates.
Dismissal updates the external observation only. Review requests current
browser location and records it as confirmation-time location, never as the
health sample's event location. A formal star exists only after the user saves
the draft.

Follow-ups never enter Star Inbox. They exist only in the companion chat and
offer exactly: lighter, stronger, different, same, or skip.

## MCP

`/functions/v1/emotion-map-mcp` implements JSON-RPC initialize, tools/list and
tools/call over Streamable HTTP-compatible POST requests. Personal tokens are
short-lived, hashed, revocable and split into read and proposal scopes.

Read tools query only the token owner's saved real records and omit exact
coordinates by default. Output tools can only create an idempotent queued
proposal; they cannot delete, overwrite or save a formal record. Every call is
scope checked, owner checked, payload bounded and rate limited. Record bodies
and raw tokens are not logged.
