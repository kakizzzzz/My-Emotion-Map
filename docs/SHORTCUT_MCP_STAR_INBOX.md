# Apple Health Shortcut → Star Inbox

Status: the local fragment receiver is implemented. A real iPhone Shortcut still
has to be created and tested on-device. The web app does not read HealthKit,
does not run in the background, and does not claim a threshold automation that
iOS Shortcuts cannot provide.

## Shortcut recipe

1. `Find Health Samples` for heart rate, sorted newest first, limit 1.
2. If there is no recent sample, open the normal app URL and stop.
3. Read the sample value in `count/min` and its original timestamp.
4. Create a stable event ID from the timestamp, value and the literal
   `apple-health-shortcut`. If hashing is inconvenient, pass a short stable raw
   value; the web receiver derives a URL-safe fallback ID.
5. URL-encode every value and open:

```text
APP_ORIGIN/#shortcut-heart?v=1&hr=126&at=2026-08-01T16%3A05%3A00%2B08%3A00&eid=sample-id&src=apple-health-shortcut
```

The fragment is removed from the address bar with `history.replaceState`
before validation or any asynchronous work. Fragments are not sent in normal
HTTP requests or Referer headers.

## Receiver rules

- version must be `1`;
- heart rate must be finite and between 20 and 260 bpm;
- the sample may be at most 10 minutes old and at most 2 minutes in the future;
- the user’s lower and upper threshold values are inclusive;
- every source event ID is persisted in a capped local dedupe set before UI;
- in-range samples do not create an inbox item;
- outside-range samples create a `pending` item without coordinates;
- the copy calls it an observation, never an emotion, danger or diagnosis.

## Placement state machine

```text
pending
  ├─ dismiss → dismissed
  └─ confirm → request browser geolocation
                   ├─ failure → pending (no 0,0 fallback)
                   └─ success → draft_created

draft_created
  └─ editor save or close → completed
```

The sample time is the health event time. Coordinates, when the user confirms,
describe the later location-capture time. The UI must not imply that they are
the same event or location.

## Privacy boundary

Inbox-only health events are excluded from the grounded-chat evidence set.
Only a linked note with `isDraft !== true` can later be treated as a normal
record. My Life Memory is not queried or modified anywhere in this flow.
