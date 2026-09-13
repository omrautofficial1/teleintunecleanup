# Solution Strategy (arc42 §4)

## Technology Decisions (Summary)

| Decision | Choice | ADR |
|---|---|---|
| Application shell | Vite + React 19 + TypeScript, static SPA, no backend | ADR-001 |
| Auth | `@azure/msal-browser` + `@azure/msal-react`, `sessionStorage` token cache, popup-first with redirect fallback | ADR-002 |
| Graph data access | Hand-rolled `fetch`-based client (not the Graph SDK) for exact control over pagination/429/fallback semantics | ADR-003 |
| Server-cache state | `@tanstack/react-query` — inventory fetch, caching, manual refresh | (spec-mandated, §2) |
| Table | `@tanstack/react-table` (headless) — client-side pagination/sort/filter over the full in-memory inventory | (spec-mandated, §2) |
| Cross-cutting UI state | Zustand — filters, selection, simulation toggle, wipe-risk acknowledgment | ADR-004 |
| Audit log persistence | In-memory + `sessionStorage` mirror for reload survival within a session | ADR-005 |
| Styling | Tailwind CSS, design tokens per spec §9.4, IBM Plex Sans/Mono | (spec-mandated, §9.4) |
| Testing | Vitest + React Testing Library + MSW (Graph mocking) | (spec-mandated §2, extended in this strategy — see below) |

## Top-Level Decomposition Approach

The system decomposes along the spec's own five-screen flow (Sign-in → Inventory → Duplicates → Review & Delete → Audit log), each mapped to a `features/` module, plus three cross-cutting layers:

1. **`auth/`** — MSAL wiring, silent-refresh-then-interactive escalation, incremental consent for write scope. Nothing else in the app talks to MSAL directly.
2. **`api/`** — Graph client (ADR-003) and typed device DTOs. Nothing else in the app calls `fetch` against Graph directly.
3. **`features/duplicates/duplicateEngine.ts`** — pure functional core (C-6), zero framework dependencies, the one module every acceptance-checklist duplicate-detection item traces back to.
4. **`features/devices/`, `features/duplicates/`, `features/deletion/`, `features/audit/`** — one feature module per screen, each composing the layers above.
5. **`components/ui/`** — dumb, reusable, design-token-driven primitives (Button, Badge, Checkbox, Modal, Table) — no business logic, so the safety-critical logic (e.g. "keeper has no checkbox") lives in the feature layer that decides *whether to render* a `Checkbox` at all, not in the primitive itself.

## Risk-Driven Strategy: Safety Logic Lives Below the UI, Not In It

The single biggest architectural risk in this system is a UI bug that makes an unsafe action reachable (a keeper gets deleted, a locked Android row gets bulk-selected, a real delete fires without confirmation). The spec's acceptance checklist (§12) is essentially a list of "this must be structurally impossible, not just usually prevented" assertions.

Strategy: push every one of these invariants down to a layer *below* the component tree, where it can be unit-tested without rendering anything:

- Keeper-has-no-checkbox (C-8) is enforced by **the duplicate-group data model itself** — `duplicateEngine.ts` output marks each record's role (`keeper` | `candidate`), and `DuplicateGroupCard.tsx` maps `role === 'keeper'` to *not rendering* a `Checkbox` component at all, rather than rendering one conditionally disabled. Tested via RTL: assert `queryByRole('checkbox')` returns null for keeper rows, not `toBeDisabled()`.
- Wipe-risk lock (C-9) and simulation-gate (C-7) are enforced as **Zustand store actions that no-op on invalid transitions** (ADR-004) — e.g. `selectCandidate(id)` checks the device's lock status before mutating selection state, so even a UI bug that renders a checkbox for a locked row can't produce a selected-and-deletable state.
- The **duplicate detection acceptance criteria** (junk-serial exclusion, Luhn validation, cross-platform opt-in, group-size ceiling, "too close to call") are entirely inside `duplicateEngine.ts`, tested with the five fixture cases the spec names in §10, with zero UI involvement — a failure here is a pure-function test failure, not something that only surfaces in manual QA.

This is the solution-strategy-level answer to Q-1 (deletion is deliberate): deliberateness is a property of the data flow, enforced at multiple independent layers (data model → store → component), not a single UI gate that a future refactor could accidentally bypass.

## Testing Strategy Addendum

Spec §10 calls out `duplicateEngine.test.ts` explicitly. This strategy adds two more required test surfaces, both flagged as gaps during architecture review:

1. **`api/graphClient.test.ts`** (MSW-mocked) — pagination-follows-nextLink-only, 429-honors-Retry-After, OS-filter-fallback-and-status-line-accuracy. These are exact-behavior requirements (C-4, C-5) as testable and as safety-relevant as the duplicate engine, just not named in the spec's own test list.
2. **Store-level invariant tests** (`store/appStore.test.ts` or feature-colocated) — the no-op-on-invalid-transition assertions described above (locked-row selection attempt, keeper selection attempt, real-delete-without-typed-confirmation attempt).

## Sources

- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/constraints-and-context.md` — constraints this strategy satisfies
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/structural-views/container.md` — resulting container view
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/structural-views/components.md` — resulting component view
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/architecture-decisions/` — ADR-001 through ADR-006
