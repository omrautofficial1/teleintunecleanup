# Code-Level Detail (C4 Level 4) — Project Structure and Test Fixtures

## Project Structure (spec §10, as implemented)

```
src/
  main.tsx
  app/
    App.tsx
  auth/
    msalConfig.ts          # sessionStorage cache (ADR-002)
    AuthProvider.tsx
    useAuth.ts              # incremental consent + decline fallback (ADR-006)
  api/
    graphClient.ts          # fetch wrapper: nextLink pagination, 429/Retry-After, OS-filter fallback (ADR-003)
    devices.ts
    types.ts
  store/
    appStore.ts              # Zustand: filters, selection, simulation, wipe-ack (ADR-004)
  features/
    devices/
      DeviceTable.tsx
      DeviceFilters.tsx
      columns.ts
      useDevices.ts          # React Query
    duplicates/
      duplicateEngine.ts     # PURE — zero React/api imports (C-6)
      duplicateEngine.test.ts
      DuplicateGroupCard.tsx
      DuplicateGroupList.tsx
      useDuplicates.ts
    deletion/
      DeletionConfirmDialog.tsx
      useDeleteDevices.ts
      auditLog.ts            # sessionStorage mirror (ADR-005)
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

# Test additions beyond spec §10 (flagged during architecture review):
  api/graphClient.test.ts        # MSW-mocked: pagination, 429, OS-filter fallback
  store/appStore.test.ts         # invariant tests: locked-row/keeper-row no-op, unconfirmed-delete no-op
```

## `duplicateEngine.ts` — Required Fixture Coverage (spec §10, §12)

Five fixture cases, each must have a corresponding `duplicateEngine.test.ts` case:

1. **Genuine pair** — two records, same serial, same OS, `lastSyncDateTime` gap > 24h, older one > 30 days stale → keeper correctly selected, candidate flagged deletable.
2. **Junk-serial cluster** — 3+ records sharing `"DEFAULT STRING"` or similar blocklisted serial → excluded from grouping entirely, never appear as a duplicate group.
3. **Same-serial-different-OS pair** — hidden by default (cross-platform matching off); becomes visible and grouped only when the "match across platforms" toggle is on.
4. **Group over size ceiling** (>5 records, default config) — reported as a group but no keeper selected, nothing marked deletable ("report only").
5. **Too-close-to-call pair** — `lastSyncDateTime` gap < 24h → no keeper auto-selected, group flagged for manual review, no checkboxes rendered.

Additional cases worth adding (not explicitly named in spec but implied by acceptance checklist §12):
- IMEI failing Luhn checksum → excluded from matching.
- Group linked only by IMEI across two different serials → correctly merged via union-find (tests the disjoint-set merge behavior specifically, not just pairwise matching).
- Staleness floor: losing record synced within last 30 days → not marked deletable even if it lost the keeper comparison.
- Tie-break chain: identical `lastSyncDateTime` → earlier `enrolledDateTime` loses → still tied → non-compliant loses → still tied → lower `id` lexicographically kept.

## Superseded Scaffold Note

An initial project scaffold was created as a **Next.js** app (commit `cc3ab31`) before the build.md spec was reviewed against it. That scaffold was discarded (directory wiped, `.git` reinitialized) in favor of the Vite rebuild — see ADR-001. No application code existed against the Next.js scaffold, so no migration was needed, only a clean restart.

## Sources

- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/structural-views/components.md` — component responsibilities this file tree implements
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/architecture-decisions/ADR-001-vite-spa-no-backend.md` — superseded-scaffold rationale
- `/home/shadow007/dev/IT-Together/duplicate-device-cleanup/docs/architecture/02-analysis/solution-strategy.md` — testing strategy addendum this fixture list satisfies
- Original spec: `build.md` §7 (duplicate detection logic, full rule text), §10 (project structure, fixture case names), §12 (acceptance checklist)
