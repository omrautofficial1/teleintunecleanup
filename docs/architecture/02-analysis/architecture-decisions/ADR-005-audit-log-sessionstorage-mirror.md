# ADR-005: Audit log mirrored to sessionStorage alongside in-memory state

**Status:** accepted
**Date:** 2026-09-10
**Deciders:** architect

## Context

`build.md` §8 specifies an audit log written after every delete action (device name, serial, IMEI, matched-on, previous last-sync, action taken, timestamp, simulated-or-real) with CSV export "at any time." The spec's own project structure (§10) places this in `features/deletion/auditLog.ts` and does not specify a persistence backing — read literally as "in-memory," a stray tab refresh or crash mid-session during a real deletion run loses the record of exactly the actions the spec treats as safety-critical enough to require an audit trail at all. This is the same posture gap flagged in the original review: a tool this deliberately paranoid about accidental deletion should not be casual about losing the record of what it actually did.

Quality attribute: **arc42 quality goal Q-2 (every real action is durably auditable)** — see `../constraints-and-context.md`.

## Decision

The audit log lives in-memory (Zustand or a dedicated React Query-independent store) as the spec describes, **and** every append operation also writes through to `sessionStorage` under a session-scoped key. On app load, if a prior in-session audit log exists in `sessionStorage` (e.g. after an accidental reload), it is rehydrated so the CSV export still reflects the full session's actions.

This does **not** extend the audit log's lifetime past the browser session (`sessionStorage` clears on tab/browser close) — that boundary is intentional and consistent with ADR-002's token-cache scoping. The goal is surviving an accidental reload within the same working session, not building a persistent backend audit trail (explicitly out of scope per §11 — no backend, no database).

## Alternatives Considered

| Option | Why rejected |
|---|---|
| Pure in-memory (spec literal reading) | One accidental reload during a real (non-simulated) deletion run silently erases the record of which devices were actually deleted — for a tool whose entire design philosophy is "make destructive actions visible and reviewable," losing the review trail is a real gap, not a nice-to-have fix. |
| IndexedDB with cross-session persistence | Over-scoped: the spec frames the audit log as a session log with export-on-demand, not a persistent compliance database. Building real persistence here blurs the "no backend, no database" boundary from §11 without the admin asking for that — if long-term retained audit history is wanted, that's a deliberate future requirement (and probably belongs server-side, not in browser storage), not something to sneak in as a client-side default. |

## Consequences

- Audit log survives accidental page reloads within a session; still fully lost on tab/browser close (matches token-cache lifetime, so a lost audit log and a lost write-scope token happen together — no scenario where the app silently retains delete capability but has forgotten what it already deleted).
- `auditLog.ts` needs a small serialize/rehydrate pair and a `sessionStorage` write on every append — trivial addition, tested alongside the CSV export logic.
- CSV export should be prompted contextually (e.g. a gentle "export before closing?" nudge is a reasonable future UX enhancement) but is not required by this ADR — the durability fix alone satisfies Q-2 for the reload case.

## Sources

- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/constraints-and-context.md` — Q-2 quality goal
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/structural-views/components.md` — Audit component (`features/deletion/auditLog.ts`, `features/audit/AuditLogView.tsx`)
- Original spec: `build.md` §8 (deletion safety rules), §11 (non-goals — no backend/database)
