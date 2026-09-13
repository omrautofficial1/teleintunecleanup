// C-8, C-9: this is the component that makes the architecture's safety
// invariant real. Keeper rows get NO <Checkbox> in the render tree — the
// JSX simply never mounts one for role === 'keeper', not a disabled one.
// Locked (wipe-risk, unacknowledged) rows DO render a checkbox but the
// store's selectCandidate no-ops if clicked (ADR-004) — belt and braces,
// but the DOM-absence guarantee for keepers is the one C-8 actually tests.

import type { DuplicateGroup, GroupMember } from './duplicateEngine';
import type { RawGraphDevice } from '../../api/types';
import { isWipeRiskDevice } from '../devices/deviceRisk';
import { useAppStore, type SelectableRowInfo } from '../../store/appStore';
import { Badge } from '../../components/ui/Badge';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/Button';
import { useState } from 'react';

export interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  devicesById: Map<string, RawGraphDevice>;
}

function describeGroup(group: DuplicateGroup, devicesById: Map<string, RawGraphDevice>) {
  const keeper = group.members.find((m) => m.role === 'keeper') ?? group.members[0];
  const keeperDevice = keeper.device;

  const users = new Set(
    group.members
      .map((m) => devicesById.get(m.device.id)?.userPrincipalName)
      .filter((u): u is string => Boolean(u)),
  );
  const userLabel = users.size === 0 ? '—' : users.size === 1 ? [...users][0] : 'Multiple users';

  const identifierSummary = group.matchedOn
    .map((field) => {
      const value =
        field === 'serial' ? keeperDevice.serialNumber
        : field === 'imei' ? keeperDevice.imei
        : keeperDevice.meid;
      return value ? `${field.toUpperCase()} ${value}` : null;
    })
    .filter(Boolean)
    .join(' · ');

  return { title: keeperDevice.deviceName, userLabel, identifierSummary };
}

function statusBadge(status: DuplicateGroup['status']) {
  switch (status) {
    case 'actionable':
      return null;
    case 'too-close-to-call':
      return <Badge tone="neutral">Too close to call — manual review</Badge>;
    case 'over-size-ceiling':
      return <Badge tone="neutral">Report only — group exceeds size ceiling</Badge>;
  }
}

function MemberRow({
  member,
  group,
  fullDevice,
  isOverridden,
}: {
  member: GroupMember;
  group: DuplicateGroup;
  fullDevice: RawGraphDevice | undefined;
  isOverridden: boolean;
}) {
  const selectedIds = useAppStore((s) => s.selectedIds);
  const toggleCandidate = useAppStore((s) => s.toggleCandidate);
  const wipeRiskAcknowledged = useAppStore((s) => s.wipeRiskAcknowledged);
  const setKeeperOverride = useAppStore((s) => s.setKeeperOverride);
  const clearKeeperOverride = useAppStore((s) => s.clearKeeperOverride);

  const wipeRisk = fullDevice ? isWipeRiskDevice(fullDevice) : false;
  const isSelected = selectedIds.has(member.device.id);
  const locked = wipeRisk && !wipeRiskAcknowledged;

  const rowInfo: SelectableRowInfo = {
    id: member.device.id,
    role: member.role,
    isWipeRisk: wipeRisk,
  };

  const isKeeper = member.role === 'keeper';

  return (
    <div
      data-testid={`member-row-${member.device.id}`}
      className={`flex items-center gap-3 border-l-4 py-2 pl-3 ${isKeeper
        ? 'border-app-keeper bg-app-keeper/5'
        : wipeRisk
          ? 'border-app-wipe bg-app-wipe/5'
          : 'border-app-hairline'
        }`}
    >
      {/* C-8: no Checkbox is rendered at all for a keeper role — not
          disabled, absent from the render tree entirely. */}
      {!isKeeper && (
        <Checkbox
          label={`Select ${member.device.deviceName} for deletion`}
          checked={isSelected}
          disabled={member.role === 'unresolved'}
          onChange={() => toggleCandidate(rowInfo)}
        />
      )}

      <div className="flex-1">
        <div className="flex items-center gap-2 font-mono-tabular text-sm">
          <span>{member.device.deviceName}</span>
          {isKeeper && <Badge tone="keeper">Keeper</Badge>}
          {isKeeper && isOverridden && <Badge tone="info">Manually assigned</Badge>}
          {wipeRisk && (
            <Badge tone="wipe">
              {locked ? 'Factory-reset risk — locked' : 'Factory-reset risk'}
            </Badge>
          )}
          {!isKeeper && member.role === 'candidate' && member.deletable && (
            <Badge tone="info">Stale login candidate</Badge>
          )}
          {isKeeper && isOverridden && (
            <Button variant="primary" onClick={() => clearKeeperOverride(group.id)}>
              Reset to automatic
            </Button>
          )}
          {!isKeeper && member.role === 'candidate' && (
            <Button
              variant="primary"
              onClick={() => setKeeperOverride(group.id, member.device.id)}
            >
              Make keeper
            </Button>
          )}
        </div>
        <div className="text-xs text-app-ink/60">
          Last sync {new Date(member.device.lastSyncDateTime).toLocaleString()} · Matched on{' '}
          {group.matchedOn.join(', ')}
        </div>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-app-ink/70 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="font-semibold text-app-ink/50">Serial</dt><dd className="font-mono-tabular">{member.device.serialNumber ?? '—'}</dd></div>
          <div><dt className="font-semibold text-app-ink/50">IMEI</dt><dd className="font-mono-tabular">{member.device.imei ?? '—'}</dd></div>
          <div><dt className="font-semibold text-app-ink/50">OS / version</dt><dd>{member.device.operatingSystem} {fullDevice?.osVersion || '—'}</dd></div>
          <div><dt className="font-semibold text-app-ink/50">Model</dt><dd>{fullDevice?.model || '—'}</dd></div>
          <div><dt className="font-semibold text-app-ink/50">User</dt><dd>{fullDevice?.userPrincipalName ?? '—'}</dd></div>
          <div><dt className="font-semibold text-app-ink/50">Management</dt><dd>{member.device.managementAgent}</dd></div>
          <div><dt className="font-semibold text-app-ink/50">State</dt><dd>{fullDevice?.managementState ?? '—'}</dd></div>
          <div><dt className="font-semibold text-app-ink/50">Compliance</dt><dd>{member.device.complianceState}</dd></div>
        </dl>
      </div>
    </div>
  );
}

export function DuplicateGroupCard({ group, devicesById }: DuplicateGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const acknowledgeWipeRisk = useAppStore((s) => s.acknowledgeWipeRisk);
  const wipeRiskAcknowledged = useAppStore((s) => s.wipeRiskAcknowledged);
  const isOverridden = useAppStore((s) => Boolean(s.keeperOverrides[group.id]));

  const keeper = group.members.find((m) => m.role === 'keeper');
  const others = group.members.filter((m) => m.role !== 'keeper');
  const hasWipeRiskMember = group.members.some((m) => {
    const fullDevice = devicesById.get(m.device.id);
    return fullDevice ? isWipeRiskDevice(fullDevice) : false;
  });
  const { title, userLabel, identifierSummary } = describeGroup(group, devicesById);

  return (
    <article className="border border-app-hairline bg-app-surface shadow-sm">
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-[#f7fafc]">
        <div>
          <div className="font-mono-tabular text-base font-semibold">{title}</div>
          <p className="mt-1 text-xs text-app-ink/60">
            User {userLabel} · {identifierSummary} · {group.members.length} records
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge(group.status)}
          {group.warnings.map((w) => (
            <Badge key={w} tone="info">
              {w.replace(/-/g, ' ')}
            </Badge>
          ))}
          <span className="ml-2 text-lg text-app-ink/50" aria-hidden="true">{expanded ? '−' : '+'}</span>
        </div>
      </button>

      {expanded && <div className="border-t border-app-hairline p-4">

        {hasWipeRiskMember && !wipeRiskAcknowledged && (
          <div className="mb-3 rounded-md border border-app-wipe/40 bg-app-wipe/5 p-3 text-sm">
            <Checkbox
              label="I understand this will factory-reset these corporate-owned Android devices"
              checked={wipeRiskAcknowledged}
              onChange={() => acknowledgeWipeRisk()}
            />
          </div>
        )}

        <div className="space-y-1">
          {keeper && (
            <MemberRow
              member={keeper}
              group={group}
              fullDevice={devicesById.get(keeper.device.id)}
              isOverridden={isOverridden}
            />
          )}
          {others.map((member) => (
            <MemberRow
              key={member.device.id}
              member={member}
              group={group}
              fullDevice={devicesById.get(member.device.id)}
              isOverridden={isOverridden}
            />
          ))}
        </div>
      </div>}
    </article>
  );
}
