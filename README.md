# Telestar — Intune Device Cleanup

> Rebrand of the original `duplicateintunecleanuptool` for internal Telestar use.
> **Brand colors/logo in this build are provisional** — inferred from the
> public telestar.com.au site, not an internal brand guide. Swap the four
> `--color-brand-*` values in `src/styles/tokens.css` and the mark in
> `src/components/ui/BrandMark.tsx` once the real assets are available.
>
> Phase 1 security/QA audit findings and fixes: see `docs/phase1-security-qa-audit.md`.
> No custom backend/API was added — this remains a client-only SPA calling
> only Microsoft Graph and Entra ID, per the "no API endpoints without
> permission" instruction this rebrand was done under.

# API Permissions
<img width="1458" height="396" alt="image" src="https://github.com/user-attachments/assets/5787d739-714d-45c1-8129-97d0acee3d4f" />



# Intune Duplicate Device Cleanup

A client-only React SPA that signs in to Microsoft Entra ID, pulls the full
Intune managed-device inventory via Microsoft Graph, detects duplicate
device records, and lets an admin manually review and delete the stale half
of each duplicate pair — with simulation mode as the safe default.

Full functional spec: `docs/build.md`. Full architecture (C4 + ADRs + arc42):
`docs/architecture/00-index.md`.

## Setup

```
npm install
cp .env.example .env   # fill in VITE_MSAL_CLIENT_ID / TENANT_ID / REDIRECT_URI
npm run dev
```

The Entra app registration (type: Single-page application) is a
prerequisite owned by the tenant admin — see
`docs/architecture/02-analysis/constraints-and-context.md` (C-2, C-3). The
app is fully usable in dev/test against MSW-mocked Graph responses without
real MSAL env vars.

**Redirect URI must match exactly.** The redirect URI registered on the
Entra SPA app registration and `VITE_MSAL_REDIRECT_URI` must be
byte-identical — including scheme, host, port, and trailing slash (e.g.
`http://localhost:5173` vs `http://localhost:5173/` are different URIs to
Entra). A mismatch here is the single most common MSAL setup failure; it
surfaces as Entra rejecting the redirect (`AADSTS50011`) before the app
even gets a chance to run.

The Audit log screen has two sources: the browser session log (always
available and downloadable as CSV) and Microsoft Intune audit history. To load
the latter, grant the delegated Microsoft Graph permission
`DeviceManagementApps.Read.All`, then sign in again so MSAL can acquire a token
containing the new scope. Adding the permission in Entra is not enough for an
already-issued token.
**Two redirect URIs are required, both as SPA platform type:**
1. `VITE_MSAL_REDIRECT_URI` (the app root, e.g. `http://localhost:5173`)
   — used by the `loginRedirect()` full-page fallback.
2. `VITE_MSAL_REDIRECT_URI` + `/auth-popup.html` (e.g.
   `http://localhost:5173/auth-popup.html`) — used by
   `loginPopup()`/`acquireTokenPopup()`. This must point at the static
   `public/auth-popup.html` file, *not* the app root: MSAL's popup flow
   navigates the popup window to the redirect URI and then relies on the
   *opener* polling `popupWindow.location.href` to detect completion and
   close the popup — it does not need any JS to run inside the popup.
   Pointing the popup at the app root instead makes the popup boot the
   full React app (a real race against the opener's poll, and losable in
   an unminified dev build), which is exactly the bug this second
   redirect URI avoids.

## Scripts

- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build`
- `npm run test` — Vitest (unit + component tests, MSW-mocked Graph calls)
- `npm run lint` — oxlint

## Key modules

- `src/features/duplicates/duplicateEngine.ts` — pure duplicate-detection
  engine (C-6: zero React/api imports). See
  `duplicateEngine.test.ts` for the full fixture suite.
- `src/api/graphClient.ts` / `devices.ts` — hand-rolled Graph client:
  `@odata.nextLink`-only pagination (C-4), exact `Retry-After` wait on 429
  (C-5), OS-filter try-then-fallback with status-line reporting.
- `src/store/appStore.ts` — Zustand store enforcing the safety invariants
  (keeper/locked-row selection no-ops, simulation-gated real delete) at the
  action level, not the component level.
- `src/features/duplicates/DuplicateGroupCard.tsx` — keeper rows render no
  `<Checkbox>` at all (C-8), not a disabled one.
