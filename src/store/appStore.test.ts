import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore, type SelectableRowInfo } from './appStore';

function resetStore() {
  useAppStore.setState({
    filters: {
      operatingSystem: [],
      managementState: [],
      managedDeviceOwnerType: [],
      complianceOnly: false,
      search: '',
      duplicatesOnly: false,
    },
    matchAcrossPlatforms: false,
    selectedIds: new Set<string>(),
    typedConfirmation: '',
    wipeRiskAcknowledged: false,
    keeperOverrides: {},
  });
}

beforeEach(() => {
  resetStore();
});

const keeperRow: SelectableRowInfo = { id: 'keeper-1', role: 'keeper', isWipeRisk: false };
const candidateRow: SelectableRowInfo = { id: 'candidate-1', role: 'candidate', isWipeRisk: false };
const lockedWipeRow: SelectableRowInfo = { id: 'wipe-1', role: 'candidate', isWipeRisk: true };
const unresolvedRow: SelectableRowInfo = { id: 'unresolved-1', role: 'unresolved', isWipeRisk: false };

describe('appStore — invalid-transition no-ops', () => {
  it('selectCandidate no-ops when the row is a keeper', () => {
    useAppStore.getState().selectCandidate(keeperRow);
    expect(useAppStore.getState().selectedIds.has(keeperRow.id)).toBe(false);
  });

  it('selectCandidate no-ops when the row is unresolved (report-only group)', () => {
    useAppStore.getState().selectCandidate(unresolvedRow);
    expect(useAppStore.getState().selectedIds.has(unresolvedRow.id)).toBe(false);
  });

  it('selectCandidate no-ops on a locked wipe-risk row before acknowledgment', () => {
    useAppStore.getState().selectCandidate(lockedWipeRow);
    expect(useAppStore.getState().selectedIds.has(lockedWipeRow.id)).toBe(false);
  });

  it('selectCandidate succeeds on a locked wipe-risk row after acknowledgment', () => {
    useAppStore.getState().acknowledgeWipeRisk();
    useAppStore.getState().selectCandidate(lockedWipeRow);
    expect(useAppStore.getState().selectedIds.has(lockedWipeRow.id)).toBe(true);
  });

  it('selectCandidate succeeds on a plain candidate row', () => {
    useAppStore.getState().selectCandidate(candidateRow);
    expect(useAppStore.getState().selectedIds.has(candidateRow.id)).toBe(true);
  });

  it('"select all stale" skips locked wipe-risk and keeper/unresolved rows', () => {
    useAppStore
      .getState()
      .selectAllStale([keeperRow, candidateRow, lockedWipeRow, unresolvedRow]);
    const selected = useAppStore.getState().selectedIds;
    expect(selected.has(candidateRow.id)).toBe(true);
    expect(selected.has(keeperRow.id)).toBe(false);
    expect(selected.has(lockedWipeRow.id)).toBe(false);
    expect(selected.has(unresolvedRow.id)).toBe(false);
  });

  it('canConfirmDelete is false without a typed confirmation', () => {
    expect(useAppStore.getState().canConfirmDelete()).toBe(false);
  });

  it('canConfirmDelete is true once "DELETE" is typed', () => {
    useAppStore.getState().setTypedConfirmation('DELETE');
    expect(useAppStore.getState().canConfirmDelete()).toBe(true);
  });

  it('typed confirmation is case-sensitive and exact', () => {
    useAppStore.getState().setTypedConfirmation('delete');
    expect(useAppStore.getState().canConfirmDelete()).toBe(false);
  });

  it('resetConfirmationAfterConsentDecline clears the typed confirmation', () => {
    useAppStore.getState().setTypedConfirmation('DELETE');
    useAppStore.getState().resetConfirmationAfterConsentDecline();
    const state = useAppStore.getState();
    expect(state.typedConfirmation).toBe('');
    expect(state.canConfirmDelete()).toBe(false);
  });
});

describe('appStore — keeper overrides', () => {
  it('setKeeperOverride records the override and deselects the target id if selected', () => {
    useAppStore.getState().selectCandidate(candidateRow);
    useAppStore.getState().setKeeperOverride('group-1', candidateRow.id);
    const state = useAppStore.getState();
    expect(state.keeperOverrides['group-1']).toBe(candidateRow.id);
    expect(state.selectedIds.has(candidateRow.id)).toBe(false);
  });

  it('setKeeperOverride replaces a prior override for the same group', () => {
    useAppStore.getState().setKeeperOverride('group-1', 'device-a');
    useAppStore.getState().setKeeperOverride('group-1', 'device-b');
    expect(useAppStore.getState().keeperOverrides['group-1']).toBe('device-b');
  });

  it('clearKeeperOverride removes the entry', () => {
    useAppStore.getState().setKeeperOverride('group-1', 'device-a');
    useAppStore.getState().clearKeeperOverride('group-1');
    expect('group-1' in useAppStore.getState().keeperOverrides).toBe(false);
  });

  it('clearKeeperOverride no-ops when no override exists', () => {
    useAppStore.getState().clearKeeperOverride('group-1');
    expect(useAppStore.getState().keeperOverrides).toEqual({});
  });
});
