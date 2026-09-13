# ADR-006: Write-scope consent decline — abort and revert to simulation

**Status:** accepted
**Date:** 2026-09-10
**Deciders:** architect

## Context

`build.md` §5 requires incremental consent: `DeviceManagementManagedDevices.ReadWrite.All` is requested only "at the moment the admin confirms a real (non-simulated) deletion." The spec does not say what happens if the admin (or their tenant's conditional access / admin-consent policy) **declines or fails** that escalation — e.g. the popup is dismissed, admin consent is required and unavailable to this user, or the tenant blocks the scope entirely.

Quality attribute: **arc42 quality goal Q-1 (deletion is deliberate, never accidental, never silently degraded)**.

## Decision

If the incremental write-scope consent request fails or is declined for any reason:
1. Abort the pending delete action — zero Graph `DELETE` calls are issued.
2. Force simulation mode back **on** (even if the admin had just turned it off) and clear the typed `DELETE` confirmation field.
3. Surface a specific, named error state (distinct from a generic auth failure) explaining that write access was not granted and real deletion is unavailable until it is.
4. The header badge stays at "Read-only" — it only flips to "Read and write" on a confirmed, successful token acquisition with the write scope, never optimistically before that.

The app never falls back to a "partially trusted" state where some UI implies write capability was granted when it wasn't.

## Alternatives Considered

| Option | Why rejected |
|---|---|
| Retry loop / auto re-prompt | Consent popups auto-retrying without a fresh explicit admin action is exactly the kind of silent-escalation pattern this spec is designed to avoid everywhere else (simulation-by-default, typed confirmation, keeper checkboxes absent from DOM). A declined consent should require a new deliberate click, not a background retry. |
| Leave simulation toggle in whatever state the admin left it, just block the button | Riskier: if simulation was already off (admin was mid-flow toward a real delete) and consent silently fails, leaving simulation off means the very next click on a now-differently-wired button could behave unexpectedly. Forcing simulation back on is the conservative default and mirrors "simulation is the default state on every screen" from §8. |

## Consequences

- One more explicit state in the deletion flow's state machine (`useDeleteDevices.ts`): `idle → simulating → requesting-write-consent → {granted: confirming-real-delete | declined: reverted-to-simulation}`.
- No path exists where a Graph `DELETE` call fires without a freshly confirmed write-scope token in hand — testable directly (mock MSAL to reject the incremental consent call, assert zero `fetch` calls to the delete endpoint and assert simulation toggle state).

## Sources

- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/constraints-and-context.md` — Q-1 quality goal
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/structural-views/components.md` — Deletion component (`features/deletion/useDeleteDevices.ts`)
- Original spec: `build.md` §5 (Authentication), §8 (Deletion safety rules)
