// Typed DTOs for Microsoft Graph `deviceManagement/managedDevices`.
// Field list is the exact selection from build.md §6 — do not add fields
// without updating the $select list in graphClient.ts.

export type ManagedDeviceOwnerType = 'company' | 'personal' | 'unknown';

export interface RawGraphDevice {
  id: string;
  deviceName: string;
  serialNumber: string | null;
  imei: string | null;
  meid: string | null;
  operatingSystem: string;
  osVersion: string;
  manufacturer: string;
  model: string;
  lastSyncDateTime: string;
  enrolledDateTime: string;
  complianceState: string;
  managementAgent: string;
  managedDeviceOwnerType: string;
  deviceEnrollmentType: string;
  managementState: string;
  azureADDeviceId: string | null;
  userPrincipalName: string | null;
}

/** App-level device record — same shape as the raw Graph DTO today, kept as
 * a distinct alias so call sites express intent and a future normalization
 * step doesn't require a mass rename. */
export type DeviceRecord = RawGraphDevice;

export const GRAPH_DEVICE_SELECT_FIELDS = [
  'id',
  'deviceName',
  'serialNumber',
  'imei',
  'meid',
  'operatingSystem',
  'osVersion',
  'manufacturer',
  'model',
  'lastSyncDateTime',
  'enrolledDateTime',
  'complianceState',
  'managementAgent',
  'managedDeviceOwnerType',
  'deviceEnrollmentType',
  'managementState',
  'azureADDeviceId',
  'userPrincipalName',
] as const;
