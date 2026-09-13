// Runs duplicateEngine.ts against the COMPLETE unfiltered inventory,
// regardless of current table filters (spec §9.2: "filtering the view
// must never change which records are considered part of a duplicate
// group"). Table-level filters only affect features/devices/DeviceTable,
// never the input to detectDuplicates.

import { useMemo } from 'react';
import { detectDuplicates, reassignKeeper, type DuplicateEngineDevice } from './duplicateEngine';
import { useDevices } from '../devices/useDevices';
import { useAppStore } from '../../store/appStore';
import type { RawGraphDevice } from '../../api/types';

function toEngineDevice(device: RawGraphDevice): DuplicateEngineDevice {
  return {
    id: device.id,
    deviceName: device.deviceName,
    serialNumber: device.serialNumber,
    imei: device.imei,
    meid: device.meid,
    operatingSystem: device.operatingSystem,
    lastSyncDateTime: device.lastSyncDateTime,
    enrolledDateTime: device.enrolledDateTime,
    complianceState: device.complianceState,
    managementAgent: device.managementAgent,
    managedDeviceOwnerType: device.managedDeviceOwnerType,
    deviceEnrollmentType: device.deviceEnrollmentType,
  };
}

export function useDuplicates() {
  const { devices, isLoading, isError } = useDevices();
  const matchAcrossPlatforms = useAppStore((s) => s.matchAcrossPlatforms);
  const keeperOverrides = useAppStore((s) => s.keeperOverrides);

  const result = useMemo(() => {
    if (!devices) return null;
    const engineInput = devices.map(toEngineDevice);
    const { groups } = detectDuplicates(engineInput, { matchAcrossPlatforms });
    // Stale override entries (groupId no longer matching any current group,
    // e.g. after a refetch changes membership) are inert here.
    const overridden = groups.map((group) => {
      const overrideId = keeperOverrides[group.id];
      return overrideId ? reassignKeeper(group, overrideId) : group;
    });
    return { groups: overridden };
  }, [devices, matchAcrossPlatforms, keeperOverrides]);

  // Look up the full RawGraphDevice by id for rendering (owner type, OS,
  // enrollment type needed for wipe-risk styling beyond the engine's
  // narrower DuplicateEngineDevice shape).
  const devicesById = useMemo(() => {
    const map = new Map<string, RawGraphDevice>();
    for (const d of devices ?? []) map.set(d.id, d);
    return map;
  }, [devices]);

  return {
    groups: result?.groups ?? [],
    devicesById,
    isLoading,
    isError,
  };
}
