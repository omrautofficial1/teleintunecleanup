# ADR-002: MSAL token cache location — sessionStorage

**Status:** accepted
**Date:** 2026-09-10
**Deciders:** architect

## Context

`build.md` §5 mandates incremental consent: the app starts with `DeviceManagementManagedDevices.Read.All` only, and requests `...ReadWrite.All` only at the moment of a real (non-simulated) delete confirmation. The spec does not specify where MSAL should cache tokens (`localStorage` vs `sessionStorage` vs in-memory). This is a real decision: it determines how long an elevated write-capable session persists, and on a shared or kiosk-style admin workstation, a persistent write-scope token is a materially larger blast radius than a read-only one.

Quality attribute: **arc42 quality goal Q-1 (deletion is deliberate, never accidental)** — see `../constraints-and-context.md`.

## Decision

Configure `@azure/msal-browser` with `cache.cacheLocation: "sessionStorage"`.

Consequence for the consent-escalation flow: closing the tab/browser drops both the read and write token. Every new session starts back at read-only, and the admin must explicitly escalate again before any real delete — there is no path where a write-capable token silently outlives the admin's active attention on the tab.

## Alternatives Considered

| Option | Why rejected |
|---|---|
| `localStorage` (MSAL's more common default in tutorials) | Persists across browser restarts. Once write scope is granted, it would silently remain granted on next launch — directly undermines the spec's incremental-consent safety model, which frames write access as something requested "at the moment" of a real delete, not a standing capability. |
| In-memory only (custom cache provider) | Most restrictive, but breaks MSAL's silent-refresh-across-tab-reload behavior and reloading the page would force a full interactive re-login even for read-only browsing — bad UX for a tool admins will keep open in a tab during a cleanup session, with no safety benefit over sessionStorage since the delete-consent flow already re-escalates every session. |

## Consequences

- Every fresh session (new tab or browser restart) starts at read-only capability regardless of what happened in a prior session — matches the spec's "header badge always reflects current consent" requirement (§5) literally, since consent state cannot silently survive a restart.
- Admins on shared workstations get a meaningful safety property for free: leaving a tab open across a screen-lock keeps existing session storage (same tab), but closing the browser fully resets to read-only.
- No custom token cache plugin needed — this is a one-line MSAL config option (`msalConfig.ts`), keeping the auth module aligned with "standard Microsoft-supported libraries" per spec §2.

## Sources

- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/constraints-and-context.md` — Q-1 quality goal
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/structural-views/components.md` — Auth component (`auth/msalConfig.ts`)
- Original spec: `build.md` §5 (Authentication)
