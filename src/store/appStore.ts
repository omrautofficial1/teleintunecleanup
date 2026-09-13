// Cross-cutting UI state (ADR-004): filters, selection, typed-delete
// confirmation, wipe-risk acknowledgment. Server/remote data (device
// inventory) stays in React Query, not here — see useDevices.ts /
// useDuplicates.ts.
//
// The safety-critical invariant lives HERE, at the store-action level, not
// scattered across component checks (solution-strategy.md): selectCandidate
// no-ops if the target is a keeper or a locked corporate-Android row that
// hasn't been acknowledged this session. Even a future UI bug that renders
// a checkbox for a locked row cannot produce a selected-and-deletable state,
// because the store itself refuses the mutation.

import { create } from 'zustand';
import type { DeviceRole } from '../features/duplicates/duplicateEngine';

/** Minimal shape the store needs to decide lock/keeper status. Callers pass
 * this alongside an id rather than the store reaching into React Query
 * itself (keeps this module free of server-state coupling). */
export interface SelectableRowInfo {
  id: string;
  role: DeviceRole;
  /** True when managedDeviceOwnerType + deviceEnrollmentType indicate a
   * corporate-owned Android device where DELETE triggers a factory reset
   * (spec §8, C-9). */
  isWipeRisk: boolean;
}

export interface DeviceFilterState {
  operatingSystem: string[];
  managementState: string[];
  managedDeviceOwnerType: string[];
  complianceOnly: boolean;
  search: string;
  duplicatesOnly: boolean;
}

const defaultFilters: DeviceFilterState = {
  operatingSystem: [],
  managementState: [],
  managedDeviceOwnerType: [],
  complianceOnly: false,
  search: '',
  duplicatesOnly: false,
};

export interface AppState {
  filters: DeviceFilterState;
  setFilters: (patch: Partial<DeviceFilterState>) => void;
  resetFilters: () => void;

  matchAcrossPlatforms: boolean;
  setMatchAcrossPlatforms: (value: boolean) => void;

  /** Selected candidate device ids, pending deletion review. */
  selectedIds: Set<string>;
  selectCandidate: (row: SelectableRowInfo) => void;
  deselectCandidate: (id: string) => void;
  toggleCandidate: (row: SelectableRowInfo) => void;
  /** "Select all stale" (spec §9.3) — selects every deletable candidate
   * that is not locked for wipe risk. Locked rows are silently skipped,
   * not selected-then-blocked. */
  selectAllStale: (rows: SelectableRowInfo[]) => void;
  clearSelection: () => void;

  /** Per-group keeper override: groupId -> device id chosen as keeper,
   * overriding the engine's automatic newest-wins pick. Applied by
   * useDuplicates.ts via reassignKeeper before groups reach the UI. */
  keeperOverrides: Record<string, string>;
  setKeeperOverride: (groupId: string, deviceId: string) => void;
  clearKeeperOverride: (groupId: string) => void;

  /** Typed "DELETE" confirmation text — the delete button is inert until
   * this equals the literal string "DELETE". */
  typedConfirmation: string;
  setTypedConfirmation: (value: string) => void;

  /** Per-session (not per-row) acknowledgment that unlocks corporate-Android
   * wipe-risk rows for this browser tab session. Resetting requires a new
   * session (store re-init), matching spec §8's "for the session" wording. */
  wipeRiskAcknowledged: boolean;
  acknowledgeWipeRisk: () => void;

  /** True once a delete can proceed: the confirmation text is exactly
   * "DELETE". Consumers should gate the delete button on this rather than
   * re-deriving the check. */
  canConfirmDelete: () => boolean;

  /** Called by useDeleteDevices on ADR-006 decline-fallback: clear the
   * typed confirmation so the admin has to re-type it to retry. */
  resetConfirmationAfterConsentDecline: () => void;
}

function isLockedForSelection(row: SelectableRowInfo, wipeRiskAcknowledged: boolean): boolean {
  if (row.role === 'keeper') return true;
  if (row.role === 'unresolved') return true;
  if (row.isWipeRisk && !wipeRiskAcknowledged) return true;
  return false;
}

export const useAppStore = create<AppState>((set, get) => ({
  filters: defaultFilters,
  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
  resetFilters: () => set({ filters: defaultFilters }),

  matchAcrossPlatforms: false,
  setMatchAcrossPlatforms: (value) => set({ matchAcrossPlatforms: value }),

  selectedIds: new Set<string>(),

  selectCandidate: (row) => {
    if (isLockedForSelection(row, get().wipeRiskAcknowledged)) return; // no-op: invalid transition
    set((state) => {
      const next = new Set(state.selectedIds);
      next.add(row.id);
      return { selectedIds: next };
    });
  },

  deselectCandidate: (id) => {
    set((state) => {
      if (!state.selectedIds.has(id)) return state;
      const next = new Set(state.selectedIds);
      next.delete(id);
      return { selectedIds: next };
    });
  },

  toggleCandidate: (row) => {
    if (get().selectedIds.has(row.id)) {
      get().deselectCandidate(row.id);
    } else {
      get().selectCandidate(row);
    }
  },

  selectAllStale: (rows) => {
    const wipeRiskAcknowledged = get().wipeRiskAcknowledged;
    set((state) => {
      const next = new Set(state.selectedIds);
      for (const row of rows) {
        if (isLockedForSelection(row, wipeRiskAcknowledged)) continue; // skip, never select-then-block
        next.add(row.id);
      }
      return { selectedIds: next };
    });
  },

  clearSelection: () => set({ selectedIds: new Set<string>() }),

  keeperOverrides: {},

  setKeeperOverride: (groupId, deviceId) => {
    get().deselectCandidate(deviceId); // can't be keeper and selected-for-deletion at once
    set((state) => ({ keeperOverrides: { ...state.keeperOverrides, [groupId]: deviceId } }));
  },

  clearKeeperOverride: (groupId) =>
    set((state) => {
      if (!(groupId in state.keeperOverrides)) return state;
      const next = { ...state.keeperOverrides };
      delete next[groupId];
      return { keeperOverrides: next };
    }),

  typedConfirmation: '',
  setTypedConfirmation: (value) => set({ typedConfirmation: value }),

  wipeRiskAcknowledged: false,
  acknowledgeWipeRisk: () => set({ wipeRiskAcknowledged: true }),

  canConfirmDelete: () => get().typedConfirmation === 'DELETE',

  resetConfirmationAfterConsentDecline: () => set({ typedConfirmation: '' }),
}));
