# Frontend maintainability rules

## File budgets

`npm run check:size` enforces hard limits.

| File kind | Preferred target | Hard limit |
| --- | ---: | ---: |
| `src/App.tsx` | 500 lines | 1,000 lines |
| feature or shared `.tsx` | 500 lines | 1,000 lines |
| model, hook or service `.ts` | 450 lines | 1,000 lines |
| feature CSS | 700 lines | 1,000 lines |

Going past a target is a prompt to split by responsibility. Going past a hard
limit fails the architecture check.

Temporary exceptions live only in
`scripts/source-size-exceptions.json`. Every exception must state:

- why preserving the larger file is currently safer;
- who owns the follow-up;
- when the exception must be removed.

Do not raise a limit to make a check pass. Split the responsibility or add a
time-bounded exception with a real removal plan.

## `App.tsx` rules

`App.tsx` is a composition root. It may contain:

- root providers;
- cross-screen persisted state;
- effect ordering that coordinates features;
- navigation handlers;
- screen and global-overlay composition.

It must not accumulate:

- complete screen markup;
- map, calendar, chat, note or settings controls;
- browser API implementations;
- large constant catalogs;
- coordinate/date/text helpers;
- reusable visual primitives.

When `App.tsx` reaches 850 lines, split before adding a new feature. Its hard
limit remains 1,000 lines.

## Component and module rules

- One exported primary component per file; colocate only small private
  subcomponents that serve it.
- Name components `PascalCase.tsx`, hooks `useName.ts`, and focused pure modules
  after their responsibility.
- Avoid vague dumping grounds such as `utils.ts`, `helpers.ts` and `common.ts`.
- Event props use `onVerb`; local handlers use `handleVerb`.
- Booleans begin with `is`, `has`, `can` or `should`.
- A feature does not import a sibling feature's internal file.
- Keep business transformations pure and separate from DOM, storage and React.
- Keep local-storage schemas and keys backward compatible; add migrations before
  changing stored shapes.
- Do not add hard-coded interface copy outside the localization layer.

## Change discipline

For structural refactors:

1. Record a passing typecheck and the current critical UI states.
2. Move one responsibility at a time.
3. Preserve component props, hook order, class names and persistence shapes.
4. Run typecheck after each extraction.
5. Run the architecture checks and production build.
6. Validate the real local preview at phone and desktop sizes.

Do not combine a visual redesign, persistence migration and module extraction
in one change unless they are inseparable.

## Current explicit debt

Two parity-first exceptions remain visible in the size configuration:

- `MapScreen.tsx`: split map state/controller logic from overlays and tool
  panels without changing star placement behavior.
- `styles.css`: split tokens/base, shell, map, calendar, communication, notes
  and settings while preserving selector order.

These exceptions identify the next extraction candidates. No new oversized file
may be added beside them.
