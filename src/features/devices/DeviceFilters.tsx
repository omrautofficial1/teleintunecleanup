import { useAppStore } from '../../store/appStore';

const OS_OPTIONS = ['Windows', 'iOS', 'Android', 'macOS', 'Linux'];
const MANAGEMENT_STATE_OPTIONS = [
  'managed',
  'retirePending',
  'retireFailed',
  'wipePending',
  'wipeFailed',
  'unhealthy',
];
const OWNER_TYPE_OPTIONS = ['company', 'personal', 'unknown'];

function toggleInArray(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Filter controls (spec §9.2): multi-select OS/managementState/ownerType,
 * a compliance toggle, free-text search, and the "Duplicates only" chip.
 * Reads/writes appStore directly — filters are cross-cutting UI state
 * (ADR-004), not server state. */
export function DeviceFilters() {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const resetFilters = useAppStore((s) => s.resetFilters);

  return (
    <section aria-label="Device filters" className="border border-app-hairline bg-app-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="device-search" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-app-ink/60">
            Search inventory
          </label>
          <input
            id="device-search"
            type="search"
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            placeholder="Device name, serial, user..."
            className="w-full rounded-md border border-app-hairline px-3 py-2 text-sm outline-none focus:border-[var(--color-brand-accent)]"
          />
        </div>

        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md border border-app-hairline px-3 py-2 text-sm font-medium hover:bg-app-background">
            Operating system {filters.operatingSystem.length > 0 && `(${filters.operatingSystem.length})`}
          </summary>
          <fieldset className="absolute left-0 top-11 z-20 w-52 space-y-2 border border-app-hairline bg-app-surface p-3 shadow-lg">
            <legend className="mb-1 text-xs font-semibold text-app-ink/60">Operating system</legend>
            {OS_OPTIONS.map((os) => (
              <label key={os} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={filters.operatingSystem.includes(os)} onChange={() => setFilters({ operatingSystem: toggleInArray(filters.operatingSystem, os) })} />
                {os}
              </label>
            ))}
          </fieldset>
        </details>

        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md border border-app-hairline px-3 py-2 text-sm font-medium hover:bg-app-background">
            Management state {filters.managementState.length > 0 && `(${filters.managementState.length})`}
          </summary>
          <fieldset className="absolute left-0 top-11 z-20 w-60 space-y-2 border border-app-hairline bg-app-surface p-3 shadow-lg">
            <legend className="mb-1 text-xs font-semibold text-app-ink/60">Management state</legend>
            {MANAGEMENT_STATE_OPTIONS.map((state) => (
              <label key={state} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.managementState.includes(state)} onChange={() => setFilters({ managementState: toggleInArray(filters.managementState, state) })} />{state}</label>
            ))}
          </fieldset>
        </details>

        <details className="relative">
          <summary className="cursor-pointer list-none rounded-md border border-app-hairline px-3 py-2 text-sm font-medium hover:bg-app-background">
            Owner type {filters.managedDeviceOwnerType.length > 0 && `(${filters.managedDeviceOwnerType.length})`}
          </summary>
          <fieldset className="absolute left-0 top-11 z-20 w-48 space-y-2 border border-app-hairline bg-app-surface p-3 shadow-lg">
            <legend className="mb-1 text-xs font-semibold text-app-ink/60">Owner type</legend>
            {OWNER_TYPE_OPTIONS.map((owner) => (
              <label key={owner} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.managedDeviceOwnerType.includes(owner)} onChange={() => setFilters({ managedDeviceOwnerType: toggleInArray(filters.managedDeviceOwnerType, owner) })} />{owner}</label>
            ))}
          </fieldset>
        </details>

        <label className="inline-flex items-center gap-2 rounded-md border border-app-hairline px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={filters.complianceOnly}
            onChange={(e) => setFilters({ complianceOnly: e.target.checked })}
          />
          Compliant only
        </label>

        <label className="inline-flex items-center gap-2 rounded-md border border-[var(--color-brand-accent)]/40 bg-[var(--color-brand-accent)]/5 px-3 py-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={filters.duplicatesOnly}
            onChange={(e) => setFilters({ duplicatesOnly: e.target.checked })}
          />
          Duplicates only
        </label>

        <button type="button" onClick={resetFilters} className="px-2 py-2 text-sm font-medium text-[var(--color-brand-primary)] hover:underline">Reset filters</button>
      </div>
      <div className="mt-3 flex min-h-6 flex-wrap gap-2">
        {[...filters.operatingSystem.map((value) => `OS: ${value}`), ...filters.managementState.map((value) => `State: ${value}`), ...filters.managedDeviceOwnerType.map((value) => `Owner: ${value}`), ...(filters.complianceOnly ? ['Compliant only'] : []), ...(filters.duplicatesOnly ? ['Duplicates only'] : [])].map((chip) => (
          <span key={chip} className="border border-[var(--color-brand-accent)]/30 bg-[var(--color-brand-accent)]/5 px-2 py-1 text-xs font-medium text-[var(--color-brand-primary)]">{chip}</span>
        ))}
      </div>
    </section>
  );
}
