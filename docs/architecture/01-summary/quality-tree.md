# Quality Tree (arc42 Canvas)

## Top Quality Goals (ranked)

1. **Deletion is deliberate, never accidental** (Q-1) — the reason this whole app exists is to delete infrastructure records safely; this is the dominant design pressure on every screen.
2. **Every real action is durably auditable** (Q-2) — supports the admin's reporting relationship to their "senior" and gives a recovery trail if something goes wrong.
3. **Fetch/detection behavior is transparent, not silently magic** (Q-3) — admins act on what the app tells them; silent fallback behavior (OS filter, pagination) must be visible, not hidden.
4. **Least-privilege by default** (Q-4) — read-only until the exact moment write capability is needed, dropped again at session end.
5. **Usable without write access** (Q-5) — triage and review workflows don't require escalation at all.

## Key Stakeholders

- **IT admin** — primary user, owns the workflow end to end
- **Admin's "senior"/manager** — consumer of the audit-log reporting artifact
- **Tenant end users** — never interact with the app, but bear the consequence of a wrong corporate-Android delete (factory reset)
- **Entra tenant admin** — owns the prerequisite app registration and admin consent

## Design Tokens (spec §9.4 — direct transcription, non-negotiable)

| Token | Value | Use |
|---|---|---|
| Background | `#EEF0F3` | Page background |
| Surface | `#FFFFFF` | Cards, table |
| Ink | `#1B2A38` | Primary text |
| Hairline | `#C7CFD8` | Borders, dividers |
| Delete red | `#A81E1E` | Destructive actions, retire-risk |
| Wipe amber | `#B4610A` | Corporate Android / factory-reset warnings |
| Keeper green | `#1F6F5C` | Retained record in a group |

Typeface: IBM Plex Sans (UI), IBM Plex Mono (serials/IMEIs only — tabular figures for eyeball comparison). Color is a risk/status signal only, never decorative — every color-coded state needs a redundant text/icon cue (accessibility gap identified during architecture review, not explicit in spec).

## Sources

- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/constraints-and-context.md` — full quality goal detail with scenarios
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/01-summary/system-context.md` — system boundary these goals apply to
