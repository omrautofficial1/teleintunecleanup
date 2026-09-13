# Phase 1 — Security & QA Audit
**Tool audited:** `duplicateintunecleanuptool` (source: github.com/omrautofficial1/duplicateintunecleanuptool)
**Audited for:** Telestar rebrand engagement
**Method:** Full source read (not just README) — auth config, Graph client, delete flow, audit log/export, store invariants, build tooling, `npm audit`, dependency/secret scan.
**Status:** No code changed. Findings only.

---

## Confirmed strengths (keep these — don't regress them in the rebrand)

- **Zero custom backend / API surface.** Every network call goes to `login.microsoftonline.com` or `graph.microsoft.com` under delegated OAuth. This is the right foundation for "no API endpoints without permission" — the rebrand should not introduce a server unless you explicitly ask for one.
- **`npm audit`: 0 known vulnerabilities** across 257 resolved packages (prod + dev).
- **No secrets committed.** `.gitignore` correctly excludes `.env*` (except `.env.example`); `git log` shows no history of a committed `.env`.
- **No `dangerouslySetInnerHTML` anywhere** — no obvious HTML-injection surface in rendering.
- Least-privilege, scope-separated MSAL config (read / write / audit scopes requested independently); `sessionStorage`-only token cache; write access is requested incrementally, not up front.
- Delete safety is enforced at the **store level**, not just the UI (keeper rows, unresolved rows, and un-acknowledged wipe-risk rows cannot enter `selectedIds`, structurally — see `appStore.ts`).
- Typed `DELETE` confirmation gates the only code path that can call the Graph DELETE endpoint.

## Findings

### 1. (Medium) CSV export is vulnerable to formula injection
`auditLogToCsv()` escapes commas/quotes/newlines but not leading `= + - @` / tab / CR characters. Several exported fields (`deviceName`, `manufacturer`, `model`) are attacker/end-user-influenceable at enrollment time. A device enrolled with a name like `=HYPERLINK(...)` would execute as a formula when an admin opens the exported CSV in Excel.
**Fix:** prefix any cell value starting with `= + - @` (or tab/CR) with a leading `'` before the existing quote-escaping, per the standard OWASP CSV-injection mitigation.

### 2. (Low) `@odata.nextLink` is trusted without an origin check
`fetchAllPages` follows `@odata.nextLink` verbatim (correct behavior per spec C-4) but attaches the bearer token to whatever URL comes back with no check that it's still on `graph.microsoft.com`. Not exploitable today — Graph doesn't do this — but it's a token-exfiltration vector if that ever changed, and it's a one-line defense-in-depth fix.
**Fix:** validate `new URL(nextLink).host` against an allowlist before reusing it in `graphRequest`.

### 3. (Low/Info) No Content-Security-Policy is defined anywhere
`index.html` has no CSP meta tag, and there's no hosting config (`_headers`, `staticwebapp.config.json`, etc.) in the repo. Since this app has no backend and tokens live in `sessionStorage`, **XSS is the single biggest realistic risk to this app**, and CSP is the primary control against it. This should be added as part of the rebrand/deploy step, not left to whatever the hosting platform defaults to.
**Fix:** ship a strict CSP (`default-src 'none'; script-src 'self'; connect-src https://graph.microsoft.com https://login.microsoftonline.com; style-src 'self' 'unsafe-inline'; ...`) at the hosting layer.

### 4. (Info) Audit log / CSV export contains PII and hardware identifiers
`userPrincipalName`, `serialNumber`, and `imei` are all pulled and exported. Not a code defect — the app needs these fields to work — but worth documenting explicitly given Telestar's government/high-security client base: who is allowed to download this CSV, where it's allowed to be stored, and for how long. This is a data-handling policy question, not a code fix.

### 5. (Info) No CI pipeline
No `.github/workflows` (or any CI config) in the repo. `lint`, `test`, and `npm audit` all currently rely on someone running them manually. Recommend adding CI before this goes into a Telestar-branded repo, so `npm audit`/lint/test regressions get caught automatically rather than at review time.

### 6. (Info) Error messages include raw Graph response bodies
`GraphHttpError` embeds up to 500 chars of the raw Graph response body in the thrown error message. Confirmed this never reaches `dangerouslySetInnerHTML` (React escapes it if rendered as text), so it's not an XSS vector — but worth deciding deliberately whether admins should see raw Graph error text, or a cleaner mapped message.

---

## What I did *not* do
- No code was modified.
- No new repo, API, or dependency was added.
- No feature (including the deletion-verification polling you liked from `autopilot-cleanup`) was implemented.

## Suggested next step (pending your go-ahead)
Fix items 1–3 in place, on the existing repo, before the rebrand starts — they're small, mechanical, and independent of branding. Item 5 (CI) is a good candidate to add at the same time the repo gets renamed/moved. Item 4 is a policy note for whoever owns data handling at Telestar, not something I'd action myself.
