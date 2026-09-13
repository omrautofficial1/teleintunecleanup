// Sequential (not batched) delete execution with live per-row status
// (C-10), incremental write-consent trigger (spec §5), and ADR-006
// decline-fallback (abort + clear the typed confirmation so a retry
// requires re-typing it). This hook is the one place that decides whether
// a Graph DELETE call is ever issued.

import { useCallback, useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import { deleteManagedDevice } from '../../api/devices';
import { useAppStore } from '../../store/appStore';
import { isWipeRiskDevice } from '../devices/deviceRisk';
import { appendAuditLogEntry } from './auditLog';
import type { DuplicateGroup } from '../duplicates/duplicateEngine';
import type { RawGraphDevice } from '../../api/types';

export type RowDeleteStatus = 'pending' | 'deleting' | 'done' | 'failed';

export interface DeletionTarget {
  deviceId: string;
  deviceName: string;
  serialNumber: string | null;
  imei: string | null;
  matchedOn: string;
  lastSyncDateTime: string;
  isWipeRisk: boolean;
  deviceSnapshot: RawGraphDevice;
}

export type DeletionState =
  | 'idle'
  | 'requesting-write-consent'
  | 'confirming-real-delete'
  | 'consent-declined';

export function buildDeletionTargets(
  groups: DuplicateGroup[],
  selectedIds: Set<string>,
  devicesById: Map<string, RawGraphDevice>,
): DeletionTarget[] {
  const targets: DeletionTarget[] = [];
  for (const group of groups) {
    if (group.status !== 'actionable') continue;
    for (const member of group.members) {
      if (
        member.role !== 'candidate' ||
        !member.deletable ||
        !selectedIds.has(member.device.id)
      ) continue;
      const fullDevice = devicesById.get(member.device.id);
      if (!fullDevice) continue;
      targets.push({
        deviceId: member.device.id,
        deviceName: member.device.deviceName,
        serialNumber: member.device.serialNumber,
        imei: member.device.imei,
        matchedOn: group.matchedOn.join('+'),
        lastSyncDateTime: member.device.lastSyncDateTime,
        isWipeRisk: isWipeRiskDevice(fullDevice),
        deviceSnapshot: fullDevice,
      });
    }
  }
  return targets;
}

export function useDeleteDevices() {
  const { getReadToken, requestWriteConsent } = useAuth();
  const canConfirmDelete = useAppStore((s) => s.canConfirmDelete);
  const resetConfirmationAfterConsentDecline = useAppStore(
    (s) => s.resetConfirmationAfterConsentDecline,
  );
  const clearSelection = useAppStore((s) => s.clearSelection);

  const [state, setState] = useState<DeletionState>('idle');
  const [statuses, setStatuses] = useState<Record<string, RowDeleteStatus>>({});
  const [consentError, setConsentError] = useState<string | null>(null);

  const runDeletion = useCallback(
    async (targets: DeletionTarget[]) => {
      setConsentError(null);

      if (!canConfirmDelete()) {
        // Should be structurally unreachable (button gated on this), but
        // guard anyway — zero Graph calls without a confirmed transition.
        return;
      }

      // C-10: sequential execution with live per-row status. Incremental
      // consent is requested once, before the first real DELETE.
      setState('requesting-write-consent');
      let writeToken: string;
      try {
        writeToken = await requestWriteConsent();
      } catch {
        // ADR-006: abort, zero DELETE calls issued, clear the typed
        // confirmation so a retry requires re-typing it, surface a named
        // error distinct from a generic auth failure.
        resetConfirmationAfterConsentDecline();
        setConsentError(
          'Write access was not granted. Real deletion is unavailable until write consent is granted.',
        );
        setState('consent-declined');
        return;
      }

      setState('confirming-real-delete');
      const nextStatuses: Record<string, RowDeleteStatus> = {};
      for (const target of targets) {
        nextStatuses[target.deviceId] = 'pending';
      }
      setStatuses({ ...nextStatuses });

      for (const target of targets) {
        nextStatuses[target.deviceId] = 'deleting';
        setStatuses({ ...nextStatuses });
        try {
          await deleteManagedDevice(target.deviceId, {
            getAccessToken: async () => writeToken,
            refreshAccessToken: getReadToken,
          });
          nextStatuses[target.deviceId] = 'done';
          appendAuditLogEntry({
            deviceId: target.deviceId,
            deviceName: target.deviceName,
            serialNumber: target.serialNumber,
            imei: target.imei,
            matchedOn: target.matchedOn,
            previousLastSync: target.lastSyncDateTime,
            action: target.isWipeRisk ? 'factory-reset' : 'retire',
            timestamp: new Date().toISOString(),
            outcome: 'success',
            deviceSnapshot: target.deviceSnapshot,
          });
        } catch {
          nextStatuses[target.deviceId] = 'failed';
          appendAuditLogEntry({
            deviceId: target.deviceId,
            deviceName: target.deviceName,
            serialNumber: target.serialNumber,
            imei: target.imei,
            matchedOn: target.matchedOn,
            previousLastSync: target.lastSyncDateTime,
            action: target.isWipeRisk ? 'factory-reset' : 'retire',
            timestamp: new Date().toISOString(),
            outcome: 'failed',
            deviceSnapshot: target.deviceSnapshot,
          });
        }
        setStatuses({ ...nextStatuses });
      }

      setState('idle');
      clearSelection();
    },
    [
      canConfirmDelete,
      requestWriteConsent,
      resetConfirmationAfterConsentDecline,
      getReadToken,
      clearSelection,
    ],
  );

  return { state, statuses, consentError, runDeletion };
}
