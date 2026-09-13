# Constraints and Context (arc42 §1-2)

## 1. Introduction and Goals

### 1.1 Requirements Overview

An admin-facing web tool to find and clean up duplicate Intune-managed device records (Microsoft Graph `deviceManagement/managedDevices`), matching on serial number, IMEI, and MEID. The admin reviews detected duplicate groups, manually selects the stale record(s) to delete, and the app executes the deletion via Graph — with simulation mode as the safe default and multiple layers of guardrails against accidental or bulk-blind destructive action.

Full functional spec: user-supplied `build.md` (referenced throughout this pyramid as "the spec").

### 1.2 Quality Goals (Top 5, Prioritized)

| # | Quality Goal | Motivation | Scenario |
|---|---|---|---|
| Q-1 | **Deletion is deliberate, never accidental** | The core risk of this app: it exists specifically to delete infrastructure records, some of which (corporate Android) trigger a physical factory reset. A false-positive or fat-fingered delete has real device-management consequences, not just a data-cleanliness annoyance. | Admin selects a row, clicks "delete" — nothing happens until simulation is off AND "DELETE" is typed AND (if wipe-risk) the acknowledgment checkbox is checked. |
| Q-2 | **Every real action is durably auditable** | If something goes wrong, the admin (and their "senior"/manager, per this tenant's reporting structure) needs a reliable record of exactly what was deleted, why the tool considered it a duplicate, and when. | After a real delete run, CSV export reflects every row deleted even if the tab was accidentally reloaded mid-session. |
| Q-3 | **Fetch/detection behavior is transparent, not silently magic** | Admins are making irreversible decisions based on what the app tells them is a duplicate. If the app silently falls back to a different filter strategy, or silently drops paginated records, the admin's mental model of "what am I looking at" breaks without their knowledge. | Status line always shows whether the OS filter ran server-side or client-side-fallback; progress indicator shows page-by-page fetch count. |
| Q-4 | **Least-privilege by default** | The app should never hold more capability than the current task needs. | App starts read-only; write scope is requested only at the moment of first real-delete confirmation, and is dropped entirely when the session ends. |
| Q-5 | **Usable without write access** | Read-only admins, or admins just triaging (not yet ready to delete), get full value from the tool. | Browsing, filtering, and duplicate detection work completely on read-only consent; only the delete action itself requires escalation. |

### 1.3 Stakeholders

| Role | Concern |
|---|---|
| IT admin (primary user) | Needs to clean up Intune device inventory without accidentally wiping a live corporate device or losing track of what was deleted. |
| Admin's "senior" / manager | Receives reports of findings/actions — the audit log (§8 of spec) is the artifact that supports this reporting relationship. |
| Tenant end users (device owners) | Indirectly affected — a wrong delete on a corporate-owned Android factory-resets their device. Never directly interacts with the app. |
| Entra tenant admin (may be same person as IT admin) | Owns the app registration, grants admin consent for the two delegated Graph scopes. |

## 2. Constraints

| ID | Constraint | Source | Realized By |
|---|---|---|---|
| C-1 | No backend server or database; browser's delegated Graph token is the only credential in play | spec §2, §11 | ADR-001 (Vite SPA); [system-context.md](../../01-summary/system-context.md) |
| C-2 | Must use `@azure/msal-browser` + `@azure/msal-react` for auth (Microsoft-supported, no CDN dependency) | spec §2 | ADR-002; [components.md](structural-views/components.md) Auth component |
| C-3 | Entra app registration must be type "Single-page application," not "Web" | spec §3 | [system-context.md](../../01-summary/system-context.md) — external actor note |
| C-4 | Pagination must follow `@odata.nextLink` verbatim, never reconstruct with `$skip` | spec §6 | ADR-003 |
| C-5 | 429 responses must wait exactly `Retry-After`, not fixed/exponential backoff | spec §6 | ADR-003 |
| C-6 | Duplicate detection engine (`duplicateEngine.ts`) must have zero imports from `api/` or React — pure, independently testable | spec §7, §10 | [components.md](structural-views/components.md) Duplicate Detection component |
| C-7 | Simulation mode is the default on every screen; real delete requires simulation off + typed "DELETE" | spec §8 | ADR-006; [components.md](structural-views/components.md) Deletion component |
| C-8 | Keeper rows must have no checkbox in the rendered DOM — not disabled, absent | spec §8, §9.3, §12 | [components.md](structural-views/components.md) Duplicate Review UI |
| C-9 | Corporate-owned Android rows locked until explicit per-session acknowledgment; "select all stale" must skip them | spec §8 | ADR-004 (store-level enforcement); [components.md](structural-views/components.md) |
| C-10 | Deletions execute sequentially with live per-row status, not batched | spec §8 | [components.md](structural-views/components.md) Deletion component |
| C-11 | Design tokens (colors, IBM Plex Sans/Mono) must be used as specified; color is never decorative | spec §9.4 | Tailwind config + `styles/tokens.css` — implementation detail, not an ADR (no tradeoff, direct spec transcription) |
| C-12 | Tenant-wide cap of 1,000 delete actions/day must be warned against (app can't know cross-session count) | spec §8 | [components.md](structural-views/components.md) Deletion component — session-local counter + warning threshold |

## Sources

- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/01-summary/quality-tree.md` — condensed quality goal summary
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/solution-strategy.md` — how these constraints shape the solution approach
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/architecture-decisions/` — ADR-001 through ADR-006
- User-supplied `build.md` — original functional spec (full text in task conversation, not separately filed — recommend committing it to `docs/build.md` in the repo as the canonical spec of record)
