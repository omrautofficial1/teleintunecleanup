# Intune duplicate device cleanup — React app build spec

This document is a complete implementation brief for building a React web application that signs in to Microsoft Entra ID, pulls the full Intune managed-device inventory via Microsoft Graph, detects duplicate device records, and lets an admin manually review and delete the stale half of each duplicate pair. It is written to be handed directly to an AI coding agent as the spec to build from.

## 1. What this app does

- Sign in with a Microsoft work account (delegated auth, no backend server).
- Fetch every managed device record from Intune, handling Graph pagination and throttling.
- Show all devices in a data table with server-independent pagination, sorting, and filtering (by OS, management state, compliance state, owner type, enrollment type, and a free-text search).
- Detect duplicate devices by matching Serial Number, IMEI, and MEID, and flag which record in each group is the one to keep.
- Let the admin manually select records to delete — nothing is deleted automatically.
- Warn clearly before any delete that would trigger a factory reset (corporate-owned Android), versus one that only retires the MDM record.
- Run in simulation mode by default; a real delete requires explicitly turning simulation off and typing a confirmation phrase.
- Export a CSV audit log of every action taken (or simulated).

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | React 18 + TypeScript, built with Vite | Fast dev server, no backend needed for a pure SPA |
| Auth | @azure/msal-browser + @azure/msal-react | Standard Microsoft-supported libraries for SPA auth; installed via npm, so there is no CDN dependency at runtime (unlike a raw HTML prototype) |
| Data fetching / caching | @tanstack/react-query | Handles the fetch-all-pages flow, retry/backoff, and caching the inventory in memory between screens |
| Table | @tanstack/react-table (headless) | Gives pagination, sorting, and column filtering without dictating markup, so it can be styled to spec |
| Styling | Tailwind CSS with the design tokens in §9.4 | Utility classes keep the safety-critical states (locked, destructive, keeper) visually consistent |
| State for selection | React Context or Zustand, admin's choice | Only needs to hold current filters, selected row IDs, and simulation toggle |
| Testing | Vitest + React Testing Library | Unit-test the duplicate-detection engine and the safeguard logic in isolation from the UI |

Do not add a backend. All Graph calls happen directly from the browser using the signed-in user's delegated token.

## 3. Prerequisites (done by the admin, not by the build)

Before the app can authenticate, an Entra app registration must exist with:

- Platform type Single-page application (not "Web" — this is a common wrong turn and MSAL will fail silently against a Web platform redirect URI).
- Redirect URI matching the exact origin the app will be served from (e.g. http://localhost:5173 for local dev, the real HTTPS domain in production). file:// will never work.
- Delegated API permissions: DeviceManagementManagedDevices.Read.All and DeviceManagementManagedDevices.ReadWrite.All, both granted admin consent.

The app should read the client ID, tenant ID, and redirect URI from environment variables, and should render a clear setup screen (with the exact redirect URI it's using) if auth fails, rather than a generic error.

## 4. Environment configuration

```
VITE_MSAL_CLIENT_ID=<app registration client id>
VITE_MSAL_TENANT_ID=<tenant id or verified domain>
VITE_MSAL_REDIRECT_URI=<must exactly match the SPA redirect URI in Entra>
```

## 5. Authentication

- Request only DeviceManagementManagedDevices.Read.All at initial sign-in. The app must be fully usable — browse, filter, detect duplicates — on read-only consent alone.
- Request DeviceManagementManagedDevices.ReadWrite.All via incremental consent only at the moment the admin confirms a real (non-simulated) deletion. Show a badge in the header that changes from "Read-only" to "Read and write" once write consent is granted, so the admin always knows the app's current capability.
- Use popup login by default, falling back to redirect login if the popup is blocked (detect via MSAL's BrowserAuthError).
- On 401/InteractionRequiredAuthError from any Graph call, trigger silent token refresh first, then interactive login only if silent refresh fails.

## 6. Data layer — fetching devices from Graph

Endpoint: `GET https://graph.microsoft.com/v1.0/deviceManagement/managedDevices`

Fields to select: `id,deviceName,serialNumber,imei,meid,operatingSystem,osVersion,manufacturer,model,lastSyncDateTime,enrolledDateTime,complianceState,managementAgent,managedDeviceOwnerType,deviceEnrollmentType,managementState,azureADDeviceId,userPrincipalName`

Rules the fetch layer must follow:

- `$top=999` per page, and follow `@odata.nextLink` verbatim until it is absent. Never reconstruct pagination with a manually built `$skip`.
- `managementState eq 'managed'` is a supported server-side filter and can be applied at fetch time behind a toggle ("include non-managed states" should be off by default, but available — a record stuck in retirePending or wipeFailed is often exactly the stale half of a duplicate pair).
- `operatingSystem eq '...'` is not documented as filterable and sometimes returns a 400. The fetch layer must try it once; on failure, fall back to pulling the full set and filtering client-side, and surface which path was used in a small status line so the admin isn't confused by silent behavior changes.
- On a 429 response, read the Retry-After header and wait that long before retrying. Do not retry immediately or with a fixed backoff.
- Fetch the entire inventory into memory before running duplicate detection — detection requires comparing every record against every other record, not just the current page. Cache the result with React Query and show a progress indicator ("Fetched 2,400 of ~4,900...") since this can take a while on large tenants.
- Provide a manual "Refresh inventory" action; do not silently re-fetch on every navigation.

## 7. Duplicate detection logic

This is the core logic and should be a pure, independently testable module (duplicateEngine.ts) with no React or Graph dependencies, so it can be unit-tested against fixture data.

### 7.1 Identifier normalization

- Serial number: trim and uppercase. Treat as junk (excluded from matching entirely, not grouped) if it matches any of: DEFAULT STRING, SYSTEM SERIAL NUMBER, TO BE FILLED BY O.E.M., all-zero strings, or any value under 5 characters after trimming.
- IMEI: strip all non-digit characters, require exactly 15 digits, then validate with a Luhn checksum. Reject and exclude from matching if the check fails — malformed IMEIs in Intune are common and will otherwise link unrelated devices.
- MEID: normalize the same way as IMEI where applicable (some Verizon/CDMA devices report MEID instead of IMEI).

### 7.2 Grouping

- Use a union-find (disjoint-set) structure over the three normalized identifiers. Two records are linked if they share a valid serial, IMEI, or MEID. This correctly merges a pair that matches on serial with a third record that only matches one of them on IMEI into a single group, rather than reporting overlapping groups.
- By default, only link records that report the same operatingSystem. Provide a togglable "match across platforms" option, off by default — a same-serial match between two different platforms is far more likely to be a collision (e.g. VM template serials) than a genuine duplicate, and should require the admin to opt in to seeing it.
- Record which identifier(s) caused each link (matchedOn: 'serial' | 'imei' | 'meid') so the UI can show why a group was formed.

### 7.3 Keeper selection within a group

For each duplicate group, apply in order:

1. The record with the most recent lastSyncDateTime is the candidate keeper.
2. Lead requirement: the candidate keeper must be at least 24 hours newer than the next-most-recent record in the group. If the gap is smaller, do not auto-select a keeper — flag the group as "too close to call" for manual review instead. This prevents clock skew or near-simultaneous check-ins from producing a confident-looking wrong answer.
3. Staleness floor: a losing record must not have synced within the last 30 days (configurable). A record that checked in last week should not be deleted just because its sibling checked in yesterday.
4. Tie-breaks, applied in order, if two records have identical lastSyncDateTime: earlier enrolledDateTime loses; if still tied, non-compliant loses; if still tied, lower id (lexicographically) is kept for determinism.
5. Group size ceiling: if a group has more than 5 records (configurable), do not select a keeper or mark anything for deletion — report the group only. A group this large is almost always a shared junk identifier, not a real duplicate chain.

### 7.4 Warnings surfaced but not blocking

Flag these on a group without preventing review, since they're legitimate cases that look like duplicates but need a human judgment call:

- Same physical device appearing twice with different managementAgent values (co-management).
- Records with deviceEnrollmentType suggesting an in-progress re-enrollment.
- Any group where every record is well within the staleness floor (nothing is actually stale yet).

## 8. Deletion safety rules

These are non-negotiable UI and logic constraints, not suggestions:

- Simulation is the default state on every screen. The delete action button reads "Simulate removal of N records" while simulation is on, and issues zero Graph calls. Turning it off requires an explicit toggle, and confirming a real deletion requires typing DELETE into a text field before the button activates.
- Keeper rows have no checkbox at all — not disabled, absent from the DOM. There must be no interaction path in the UI that can select a group's keeper for deletion.
- Corporate-owned Android is locked by default. managedDeviceOwnerType of company-owned combined with an enrollment type indicating fully managed, dedicated, COPE, or AOSP means DELETE triggers a factory reset, not a retire. These rows render with the amber "wipe" styling, their checkboxes are disabled, and a "select all stale" bulk action must skip them — until the admin explicitly checks a separate "I understand this will factory-reset these devices" acknowledgment for the session.
- Every bulk selection action must state the consequence split, e.g. "12 records will retire, 3 will factory reset," before the confirm dialog appears.
- Deletions execute sequentially (not batched), with a live per-row status (pending → deleting → done/failed) so a partial failure part-way through a large selection is visible immediately rather than discovered afterward.
- After each successful delete, write a row to an in-memory audit log (device name, serial, IMEI, matched-on, previous last-sync, action taken, timestamp, simulated or real) and offer a "download CSV" of the full log at any time.
- Respect the tenant-wide cap of 1,000 delete actions per day (cumulative across the portal, bulk actions, and Graph). Warn the admin if a single session's selections would approach this, though the app cannot know how many delete actions have already happened elsewhere that day.

## 9. UI requirements

### 9.1 Screens / flow

- Sign-in — Microsoft sign-in button, read-only scope only. Shows a setup panel with the exact redirect URI if the app detects it's being served from an unsupported origin (e.g. file://).
- Inventory — the full device table: pagination, sorting, filtering, free-text search, a "Refresh inventory" button, and a visible fetch-progress state while loading.
- Duplicates — the inventory reduced to only records that are part of a detected group, organized by group, keeper anchored above its candidates, with the matched-on identifier and any warnings shown per group.
- Review & delete — the selection and confirmation flow described in §8, reachable from the Duplicates screen.
- Audit log — the running list of actions this session, with CSV export.

### 9.2 Device table — pagination and filtering

- Client-side pagination over the full fetched inventory (page size selector: 25/50/100/250), since the whole set is already in memory after the initial fetch.
- Column sort on any column, particularly lastSyncDateTime and deviceName.
- Filter controls: multi-select on operatingSystem, multi-select on managementState, multi-select on managedDeviceOwnerType, a compliance toggle, and a free-text search across deviceName, serialNumber, userPrincipalName.
- A persistent filter chip, "Duplicates only", that switches the table to just the flagged records without leaving the inventory screen.
- Filters apply before duplicate detection is displayed but detection itself always runs against the complete unfiltered inventory — filtering the view must never change which records are considered part of a duplicate group.

### 9.3 Duplicate review and selection

- Each group is a card: shared identifier displayed largest and in monospace, keeper row on top with a green accent and no checkbox, candidate rows indented below a left rule with their own checkboxes.
- "Select all stale" selects every candidate that clears the staleness floor and is not locked for wipe risk, across all visible groups, in one click.
- Groups exceeding the size ceiling or flagged "too close to call" render with a neutral/gray state and no selectable checkboxes at all — report-only, visually distinct from actionable groups.

### 9.4 Design tokens

| Token | Value | Use |
|---|---|---|
| Background | #EEF0F3 | Page background |
| Surface | #FFFFFF | Cards, table |
| Ink | #1B2A38 | Primary text |
| Hairline | #C7CFD8 | Borders, dividers |
| Delete red | #A81E1E | Destructive actions, retire-risk accents |
| Wipe amber | #B4610A | Corporate Android / factory-reset warnings |
| Keeper green | #1F6F5C | The retained record in a group |

Typeface: IBM Plex Sans throughout. IBM Plex Mono reserved specifically for serial numbers and IMEIs — comparing long numeric strings by eye is a core task in this app, and tabular figures make that legible.

Color is only ever used as a risk/status signal, never decoratively.

## 10. Project structure

```
src/
  main.tsx
  app/
    App.tsx
  auth/
    msalConfig.ts
    AuthProvider.tsx
    useAuth.ts
  api/
    graphClient.ts
    devices.ts
    types.ts
  features/
    devices/
      DeviceTable.tsx
      DeviceFilters.tsx
      columns.ts
      useDevices.ts
    duplicates/
      duplicateEngine.ts
      duplicateEngine.test.ts
      DuplicateGroupCard.tsx
      DuplicateGroupList.tsx
      useDuplicates.ts
    deletion/
      DeletionConfirmDialog.tsx
      useDeleteDevices.ts
      auditLog.ts
    audit/
      AuditLogView.tsx
  components/
    ui/
      Button.tsx
      Badge.tsx
      Checkbox.tsx
      Modal.tsx
      Table.tsx
  styles/
    tokens.css
```

duplicateEngine.ts must have no imports from api/ or React — it takes an array of normalized device records and returns groups, so it can be tested with static fixture data covering: a genuine pair, a junk-serial cluster, a same-serial-different-OS pair, a group over the size ceiling, and a pair too close in check-in time to call.

## 11. Non-goals (explicitly out of scope for this build)

- No backend server or database — the app is a pure SPA, and the browser's Graph token is the only credential in play.
- No editing of device records. This app only reads and deletes; it does not modify any device property.
- No handling of the Entra device object or Autopilot registration — this app only touches deviceManagement/managedDevices. Deleting an Intune record does not remove the corresponding Entra device object or Autopilot registration, and those lifecycles are a separate project.
- No automatic/scheduled deletion. Every deletion in this app is a manual, admin-confirmed action in the moment.

## 12. Acceptance checklist

- [ ] App is fully usable (browse, filter, detect duplicates) on read-only consent alone
- [ ] Write scope is requested only at first real-delete confirmation, and the header badge reflects current consent
- [ ] Pagination follows @odata.nextLink correctly and does not drop or duplicate records across pages
- [ ] A 429 response is retried after honoring Retry-After, not immediately
- [ ] Junk serials (blocklist above) are excluded from grouping, not grouped together
- [ ] IMEIs that fail Luhn validation are excluded from grouping
- [ ] A group linked only by IMEI across two different serials is correctly merged into one group
- [ ] Cross-platform matches are hidden unless the admin opts in
- [ ] Keeper rows have no checkbox in the rendered DOM
- [ ] Corporate-owned Android rows are locked until the explicit acknowledgment is checked, and "select all stale" skips them
- [ ] Simulation mode issues zero Graph calls and is on by default
- [ ] A real delete requires simulation off and typing DELETE
- [ ] Every action (simulated or real) appears in the exportable audit log
- [ ] duplicateEngine.ts has unit tests covering all five fixture cases in §10

---

See `docs/architecture/00-index.md` for the full architecture design (C4 + ADRs + arc42) built against this spec, including gaps identified and resolved during architecture review.
