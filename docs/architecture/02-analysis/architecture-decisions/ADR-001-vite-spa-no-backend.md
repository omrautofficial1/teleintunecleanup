# ADR-001: Vite + React SPA with no backend server

**Status:** accepted
**Date:** 2026-09-10
**Deciders:** architect (Shadow, product owner)

## Context

The build spec (`build.md`) is explicit: pure client-side SPA, no backend server or database, browser-held Graph delegated token is the only credential in play. The project folder was initially scaffolded as a Next.js App Router app before the spec was reviewed — Next.js ships a server runtime (SSR, route handlers, middleware) that has no role in this design and actively fights the auth model MSAL expects (a static origin with a registered SPA redirect URI, not a server-rendered one).

Quality attribute driving this: **arc42 constraint C-1 (no backend, browser-only credential)** — see `../constraints-and-context.md`.

## Decision

Rebuild the project on **Vite + React 18/19 + TypeScript**, served as static files. No server component of any kind — dev server is Vite's, production deploy is a static host (S3/CloudFront, Azure Static Web Apps, Netlify, etc.), and the deployed origin is exactly what gets registered as the Entra SPA redirect URI.

## Alternatives Considered

| Option | Why rejected |
|---|---|
| Next.js (App Router, `output: 'export'` static mode) | Works technically but drags in a build/runtime model (server components, route conventions, edge-case SSR hydration) that serves zero requirements here. Every requirement in the spec is client-only. Forcing static export means constantly fighting defaults that assume a server exists. |
| Next.js with API routes as a thin BFF for Graph calls | Explicitly a non-goal — spec states "Do not add a backend" and "the browser's Graph token is the only credential in play." A BFF would also mean holding a client secret server-side, contradicting the delegated-auth-only model. |
| Create React App | Deprecated by Meta, no longer receives updates; Vite is the modern default with materially faster dev server and build times. |

## Consequences

- Deployment is trivial: any static file host works, no server process to run, patch, or scale.
- MSAL popup/redirect flows work against a stable, single-origin SPA registration with no ambiguity about what redirect URI to register.
- No option to ever add server-side logic without an explicit new ADR — if a future requirement needs a backend (e.g. server-side audit log persistence across sessions), that is a deliberate architecture change, not an incremental slide.
- CI/CD is `npm run build` → static artifact upload; no server health checks, no runtime environment beyond static hosting.

## Superseded implementation note

The project directory was scaffolded twice: first as Next.js (commit `cc3ab31`, discarded), then rebuilt as Vite (commit `ee905af`, current). Git history for the Next.js scaffold was not preserved (`.git` directory was removed and reinitialized) since no application code had been written against it — only the framework skeleton existed.

## Sources

- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/constraints-and-context.md` — C-1 constraint detail
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/01-summary/system-context.md` — resulting system boundary
- Original spec: user-supplied `build.md`, §2 (tech stack), §3 (prerequisites), §11 (non-goals)
