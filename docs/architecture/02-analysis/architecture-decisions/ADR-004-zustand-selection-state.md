# ADR-004: Zustand for selection, filter, and simulation-mode state

**Status:** accepted
**Date:** 2026-09-10
**Deciders:** architect

## Context

`build.md` §2 leaves this open: "React Context or Zustand, admin's choice" — for holding current filters, selected row IDs, and the simulation toggle. This state is read and written from multiple, non-nested parts of the component tree (device table filters, duplicate group cards, the deletion confirm dialog, the header badge showing consent state) — not a simple parent-to-child prop chain.

## Decision

Use **Zustand** for this cross-cutting UI state: filters, selected candidate-row IDs, simulation on/off, and the "I understand this will factory-reset" per-session acknowledgment flag.

Server/remote data (the device inventory itself) stays in **React Query**, not Zustand — those are different categories of state (server cache vs. client-only UI state) and mixing them into one store is a common source of stale-cache bugs. This boundary is itself a small decision worth recording: `useDevices.ts` and `useDuplicates.ts` read from React Query; `useDeleteDevices.ts` and the filter/selection hooks read from the Zustand store.

## Alternatives Considered

| Option | Why rejected |
|---|---|
| React Context + `useReducer` | Works, but re-render granularity is worse (any context value change re-renders every consumer unless carefully split into multiple contexts), and the selection/simulation state changes on nearly every user interaction in the Duplicates and Review screens — exactly the pattern Context handles poorly without extra memoization machinery. |
| Redux Toolkit | Heavier than this app needs — no time-travel debugging or middleware requirement here, and it's not already a spec dependency. Zustand gives equivalent ergonomics with far less boilerplate for a store this small. |

## Consequences

- One store (`store/appStore.ts`, or colocated per-feature stores — see `components.md`) is the single source of truth for "what is currently selected and what mode is the app in," which the deletion confirm dialog, bulk-action summary, and header badge all read from directly without prop drilling.
- The **safety-critical invariant** (keeper rows never appear as selectable, simulation is the default) is enforced at the store-action level (e.g. a `selectCandidate(id)` action that no-ops if `id` belongs to a keeper or a locked corporate-Android row), not scattered across component-level checks — a single place to unit-test the "can this row ever become selected" logic.

## Sources

- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/structural-views/components.md` — State component boundary vs. React Query
- Original spec: `build.md` §2 (tech stack — state for selection), §8 (deletion safety rules)
