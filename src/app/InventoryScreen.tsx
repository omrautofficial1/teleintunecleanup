// Inventory screen (spec §9.1, §9.2): full device table, fetch-progress
// state while loading, manual "Refresh inventory" action, and the
// OS-filter status line (Q-3 — transparent, not silently magic).

import { useDevices } from '../features/devices/useDevices';
import { DeviceFilters } from '../features/devices/DeviceFilters';
import { DeviceTable } from '../features/devices/DeviceTable';
import { Button } from '../components/ui/Button';
import { useAppStore } from '../store/appStore';
import { useDuplicates } from '../features/duplicates/useDuplicates';
import type { RawGraphDevice } from '../api/types';

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function devicesToCsv(devices: RawGraphDevice[]): string {
  const fields: (keyof RawGraphDevice)[] = [
    'id', 'deviceName', 'serialNumber', 'imei', 'meid', 'operatingSystem',
    'osVersion', 'manufacturer', 'model', 'lastSyncDateTime', 'enrolledDateTime',
    'complianceState', 'managementAgent', 'managedDeviceOwnerType',
    'deviceEnrollmentType', 'managementState', 'azureADDeviceId', 'userPrincipalName',
  ];
  return [
    fields.join(','),
    ...devices.map((device) => fields.map((field) => csvEscape(String(device[field] ?? ''))).join(',')),
  ].join('\n');
}

function downloadInventoryCsv(devices: RawGraphDevice[]): void {
  const url = URL.createObjectURL(new Blob([devicesToCsv(devices)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `intune-device-inventory-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const OS_FILTER_LABEL: Record<string, string> = {
  'server-filtered': 'OS filter ran server-side',
  'client-filtered-fallback': 'OS filter fell back to client-side filtering',
  unfiltered: 'No OS filter applied',
};

export function InventoryScreen() {
  const { devices, osFilterPath, isLoading, isError, error, progress, refresh } = useDevices();
  const filters = useAppStore((s) => s.filters);
  const { groups } = useDuplicates();
  const duplicateIds = new Set(groups.flatMap((group) => group.members.map((member) => member.device.id)));

  const filteredDevices = (devices ?? []).filter((d) => {
    if (filters.duplicatesOnly && !duplicateIds.has(d.id)) return false;
    if (filters.operatingSystem.length > 0 && !filters.operatingSystem.includes(d.operatingSystem)) {
      return false;
    }
    if (
      filters.managementState.length > 0 &&
      !filters.managementState.includes(d.managementState)
    ) {
      return false;
    }
    if (
      filters.managedDeviceOwnerType.length > 0 &&
      !filters.managedDeviceOwnerType.includes(d.managedDeviceOwnerType)
    ) {
      return false;
    }
    if (filters.complianceOnly && d.complianceState.toLowerCase() !== 'compliant') {
      return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const haystack = `${d.deviceName} ${d.serialNumber ?? ''} ${d.userPrincipalName ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-app-ink/70">
          {devices ? `${devices.length} device(s) fetched.` : ''}
          {osFilterPath && <span className="ml-2">{OS_FILTER_LABEL[osFilterPath]}</span>}
          {isLoading && progress && (
            <span className="ml-2">
              Fetched {progress.totalSoFar} so far…
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => downloadInventoryCsv(filteredDevices)} disabled={isLoading || filteredDevices.length === 0}>
            Export CSV ({filteredDevices.length})
          </Button>
          <Button variant="secondary" onClick={refresh} disabled={isLoading}>
            Refresh inventory
          </Button>
        </div>
      </div>
      <DeviceFilters />
      <DeviceTable
        devices={filteredDevices}
        isLoading={isLoading}
        isError={isError}
        error={error}
      />
    </div>
  );
}
