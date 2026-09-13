import { useDuplicates } from './useDuplicates';
import { useAppStore, type SelectableRowInfo } from '../../store/appStore';
import { DuplicateGroupCard } from './DuplicateGroupCard';
import { Button } from '../../components/ui/Button';
import { isWipeRiskDevice } from '../devices/deviceRisk';

/** Duplicates screen (spec §9.1, §9.3): inventory reduced to detected
 * groups, keeper anchored above candidates, plus "select all stale" (spec
 * §9.3 — skips locked/wipe-risk and non-actionable rows). */
export function DuplicateGroupList() {
  const { groups, devicesById, isLoading, isError } = useDuplicates();
  const selectAllStale = useAppStore((s) => s.selectAllStale);

  if (isError) {
    return (
      <div role="alert" className="rounded-md border border-app-delete/40 bg-app-delete/5 p-6 text-sm text-app-delete">
        Failed to run duplicate detection — the device inventory could not be loaded.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" className="rounded-md border border-app-hairline bg-app-surface p-8 text-center text-sm text-app-ink/70">
        Detecting duplicates…
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-app-hairline bg-app-surface p-8 text-center text-sm text-app-ink/70">
        No duplicate devices detected.
      </div>
    );
  }

  const handleSelectAllStale = () => {
    const rows: SelectableRowInfo[] = groups.flatMap((group) =>
      group.members
        .filter((m) => m.role === 'candidate' && m.deletable)
        .map((m) => {
          const fullDevice = devicesById.get(m.device.id);
          return {
            id: m.device.id,
            role: m.role,
            isWipeRisk: fullDevice ? isWipeRiskDevice(fullDevice) : false,
          };
        }),
    );
    selectAllStale(rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-app-ink/70">{groups.length} duplicate device group(s) detected.</p>
        <Button variant="secondary" onClick={handleSelectAllStale}>
          Select all stale
        </Button>
      </div>
      {groups.map((group) => (
        <DuplicateGroupCard key={group.id} group={group} devicesById={devicesById} />
      ))}
    </div>
  );
}
