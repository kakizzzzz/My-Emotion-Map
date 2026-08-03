# My Emotion Map frontend architecture

## Purpose

Application composition belongs in `src/App.tsx`; feature behavior and feature
markup do not. Architecture changes must preserve component bodies, class
names, motion boundaries, local-storage keys and the order of root effects
unless the visual design requires a coordinated change.

## Dependency direction

Use this one-way direction:

```text
main
  -> App
    -> app chrome and feature screens
      -> repositories, i18n, browser services and shared UI
        -> domain types and seed data
```

Rules enforced by `npm run check:imports`:

- `src/App.tsx` may compose every feature.
- `src/app/` may coordinate shared app UI and models, but may not import a
  feature implementation.
- A feature may import its own files and shared modules, but may not deep-import
  another feature.
- Root shared modules such as `types.ts`, `motion.ts` and reusable icons may not
  depend on `app/` or `features/`.
- Cross-feature flows are coordinated by props and state in `App`, not by
  reaching into a sibling feature.

## Directory ownership

```text
src/
  App.tsx                         root state, effects and screen composition
  app/
    AppChrome.tsx                 global menu, inbox button and drawer
    appDataRepository.ts          local data validation and persistence
    profilePreferences.ts         local profile preferences
  features/
    calendar/                     calendar and date-detail UI
    chat/                         continuous AI conversation
    location/                     location permission prompt
    map/                          map, stars and map tools
    notes/                        note reader/editor/revisit flows
    settings/                     settings and preference panels
  data.ts                         local seed content
  i18n.ts                         language context and copy
  types.ts                        shared domain types
  useLocationController.ts        browser geolocation lifecycle
```

Put domain behavior in a named module (`coordinateTransforms.ts`,
`notePrompts.ts`, and so on), then import it where
it is owned.

## State ownership

- Persisted cross-screen state lives at the app boundary or in a dedicated
  repository/hook.
- Temporary visual state stays inside its feature: open panels, draft text,
  selected tabs, map popovers and editor steps are not global state.
- Browser APIs are isolated behind a hook or service. Components do not start
  unmanaged watchers.
- Persisted values have one documented storage key and a defensive load path.
- Do not duplicate derived state. Compute counts, labels and selections from
  the canonical state.

## Visual-parity rule

Architecture work must preserve the current product language:

- keep semantic theme variables, class names and DOM hierarchy stable;
- keep the existing component sizes, safe-area offsets and layer order;
- do not replace eager screens with lazy loading during a parity refactor;
- preserve `AnimatePresence` ownership and reduced-motion behavior;
- verify map placement, star overlays, sheets, calendar, inbox, chat and
  settings after moving code.

Visual changes and architecture changes should be separate reviewable tasks.

## Validation

```bash
npm run check
```

For a fast local loop:

```bash
npm run typecheck
npm run check:architecture
```

The full check covers the product source, architecture boundaries and build.
