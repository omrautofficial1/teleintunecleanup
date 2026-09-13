// Typed "DELETE" requirement, consequence-split messaging (spec §8: "12
// records will retire, 3 will factory reset"). The confirm button is inert
// (disabled, and the store no-ops on the underlying action) until "DELETE"
// is typed exactly.

import { useMemo } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useAppStore } from '../../store/appStore';
import type { DeletionTarget } from './useDeleteDevices';

export interface DeletionConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  targets: DeletionTarget[];
  onConfirm: () => void;
  isRunning: boolean;
}

export function DeletionConfirmDialog({
  open,
  onClose,
  targets,
  onConfirm,
  isRunning,
}: DeletionConfirmDialogProps) {
  const typedConfirmation = useAppStore((s) => s.typedConfirmation);
  const setTypedConfirmation = useAppStore((s) => s.setTypedConfirmation);
  const canConfirmDelete = useAppStore((s) => s.canConfirmDelete);

  const { retireCount, wipeCount } = useMemo(() => {
    let retire = 0;
    let wipe = 0;
    for (const t of targets) {
      if (t.isWipeRisk) wipe += 1;
      else retire += 1;
    }
    return { retireCount: retire, wipeCount: wipe };
  }, [targets]);

  const buttonLabel = `Delete ${targets.length} record(s)`;

  const canConfirm = canConfirmDelete();

  return (
    <Modal open={open} onClose={onClose} title="Confirm deletion">
      <div className="space-y-4 text-sm">
        <p>
          {retireCount} record(s) will be deleted, {wipeCount} will factory reset.
        </p>

        <div>
          <label htmlFor="delete-confirm-text" className="mb-1 block font-medium">
            Type DELETE to confirm
          </label>
          <input
            id="delete-confirm-text"
            type="text"
            value={typedConfirmation}
            onChange={(e) => setTypedConfirmation(e.target.value)}
            className="w-full rounded-md border border-app-hairline px-2 py-1.5"
            autoComplete="off"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isRunning}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!canConfirm || isRunning || targets.length === 0}
          >
            {buttonLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
