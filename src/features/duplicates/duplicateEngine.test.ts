import { describe, expect, it } from 'vitest';
import {
  detectDuplicates,
  luhnCheck,
  normalizeImeiOrMeid,
  normalizeSerial,
  reassignKeeper,
  type DuplicateEngineDevice,
} from './duplicateEngine';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-06-15T12:00:00.000Z');

// A valid Luhn-passing 15-digit IMEI, used across fixtures.
const VALID_IMEI_A = '490154203237518';
const VALID_IMEI_B = '356938035643809';

function device(overrides: Partial<DuplicateEngineDevice> & { id: string }): DuplicateEngineDevice {
  return {
    deviceName: `Device-${overrides.id}`,
    serialNumber: null,
    imei: null,
    meid: null,
    operatingSystem: 'Windows',
    lastSyncDateTime: new Date(NOW).toISOString(),
    enrolledDateTime: new Date(NOW - 100 * DAY).toISOString(),
    complianceState: 'compliant',
    managementAgent: 'mdm',
    managedDeviceOwnerType: 'company',
    deviceEnrollmentType: 'windowsAutoEnrollment',
    ...overrides,
  };
}

describe('normalizeSerial', () => {
  it('excludes junk serials from matching', () => {
    expect(normalizeSerial('DEFAULT STRING')).toBeNull();
    expect(normalizeSerial('  system serial number ')).toBeNull();
    expect(normalizeSerial('To Be Filled By O.E.M.')).toBeNull();
    expect(normalizeSerial('0000000000')).toBeNull();
    expect(normalizeSerial('AB1')).toBeNull(); // under 5 chars
  });

  it('trims and uppercases valid serials', () => {
    expect(normalizeSerial('  abc123  ')).toBe('ABC123');
  });
});

describe('luhnCheck / normalizeImeiOrMeid', () => {
  it('validates a known-good Luhn IMEI', () => {
    expect(luhnCheck(VALID_IMEI_A)).toBe(true);
  });

  it('rejects an IMEI that fails Luhn', () => {
    const badImei = '490154203237519'; // last digit flipped, breaks checksum
    expect(luhnCheck(badImei)).toBe(false);
    expect(normalizeImeiOrMeid(badImei)).toBeNull();
  });

  it('rejects non-15-digit values', () => {
    expect(normalizeImeiOrMeid('12345')).toBeNull();
  });

  it('strips non-digit characters before validating', () => {
    expect(normalizeImeiOrMeid(' 49-0154-203237518 ')).toBe(VALID_IMEI_A);
  });
});

describe('detectDuplicates — spec §10 required fixture cases', () => {
  it('case 1: genuine pair — keeper selected, candidate deletable', () => {
    const keeper = device({
      id: 'A',
      serialNumber: 'SER0001',
      lastSyncDateTime: new Date(NOW).toISOString(),
    });
    const candidate = device({
      id: 'B',
      serialNumber: 'SER0001',
      lastSyncDateTime: new Date(NOW - 40 * DAY).toISOString(),
    });

    const { groups } = detectDuplicates([keeper, candidate], { now: NOW });

    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group.status).toBe('actionable');
    expect(group.matchedOn).toEqual(['serial']);
    const keeperMember = group.members.find((m) => m.device.id === 'A')!;
    const candidateMember = group.members.find((m) => m.device.id === 'B')!;
    expect(keeperMember.role).toBe('keeper');
    expect(candidateMember.role).toBe('candidate');
    expect(candidateMember.deletable).toBe(true);
  });

  it('case 2: junk-serial cluster is excluded from grouping entirely', () => {
    const devices = [
      device({ id: 'A', serialNumber: 'DEFAULT STRING' }),
      device({ id: 'B', serialNumber: 'DEFAULT STRING' }),
      device({ id: 'C', serialNumber: 'default string' }),
    ];

    const { groups } = detectDuplicates(devices, { now: NOW });
    expect(groups).toHaveLength(0);
  });

  it('case 3: same-serial-different-OS hidden by default, shown when opted in', () => {
    const a = device({ id: 'A', serialNumber: 'SER0002', operatingSystem: 'Windows' });
    const b = device({ id: 'B', serialNumber: 'SER0002', operatingSystem: 'iOS' });

    const hidden = detectDuplicates([a, b], { now: NOW });
    expect(hidden.groups).toHaveLength(0);

    const shown = detectDuplicates([a, b], { now: NOW, matchAcrossPlatforms: true });
    expect(shown.groups).toHaveLength(1);
    expect(shown.groups[0].matchedOn).toEqual(['serial']);
  });

  it('case 4: group over size ceiling is report-only, no keeper', () => {
    const devices = Array.from({ length: 6 }, (_, i) =>
      device({
        id: `D${i}`,
        serialNumber: 'SER0003',
        lastSyncDateTime: new Date(NOW - i * DAY).toISOString(),
      }),
    );

    const { groups } = detectDuplicates(devices, { now: NOW });
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group.status).toBe('over-size-ceiling');
    expect(group.members.every((m) => m.role === 'unresolved')).toBe(true);
    expect(group.members.every((m) => !m.deletable)).toBe(true);
  });

  it('case 5: newest login is retained even when timestamps are close', () => {
    const a = device({
      id: 'A',
      serialNumber: 'SER0004',
      lastSyncDateTime: new Date(NOW).toISOString(),
    });
    const b = device({
      id: 'B',
      serialNumber: 'SER0004',
      lastSyncDateTime: new Date(NOW - 2 * HOUR).toISOString(),
    });

    const { groups } = detectDuplicates([a, b], { now: NOW });
    expect(groups).toHaveLength(1);
    expect(groups[0].status).toBe('actionable');
    expect(groups[0].members.find((m) => m.device.id === 'A')?.role).toBe('keeper');
    expect(groups[0].members.find((m) => m.device.id === 'B')?.deletable).toBe(true);
  });
});

describe('detectDuplicates — additional fixture cases (code-level-detail.md)', () => {
  it('excludes an IMEI that fails Luhn from matching', () => {
    const badImei = '490154203237519';
    const a = device({ id: 'A', imei: badImei });
    const b = device({ id: 'B', imei: badImei });

    const { groups } = detectDuplicates([a, b], { now: NOW });
    expect(groups).toHaveLength(0);
  });

  it('merges a group linked only by IMEI across two different serials (union-find)', () => {
    const a = device({ id: 'A', serialNumber: 'SER-A', imei: VALID_IMEI_A });
    const b = device({ id: 'B', serialNumber: 'SER-B', imei: VALID_IMEI_A });
    const c = device({
      id: 'C',
      serialNumber: 'SER-B',
      imei: VALID_IMEI_B,
      lastSyncDateTime: new Date(NOW - 50 * DAY).toISOString(),
    });

    const { groups } = detectDuplicates([a, b, c], { now: NOW });
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => m.device.id).sort()).toEqual(['A', 'B', 'C']);
    expect(groups[0].matchedOn.sort()).toEqual(['imei', 'serial']);
  });

  it('newest record is kept and every other duplicate is eligible for review', () => {
    const keeper = device({
      id: 'A',
      serialNumber: 'SER0005',
      lastSyncDateTime: new Date(NOW).toISOString(),
    });
    const recentLoser = device({
      id: 'B',
      serialNumber: 'SER0005',
      lastSyncDateTime: new Date(NOW - 7 * DAY).toISOString(), // synced last week
    });

    const { groups } = detectDuplicates([keeper, recentLoser], { now: NOW });
    const candidate = groups[0].members.find((m) => m.device.id === 'B')!;
    expect(candidate.role).toBe('candidate');
    expect(candidate.deletable).toBe(true);
  });

  it('full tie-break chain: identical lastSyncDateTime resolved deterministically', () => {
    const sameSync = new Date(NOW).toISOString();

    // Both tied on lastSyncDateTime; A enrolled later than B -> A should win
    // (earlier enrolledDateTime loses).
    const a = device({
      id: 'A',
      serialNumber: 'SER0006',
      lastSyncDateTime: sameSync,
      enrolledDateTime: new Date(NOW - 10 * DAY).toISOString(),
    });
    const b = device({
      id: 'B',
      serialNumber: 'SER0006',
      lastSyncDateTime: sameSync,
      enrolledDateTime: new Date(NOW - 20 * DAY).toISOString(),
    });

    const { groups: g1 } = detectDuplicates([a, b], { now: NOW });
    expect(g1[0].status).toBe('actionable');
    expect(g1[0].members.find((m) => m.device.id === 'A')!.role).toBe('keeper');
    expect(g1[0].members.find((m) => m.device.id === 'B')!.role).toBe('candidate');

    // Still tied on enrolledDateTime -> non-compliant loses.
    const c = device({
      id: 'C',
      serialNumber: 'SER0007',
      lastSyncDateTime: sameSync,
      enrolledDateTime: new Date(NOW - 10 * DAY).toISOString(),
      complianceState: 'noncompliant',
    });
    const d = device({
      id: 'D',
      serialNumber: 'SER0007',
      lastSyncDateTime: sameSync,
      enrolledDateTime: new Date(NOW - 10 * DAY).toISOString(),
      complianceState: 'compliant',
    });

    const { groups: g2 } = detectDuplicates([c, d], { now: NOW });
    expect(g2[0].members.find((m) => m.device.id === 'D')!.role).toBe('keeper');
    expect(g2[0].members.find((m) => m.device.id === 'C')!.role).toBe('candidate');

    // Still tied on everything -> lower id (lexicographically) wins.
    const e = device({
      id: 'E',
      serialNumber: 'SER0008',
      lastSyncDateTime: sameSync,
      enrolledDateTime: new Date(NOW - 10 * DAY).toISOString(),
      complianceState: 'compliant',
    });
    const f = device({
      id: 'F',
      serialNumber: 'SER0008',
      lastSyncDateTime: sameSync,
      enrolledDateTime: new Date(NOW - 10 * DAY).toISOString(),
      complianceState: 'compliant',
    });

    const { groups: g3 } = detectDuplicates([f, e], { now: NOW });
    expect(g3[0].members.find((m) => m.device.id === 'E')!.role).toBe('keeper');
    expect(g3[0].members.find((m) => m.device.id === 'F')!.role).toBe('candidate');
  });
});

describe('detectDuplicates — warnings', () => {
  it('flags co-management when managementAgent differs within a group', () => {
    const a = device({ id: 'A', serialNumber: 'SER0009', managementAgent: 'mdm' });
    const b = device({
      id: 'B',
      serialNumber: 'SER0009',
      managementAgent: 'configurationManagerClient',
      lastSyncDateTime: new Date(NOW - 40 * DAY).toISOString(),
    });

    const { groups } = detectDuplicates([a, b], { now: NOW });
    expect(groups[0].warnings).toContain('co-management');
  });
});

describe('reassignKeeper', () => {
  it('swaps keeper and candidate roles on a 2-member group', () => {
    const a = device({ id: 'A', serialNumber: 'SER0010' });
    const b = device({
      id: 'B',
      serialNumber: 'SER0010',
      lastSyncDateTime: new Date(NOW - 40 * DAY).toISOString(),
    });
    const { groups } = detectDuplicates([a, b], { now: NOW });
    const [group] = groups;
    expect(group.members.find((m) => m.device.id === 'A')?.role).toBe('keeper');

    const swapped = reassignKeeper(group, 'B');
    expect(swapped.members.find((m) => m.device.id === 'B')).toMatchObject({
      role: 'keeper',
      deletable: false,
    });
    expect(swapped.members.find((m) => m.device.id === 'A')).toMatchObject({
      role: 'candidate',
      deletable: true,
    });
  });

  it('only touches the reassigned pair on a 3+ member group', () => {
    const a = device({ id: 'A', serialNumber: 'SER0011' });
    const b = device({
      id: 'B',
      serialNumber: 'SER0011',
      lastSyncDateTime: new Date(NOW - 10 * DAY).toISOString(),
    });
    const c = device({
      id: 'C',
      serialNumber: 'SER0011',
      lastSyncDateTime: new Date(NOW - 40 * DAY).toISOString(),
    });
    const { groups } = detectDuplicates([a, b, c], { now: NOW });
    const [group] = groups;

    const swapped = reassignKeeper(group, 'C');
    expect(swapped.members.find((m) => m.device.id === 'C')).toMatchObject({ role: 'keeper' });
    expect(swapped.members.find((m) => m.device.id === 'A')).toMatchObject({ role: 'candidate' });
    expect(swapped.members.find((m) => m.device.id === 'B')).toMatchObject({ role: 'candidate' });
  });

  it('no-ops on a non-actionable group', () => {
    const devices = Array.from({ length: 6 }, (_, i) =>
      device({ id: `D${i}`, serialNumber: 'SER0012' }),
    );
    const { groups } = detectDuplicates(devices, { now: NOW });
    const [group] = groups;
    expect(reassignKeeper(group, 'D1')).toBe(group);
  });

  it('no-ops on an unknown device id', () => {
    const a = device({ id: 'A', serialNumber: 'SER0013' });
    const b = device({
      id: 'B',
      serialNumber: 'SER0013',
      lastSyncDateTime: new Date(NOW - 40 * DAY).toISOString(),
    });
    const { groups } = detectDuplicates([a, b], { now: NOW });
    expect(reassignKeeper(groups[0], 'ZZZ')).toBe(groups[0]);
  });

  it('no-ops when redesignating the current keeper to itself', () => {
    const a = device({ id: 'A', serialNumber: 'SER0014' });
    const b = device({
      id: 'B',
      serialNumber: 'SER0014',
      lastSyncDateTime: new Date(NOW - 40 * DAY).toISOString(),
    });
    const { groups } = detectDuplicates([a, b], { now: NOW });
    expect(reassignKeeper(groups[0], 'A')).toBe(groups[0]);
  });
});
