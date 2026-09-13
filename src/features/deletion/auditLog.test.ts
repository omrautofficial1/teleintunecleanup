import { describe, expect, it } from 'vitest';
import { auditLogToCsv, type AuditLogEntry } from './auditLog';
import type { RawGraphDevice } from '../../api/types';

function makeSnapshot(overrides: Partial<RawGraphDevice> = {}): RawGraphDevice {
  return {
    id: 'A',
    deviceName: 'Device-A',
    serialNumber: 'SER0001',
    imei: null,
    meid: null,
    operatingSystem: 'Windows',
    osVersion: '10',
    manufacturer: 'Dell',
    model: 'Latitude',
    lastSyncDateTime: '2026-01-01T00:00:00.000Z',
    enrolledDateTime: '2025-01-01T00:00:00.000Z',
    complianceState: 'compliant',
    managementAgent: 'mdm',
    managedDeviceOwnerType: 'company',
    deviceEnrollmentType: 'windowsAutoEnrollment',
    managementState: 'managed',
    azureADDeviceId: null,
    userPrincipalName: 'a.user@example.com',
    ...overrides,
  };
}

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    deviceId: 'A',
    deviceName: 'Device-A',
    serialNumber: 'SER0001',
    imei: null,
    matchedOn: 'serial',
    previousLastSync: '2026-01-01T00:00:00.000Z',
    action: 'retire',
    timestamp: '2026-01-01T00:00:00.000Z',
    outcome: 'success',
    deviceSnapshot: makeSnapshot(),
    ...overrides,
  };
}

describe('auditLogToCsv', () => {
  it('renders a professional "Delete"/"Factory reset" label, not the raw action enum', () => {
    const csv = auditLogToCsv([entry({ action: 'retire' }), entry({ action: 'factory-reset' })]);
    const [header, row1, row2] = csv.split('\n');
    expect(header).toContain('Action');
    expect(row1).toContain('Delete');
    expect(row1).not.toContain('retire');
    expect(row2).toContain('Factory reset');
    expect(row2).not.toContain('factory-reset');
  });

  it('flattens the device snapshot into its own named columns instead of an embedded JSON blob', () => {
    const csv = auditLogToCsv([
      entry({ deviceSnapshot: makeSnapshot({ operatingSystem: 'iOS', userPrincipalName: 'b.user@example.com' }) }),
    ]);
    const [header, row1] = csv.split('\n');

    expect(header).toContain('operatingSystem');
    expect(header).toContain('userPrincipalName');
    expect(header).not.toContain('deviceSnapshot');

    expect(row1).toContain('iOS');
    expect(row1).toContain('b.user@example.com');
    expect(row1).not.toMatch(/[{}]/); // no embedded JSON left in any cell
  });

  // Phase 1 security audit, finding #1: deviceName/manufacturer/model are
  // set at enrollment time, not by the admin, so a malicious or malformed
  // enrollment could smuggle a spreadsheet formula into the exported CSV.
  describe('CSV formula injection (OWASP CSV injection)', () => {
    it.each([
      ['=', '=HYPERLINK("https://evil.example","click")'],
      ['+', '+1+1'],
      ['-', '-2+3'],
      ['@', '@SUM(1,1)'],
    ])('neutralizes a leading "%s" in an enrollment-controlled field', (_label, payload) => {
      const csv = auditLogToCsv([entry({ deviceSnapshot: makeSnapshot({ deviceName: payload }) })]);
      // Build the expected cell the same way a spreadsheet app would need to
      // see it: leading apostrophe applied first, then (only if the value
      // contains a comma/quote/newline) CSV-quoted on top of that — this
      // mirrors csvEscape's own two-step order rather than re-parsing CSV.
      const neutralized = `'${payload}`;
      const expectedCell = /[",\n]/.test(neutralized)
        ? `"${neutralized.replace(/"/g, '""')}"`
        : neutralized;
      expect(csv).toContain(expectedCell);
      // And the raw, un-neutralized payload must never appear at the start
      // of a cell (i.e. right after a comma or at line start).
      expect(csv).not.toMatch(new RegExp(`(^|,)${payload[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'));
    });

    it('leaves ordinary device names untouched', () => {
      const csv = auditLogToCsv([entry({ deviceSnapshot: makeSnapshot({ deviceName: 'DESKTOP-ABC123' }) })]);
      expect(csv).toContain('DESKTOP-ABC123');
      expect(csv).not.toContain("'DESKTOP-ABC123");
    });
  });
});
