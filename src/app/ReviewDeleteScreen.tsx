// Review & delete screen (spec §9.1, §8): selection summary drawn from the
// Duplicates screen's selection state, live per-row status during
// sequential execution (C-10), and the confirm dialog gate (C-7).

import { useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useDuplicates } from '../features/duplicates/useDuplicates';
import { buildDeletionTargets, useDeleteDevices } from '../features/deletion/useDeleteDevices';
import { DeletionConfirmDialog } from '../features/deletion/DeletionConfirmDialog';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

const CAP_WARNING_THRESHOLD = 1000; // C-12: tenant-wide cap of 1,000 deletes/day

export function ReviewDeleteScreen() {
  const { groups, devicesById } = useDuplicates();
  const selectedIds = useAppStore((s) => s.selectedIds);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { state, statuses, consentError, runDeletion } = useDeleteDevices();

  const targets = useMemo(
    () => buildDeletionTargets(groups, selectedIds, devicesById),
    [groups, selectedIds, devicesById],
  );

  const isRunning = state === 'requesting-write-consent' || state === 'confirming-real-delete';

  if (targets.length === 0) {
    return (
      <div className="rounded-md border border-app-hairline bg-app-surface p-8 text-center text-sm text-app-ink/70">
        No records selected. Go to the Duplicates screen and select candidates to delete.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-app-ink/70">{targets.length} record(s) selected for review.</p>
        <Button onClick={() => setDialogOpen(true)}>Review &amp; delete</Button>
      </div>

      {targets.length >= CAP_WARNING_THRESHOLD && (
        <div role="alert" className="rounded-md border border-app-wipe/40 bg-app-wipe/5 p-3 text-sm">
          This selection is approaching or exceeds the tenant-wide cap of 1,000 delete actions per
          day (cumulative across the portal, bulk actions, and Graph). The app cannot know how many
          delete actions have already happened elsewhere today.
        </div>
      )}

      {consentError && (
        <div role="alert" className="rounded-md border border-app-delete/40 bg-app-delete/5 p-3 text-sm text-app-delete">
          {consentError}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-app-hairline bg-app-surface">
        <table className="w-full min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-app-hairline">
              <th className="px-3 py-2 font-semibold">Device</th>
              <th className="px-3 py-2 font-semibold">Consequence</th>
              <th className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.deviceId} className="border-b border-app-hairline last:border-0">
                <td className="px-3 py-2 font-mono-tabular">{t.deviceName}</td>
                <td className="px-3 py-2">
                  {t.isWipeRisk ? (
                    <Badge tone="wipe">Factory reset</Badge>
                  ) : (
                    <Badge tone="delete">Delete</Badge>
                  )}
                </td>
                <td className="px-3 py-2">{statuses[t.deviceId] ?? 'pending'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DeletionConfirmDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        targets={targets}
        isRunning={isRunning}
        onConfirm={() => {
          void runDeletion(targets);
        }}
      />
    </div>
  );
}
