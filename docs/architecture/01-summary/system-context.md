# System Context (C4 Level 1)

```mermaid
flowchart LR
    admin(["Admin (IT staff)\nSigns in with work account"])

    subgraph sys["Intune Duplicate Device Cleanup\n(this system — browser SPA, no backend)"]
        app["Duplicate Device Cleanup App"]
    end

    entra[("Microsoft Entra ID\nDelegated OAuth2 auth")]
    graph[("Microsoft Graph API\nIntune managed devices")]
    csv(["CSV file\n(local download — audit log export)"])

    admin -->|"signs in, reviews duplicates,\nconfirms deletions"| app
    app -->|"authenticates (MSAL)"| entra
    app -->|"reads device inventory,\ndeletes confirmed duplicates"| graph
    app -->|"exports"| csv

    style app fill:#1F6F5C,color:#fff
    style entra fill:#EEF0F3,color:#1B2A38,stroke:#C7CFD8
    style graph fill:#EEF0F3,color:#1B2A38,stroke:#C7CFD8
```

## System Boundary

**In scope**: a single-page web application that an IT admin loads in a browser, signs into with a Microsoft work account, and uses to browse/detect/delete duplicate Intune device records — entirely client-side, no server component of any kind (see ADR-001, constraint C-1).

**Out of scope** (spec §11 — explicit non-goals):
- No backend server or database
- No editing of device records (read + delete only)
- No handling of the Entra device object or Autopilot registration lifecycle — this touches `deviceManagement/managedDevices` only
- No automatic/scheduled deletion — every delete is a manual, admin-confirmed action

## External Actors

| Actor | Relationship |
|---|---|
| **Admin (IT staff)** | Primary human user. Signs in with a Microsoft work account holding (or able to be granted) the two delegated Graph permissions. |
| **Microsoft Entra ID** | Identity provider. Must have an app registration of type **Single-page application** (not "Web" — constraint C-3, a documented common wrong turn) with a redirect URI matching the app's serving origin exactly. |
| **Microsoft Graph API** | Data source and mutation target — `deviceManagement/managedDevices` endpoint, `v1.0`. Delegated auth only; the app never holds application-level Graph credentials. |
| **CSV file (local download)** | Output artifact — the audit log export, saved to the admin's own machine, not transmitted anywhere. |

## Prerequisite (owned by the admin, not the build)

Before this app can authenticate at all, the Entra app registration must exist with the SPA platform type, correct redirect URI, and both `DeviceManagementManagedDevices.Read.All` and `...ReadWrite.All` delegated permissions with admin consent granted. See `constraints-and-context.md` C-2, C-3.

## Sources

- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/01-summary/quality-tree.md` — quality goals this boundary must satisfy
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/structural-views/container.md` — one level deeper: containers inside this boundary
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/constraints-and-context.md` — full constraint list (C-1 through C-12)
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/architecture-decisions/ADR-001-vite-spa-no-backend.md` — why this boundary has zero server components
