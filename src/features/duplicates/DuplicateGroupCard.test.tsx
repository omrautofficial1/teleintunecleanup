import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DuplicateGroupCard } from './DuplicateGroupCard';
import { useAppStore } from '../../store/appStore';
import type { DuplicateGroup } from './duplicateEngine';
import type { RawGraphDevice } from '../../api/types';

function makeDevice(overrides: Partial<RawGraphDevice> & { id: string }): RawGraphDevice {
  return {
    deviceName: `Device-${overrides.id}`,
    serialNumber: 'SER0001',
    imei: null,
    meid: null,
    operatingSystem: 'Windows',
    osVersion: '10',
    manufacturer: 'Dell',
    model: 'Latitude',
    lastSyncDateTime: new Date().toISOString(),
    enrolledDateTime: new Date().toISOString(),
    complianceState: 'compliant',
    managementAgent: 'mdm',
    managedDeviceOwnerType: 'company',
    deviceEnrollmentType: 'windowsAutoEnrollment',
    managementState: 'managed',
    azureADDeviceId: null,
    userPrincipalName: null,
    ...overrides,
  };
}

function resetStore() {
  useAppStore.setState({
    selectedIds: new Set<string>(),
    wipeRiskAcknowledged: false,
    keeperOverrides: {},
  });
}

beforeEach(() => {
  resetStore();
});

describe('DuplicateGroupCard — C-8 keeper has no checkbox in the render tree', () => {
  it('renders no checkbox at all for the keeper row', () => {
    const keeperDevice = makeDevice({ id: 'keeper-1' });
    const candidateDevice = makeDevice({ id: 'candidate-1' });

    const group: DuplicateGroup = {
      id: 'candidate-1|keeper-1',
      status: 'actionable',
      matchedOn: ['serial'],
      warnings: [],
      members: [
        { device: keeperDevice, role: 'keeper', deletable: false },
        { device: candidateDevice, role: 'candidate', deletable: true },
      ],
    };

    const devicesById = new Map([
      ['keeper-1', keeperDevice],
      ['candidate-1', candidateDevice],
    ]);

    render(<DuplicateGroupCard group={group} devicesById={devicesById} />);
    fireEvent.click(screen.getByRole('button'));

    // Assert via queryByRole returning null, per the task's explicit
    // instruction — not toBeDisabled(). Scope the query to the keeper's
    // own row region so a checkbox rendered for a sibling candidate row
    // doesn't produce a false pass.
    const keeperRow = screen.getByTestId(`member-row-${keeperDevice.id}`);
    expect(within(keeperRow).queryByRole('checkbox')).toBeNull();

    // The candidate row, by contrast, does get a checkbox.
    const candidateRow = screen.getByTestId(`member-row-${candidateDevice.id}`);
    expect(within(candidateRow).queryByRole('checkbox')).not.toBeNull();
  });

  it('renders no checkbox for keeper rows even when the group is locked for wipe risk', () => {
    const keeperDevice = makeDevice({
      id: 'keeper-2',
      managedDeviceOwnerType: 'company',
      operatingSystem: 'Android',
      deviceEnrollmentType: 'androidEnterpriseFullyManagedEnrollment',
    });
    const candidateDevice = makeDevice({
      id: 'candidate-2',
      managedDeviceOwnerType: 'company',
      operatingSystem: 'Android',
      deviceEnrollmentType: 'androidEnterpriseFullyManagedEnrollment',
    });

    const group: DuplicateGroup = {
      id: 'candidate-2|keeper-2',
      status: 'actionable',
      matchedOn: ['serial'],
      warnings: [],
      members: [
        { device: keeperDevice, role: 'keeper', deletable: false },
        { device: candidateDevice, role: 'candidate', deletable: true },
      ],
    };

    const devicesById = new Map([
      ['keeper-2', keeperDevice],
      ['candidate-2', candidateDevice],
    ]);

    render(<DuplicateGroupCard group={group} devicesById={devicesById} />);
    fireEvent.click(screen.getByRole('button'));

    const keeperRow = screen.getByTestId(`member-row-${keeperDevice.id}`);
    expect(within(keeperRow).queryByRole('checkbox')).toBeNull();
  });

  it('renders no interactive checkbox for an unresolved (report-only) group', () => {
    const deviceA = makeDevice({ id: 'a' });
    const deviceB = makeDevice({ id: 'b' });

    const group: DuplicateGroup = {
      id: 'a|b',
      status: 'too-close-to-call',
      matchedOn: ['serial'],
      warnings: [],
      members: [
        { device: deviceA, role: 'unresolved', deletable: false },
        { device: deviceB, role: 'unresolved', deletable: false },
      ],
    };

    const devicesById = new Map([
      ['a', deviceA],
      ['b', deviceB],
    ]);

    render(<DuplicateGroupCard group={group} devicesById={devicesById} />);
    fireEvent.click(screen.getByRole('button'));

    // Unresolved rows render a checkbox but it must be disabled — no path
    // to select a report-only row for deletion.
    const checkboxes = screen.getAllByRole('checkbox');
    for (const checkbox of checkboxes) {
      expect(checkbox).toBeDisabled();
    }
  });
});

describe('DuplicateGroupCard — group identity header', () => {
  it('shows the keeper device name and user instead of a raw device-id fragment', () => {
    const keeperDevice = makeDevice({
      id: 'keeper-1',
      deviceName: 'Device-keeper-1',
      userPrincipalName: 'a.user@example.com',
      serialNumber: 'SER0099',
    });
    const candidateDevice = makeDevice({ id: 'candidate-1', userPrincipalName: 'a.user@example.com' });

    const group: DuplicateGroup = {
      id: 'candidate-1|keeper-1',
      status: 'actionable',
      matchedOn: ['serial'],
      warnings: [],
      members: [
        { device: keeperDevice, role: 'keeper', deletable: false },
        { device: candidateDevice, role: 'candidate', deletable: true },
      ],
    };
    const devicesById = new Map([
      ['keeper-1', keeperDevice],
      ['candidate-1', candidateDevice],
    ]);

    render(<DuplicateGroupCard group={group} devicesById={devicesById} />);

    expect(screen.getByText('Device-keeper-1')).toBeInTheDocument();
    expect(screen.getByText(/a\.user@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/SER0099/)).toBeInTheDocument();
    expect(screen.queryByText(/candidate-1\|keeper-1/)).toBeNull();
  });
});

describe('DuplicateGroupCard — keeper reassignment', () => {
  function actionableGroup(): {
    group: DuplicateGroup;
    devicesById: Map<string, RawGraphDevice>;
  } {
    const keeperDevice = makeDevice({ id: 'keeper-1' });
    const candidateDevice = makeDevice({ id: 'candidate-1' });
    const group: DuplicateGroup = {
      id: 'candidate-1|keeper-1',
      status: 'actionable',
      matchedOn: ['serial'],
      warnings: [],
      members: [
        { device: keeperDevice, role: 'keeper', deletable: false },
        { device: candidateDevice, role: 'candidate', deletable: true },
      ],
    };
    const devicesById = new Map([
      ['keeper-1', keeperDevice],
      ['candidate-1', candidateDevice],
    ]);
    return { group, devicesById };
  }

  it('clicking "Make keeper" on a candidate row records the override in the store', () => {
    const { group, devicesById } = actionableGroup();
    render(<DuplicateGroupCard group={group} devicesById={devicesById} />);
    fireEvent.click(screen.getByRole('button'));

    fireEvent.click(screen.getByRole('button', { name: 'Make keeper' }));

    expect(useAppStore.getState().keeperOverrides[group.id]).toBe('candidate-1');
  });

  it('shows "Manually assigned" and "Reset to automatic" only when the group is overridden', () => {
    const { group, devicesById } = actionableGroup();
    render(<DuplicateGroupCard group={group} devicesById={devicesById} />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.queryByText('Manually assigned')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Make keeper' }));
    expect(screen.getByText('Manually assigned')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset to automatic' }));
    expect(useAppStore.getState().keeperOverrides[group.id]).toBeUndefined();
  });

  it('after an override is applied upstream, the new keeper has no checkbox and the ex-keeper does', () => {
    // Simulates useDuplicates.ts having already run reassignKeeper — this
    // is the actual code path exercised in the app, since DuplicateGroupCard
    // never calls reassignKeeper itself, only the store action.
    const keeperDevice = makeDevice({ id: 'keeper-1' });
    const candidateDevice = makeDevice({ id: 'candidate-1' });
    const overriddenGroup: DuplicateGroup = {
      id: 'candidate-1|keeper-1',
      status: 'actionable',
      matchedOn: ['serial'],
      warnings: [],
      members: [
        { device: candidateDevice, role: 'keeper', deletable: false },
        { device: keeperDevice, role: 'candidate', deletable: true },
      ],
    };
    useAppStore.setState({ keeperOverrides: { [overriddenGroup.id]: 'candidate-1' } });
    const devicesById = new Map([
      ['keeper-1', keeperDevice],
      ['candidate-1', candidateDevice],
    ]);

    render(<DuplicateGroupCard group={overriddenGroup} devicesById={devicesById} />);
    fireEvent.click(screen.getByRole('button'));

    const newKeeperRow = screen.getByTestId(`member-row-${candidateDevice.id}`);
    expect(within(newKeeperRow).queryByRole('checkbox')).toBeNull();

    const exKeeperRow = screen.getByTestId(`member-row-${keeperDevice.id}`);
    expect(within(exKeeperRow).queryByRole('checkbox')).not.toBeNull();
  });
});
