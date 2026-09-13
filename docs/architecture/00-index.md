# Intune Duplicate Device Cleanup — Architecture

**Status:** Design complete, ready for `builder` handoff. Scaffold in place (Vite + React + TS + full stack deps installed, git initialized).

**Methodology:** C4 (structural views) + ADRs (decision rationale) + arc42 (constraints and context), per the technical-architect profile's standard mandate.

**Repo:** `/home/shadow007/dev/IT-Together/duplicate-device-cleanup` (git initialized, commit `ee905af` — scaffold only, no application code yet)

---

## L1 — Summary (start here)

| File | Contents |
|---|---|
| [01-summary/system-context.md](01-summary/system-context.md) | C4 Level 1 — system boundary, external actors (admin, Entra ID, Graph API), what's in/out of scope |
| [01-summary/quality-tree.md](01-summary/quality-tree.md) | arc42 Canvas — top 5 quality goals ranked, stakeholders, design tokens |
| [01-summary/adr-index.md](01-summary/adr-index.md) | Navigation index of all 6 ADRs with status |

## L2 — Analysis (the substantive design)

| File | Contents |
|---|---|
| [02-analysis/constraints-and-context.md](02-analysis/constraints-and-context.md) | arc42 §1-2 — full quality goal scenarios, stakeholders, and 12 numbered constraints (C-1..C-12) each traced to spec section and satisfying artifact |
| [02-analysis/solution-strategy.md](02-analysis/solution-strategy.md) | arc42 §4 — technology decision summary table, decomposition approach, the "safety logic lives below the UI" risk-driven strategy, testing strategy addendum |
| [02-analysis/structural-views/container.md](02-analysis/structural-views/container.md) | C4 Level 2 — the one-container system boundary (SPA + sessionStorage) and its interactions with Entra ID / Graph |
| [02-analysis/structural-views/components.md](02-analysis/structural-views/components.md) | C4 Level 3 — full internal component breakdown, each mapped to the constraint it satisfies and the ADR that explains it |
| [02-analysis/architecture-decisions/](02-analysis/architecture-decisions/) | 6 ADRs — see index above |

## L3 — Dossiers (pull on demand)

| File | Contents |
|---|---|
| [03-dossiers/code-level-detail.md](03-dossiers/code-level-detail.md) | C4 Level 4 — full project file tree as implemented, required `duplicateEngine.ts` fixture case list (5 spec-named + 4 architect-added), superseded-scaffold note |

---

## What Changed From the Spec (build.md) During Review

The user-supplied `build.md` is a strong, detailed spec — the review below is additive, not corrective. One item was a **blocking conflict** requiring a decision before any code could be written; the rest are gaps folded into the design as architect calls, each documented as an ADR.

| # | Gap | Resolution | ADR |
|---|---|---|---|
| 1 | **Blocking**: project had been scaffolded as Next.js before spec review; spec mandates Vite SPA, no backend | User confirmed: wipe and rebuild as Vite. Done — commit `ee905af`. | ADR-001 |
| 2 | MSAL token cache location unspecified | `sessionStorage` — read-only-on-restart safety property | ADR-002 |
| 3 | Graph client library unspecified (SDK vs raw) | Raw `fetch` — exact control over required non-default retry/pagination/fallback semantics | ADR-003 |
| 4 | State library left as "admin's choice" (Context or Zustand) | Zustand, with server/client state boundary vs. React Query made explicit | ADR-004 |
| 5 | Audit log persistence not specified beyond "in-memory" | `sessionStorage` mirror — survives accidental reload within a session without exceeding the no-backend/no-database boundary | ADR-005 |
| 6 | No behavior specified for declined/failed write-scope consent | Abort delete, force simulation back on, distinct error state, badge never optimistically flips | ADR-006 |
| 7 | Test coverage named only `duplicateEngine.ts` (spec §10) | Added `graphClient.test.ts` (pagination/429/fallback) and store-level invariant tests to the required test surface | solution-strategy.md |
| 8 | Color-only risk signaling risk (spec says "never decorative" but doesn't mandate redundant cue) | Added requirement: every color-coded state gets a redundant text/icon cue | quality-tree.md |
| 9 | Graph `DELETE` success vs. confirmed on-device wipe/retire completion conflation risk | Noted for QA: `DELETE` 204 means the Intune record is gone, not that the device has confirmed the wipe/retire — async on Microsoft's side | constraints-and-context.md (Q-2 context) |

## Next Steps

1. Commit `build.md` itself into the repo at `docs/build.md` as the spec of record (currently only exists in this conversation).
2. Route implementation to `builder` via a Kanban task, with this `00-index.md` path as the design handoff — builder should read L2 (constraints, solution-strategy, container/components, all 6 ADRs) before writing code, and L3 fixture list before writing `duplicateEngine.test.ts`.
3. Route the Entra app registration prerequisite (C-2, C-3) back to the user/tenant admin — this is explicitly "done by the admin, not by the build" per spec §3, and nothing in the SPA can be tested end-to-end against real Graph data without it. A mock-Graph (MSW) dev/test path does not require this and can proceed in parallel.
4. `qa` gate: acceptance checklist (spec §12) plus the two review-added test surfaces (graphClient, store invariants) as explicit pass criteria before this ships.

## Sources

- All files linked above, each carrying its own SOURCES section for further cross-referencing
- User-supplied `build.md` — original functional spec, full text captured in this conversation; recommend committing to `docs/build.md` in-repo (see Next Steps #1)
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup` — the scaffolded repository this design applies to
