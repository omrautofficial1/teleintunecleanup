# ADR-003: Raw `fetch`-based Graph client instead of Microsoft Graph JS SDK

**Status:** accepted
**Date:** 2026-09-10
**Deciders:** architect

## Context

`build.md` §6 imposes specific, non-standard requirements on every Graph call:
- Follow `@odata.nextLink` verbatim, never reconstruct pagination with `$skip`.
- On `operatingSystem eq '...'` filter failure (undocumented, sometimes 400s), fall back to client-side filtering and **surface which path was used** in a status line.
- On HTTP 429, read `Retry-After` and wait exactly that long — not a fixed/exponential backoff.

The Microsoft Graph JavaScript SDK (`@microsoft/microsoft-graph-client`) provides its own retry middleware and pagination helpers (`PageIterator`), but its default retry-handler backoff strategy and its abstraction over raw responses make it harder to guarantee the exact `Retry-After`-driven wait and the "which code path fired" observability the spec demands. Wrapping and fighting SDK middleware defaults to get non-default behavior adds indirection without benefit.

Quality attribute: **arc42 quality goal Q-3 (fetch behavior is transparent to the admin, not silently magic)** — see `../constraints-and-context.md`.

## Decision

Build a small hand-rolled Graph client (`api/graphClient.ts`) on top of `fetch` and MSAL's `acquireTokenSilent`. It owns:
- Pagination: loop on `@odata.nextLink` until absent.
- 429 handling: read `Retry-After` header, `await sleep(retryAfterSeconds * 1000)`, retry once, log the wait.
- The `operatingSystem eq '...'` try-once-then-fallback logic, with the resulting path (`server-filtered` vs `client-filtered-fallback`) returned alongside data so the UI status line has ground truth instead of inferring it.
- 401 / `InteractionRequiredAuthError` handling: `acquireTokenSilent` retry once, then bubble up to trigger interactive login.

## Alternatives Considered

| Option | Why rejected |
|---|---|
| `@microsoft/microsoft-graph-client` with `PageIterator` + custom retry middleware | Technically capable of all of this, but every one of the spec's three non-standard fetch behaviors (`Retry-After`-exact wait, fallback-path visibility, verbatim-nextLink-only pagination) requires overriding or bypassing SDK defaults. At that point the SDK is providing negative value — its abstractions have to be worked around rather than used. |
| `axios` with interceptors | No material advantage over `fetch` for this use case; adds a dependency for HTTP behavior `fetch` + MSAL already cover. Browser-only SPA, no Node-specific axios features needed. |

## Consequences

- One more module to unit-test directly (pagination loop, 429 handling, fallback logic) — covered by MSW-mocked Vitest tests, not just `duplicateEngine.ts`. This was a gap in the original spec's testing section (§10 only calls out `duplicateEngine.ts` explicitly); noted in acceptance criteria addendum.
- No SDK version-compatibility risk (Graph SDK major-version churn) — only `fetch` and MSAL's token acquisition are external surface.
- Slightly more code to write and maintain than "import SDK, call `.get()`" — accepted tradeoff for exact control over retry/pagination/fallback semantics the spec requires.

## Sources

- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/constraints-and-context.md` — Q-3 quality goal
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/structural-views/components.md` — Data layer component (`api/graphClient.ts`, `api/devices.ts`)
- Original spec: `build.md` §6 (Data layer — fetching devices from Graph)
