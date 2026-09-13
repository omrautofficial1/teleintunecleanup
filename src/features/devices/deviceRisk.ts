// Wipe-risk determination (spec §8, C-9): corporate-owned Android rows
// where DELETE triggers a factory reset, not a retire. This is a narrow,
// well-named predicate so the "lock until acknowledged" logic in the store
// and the amber-styling logic in the UI both call the same source of
// truth instead of re-deriving the condition independently.

import type { DuplicateEngineDevice } from '../duplicates/duplicateEngine';

// Graph's deviceEnrollmentType values that indicate a fully-managed,
// dedicated, COPE (corporate-owned, personally-enabled), or AOSP Android
// enrollment — the enrollment modes where the device is corporate property
// and DELETE performs a factory reset rather than just retiring the MDM
// record.
const WIPE_RISK_ENROLLMENT_TYPES = new Set([
  'androidenterprisededicateddeviceenrollment',
  'androidenterprisefullymanagedenrollment',
  'androidenterprisecorporateworkprofileenrollment', // COPE
  'androidenterprisecorporateworkprofileaospenrollment', // AOSP
  'androidaospuserlessenrollment',
]);

export function isWipeRiskDevice(device: DuplicateEngineDevice): boolean {
  const isCompanyOwned = device.managedDeviceOwnerType?.toLowerCase() === 'company';
  const isAndroid = device.operatingSystem?.toLowerCase().includes('android') ?? false;
  const enrollmentType = device.deviceEnrollmentType?.toLowerCase() ?? '';
  const isRiskyEnrollment = WIPE_RISK_ENROLLMENT_TYPES.has(enrollmentType);
  return isCompanyOwned && isAndroid && isRiskyEnrollment;
}
