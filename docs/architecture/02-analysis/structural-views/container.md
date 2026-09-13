# Container View (C4 Level 2)

```mermaid
flowchart TB
    admin["Admin (IT staff)"]

    subgraph browser["Browser — single origin, no server"]
        spa["SPA Container\nReact 19 + TypeScript + Vite\nStatic bundle served from one origin"]
        sessionstore["sessionStorage\nMSAL token cache (ADR-002)\nAudit log mirror (ADR-005)"]
        spa <-->|read/write| sessionstore
    end

    entra["Microsoft Entra ID\nOAuth2 delegated auth\nSPA app registration"]
    graph["Microsoft Graph API\ndeviceManagement/managedDevices\nv1.0"]

    admin -->|"uses (HTTPS)"| spa
    spa -->|"MSAL popup/redirect login,\nsilent token refresh"| entra
    spa -->|"GET (paginated), DELETE\nBearer token, delegated scopes"| graph
    entra -.->|"issues access token\n(scoped per consent state)"| spa

    style spa fill:#1F6F5C,color:#fff
    style entra fill:#EEF0F3,color:#1B2A38
    style graph fill:#EEF0F3,color:#1B2A38
    style sessionstore fill:#C7CFD8,color:#1B2A38
```

## Containers

| Container | Responsibility | Tech | ADR |
|---|---|---|---|
| **SPA** | The entire application — everything except identity and data lives here | React 19, TypeScript, Vite, Tailwind CSS | ADR-001 |
| **sessionStorage** | Browser-native storage, not a separate deployable — token cache and audit-log-reload-survival mirror | Browser Web Storage API | ADR-002, ADR-005 |

There is exactly one deployable container (C-1: no backend). Entra ID and Microsoft Graph are external systems the SPA depends on, not containers this project owns or deploys.

## Key Interactions

1. **Sign-in**: Admin → SPA triggers MSAL popup (fallback: redirect) → Entra ID → returns delegated token scoped to `DeviceManagementManagedDevices.Read.All` only.
2. **Inventory fetch**: SPA → Graph `GET /deviceManagement/managedDevices` with `$top=999`, following `@odata.nextLink` until exhausted (ADR-003), token attached via MSAL silent acquisition.
3. **Incremental consent**: At first real-delete confirmation, SPA → Entra ID requests additional `DeviceManagementManagedDevices.ReadWrite.All` scope via MSAL incremental consent (popup). Declined/failed → ADR-006 fallback (abort, revert to simulation).
4. **Delete execution**: SPA → Graph `DELETE /deviceManagement/managedDevices/{id}`, one at a time, sequential (C-10), with the write-scoped token.
5. **Token refresh**: Any 401/`InteractionRequiredAuthError` from Graph → SPA attempts `acquireTokenSilent` first; only escalates to interactive login if silent refresh fails.

## Sources

- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/01-summary/system-context.md` — the enclosing system-context view (external actors, boundary)
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/structural-views/components.md` — internal decomposition of the SPA container
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/architecture-decisions/ADR-001-vite-spa-no-backend.md`
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/architecture-decisions/ADR-002-msal-token-cache-sessionstorage.md`
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/architecture-decisions/ADR-003-raw-fetch-graph-client.md`
