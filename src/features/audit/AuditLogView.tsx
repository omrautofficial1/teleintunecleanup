// Session log display + CSV export (ADR-005, spec §8/§9.1).

import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { actionLabel, auditLogToCsv, getAuditLog } from '../deletion/auditLog';
import { listIntuneAuditEvents, type IntuneAuditEvent } from '../../api/auditEvents';
import { useAuth } from '../../auth/useAuth';
import { AUDIT_SCOPES } from '../../auth/msalConfig';

function downloadCsv(csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `telestar-intune-cleanup-audit-log-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function AuditLogView() {
  const { getAccessToken } = useAuth();
  const [log, setLog] = useState(() => getAuditLog());
  const [intuneEvents, setIntuneEvents] = useState<IntuneAuditEvent[]>([]);
  const [auditState, setAuditState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [auditError, setAuditError] = useState<string | null>(null);

  const refresh = () => setLog(getAuditLog());

  const loadIntuneEvents = async () => {
    setAuditState('loading');
    setAuditError(null);
    try {
      const events = await listIntuneAuditEvents({ getAccessToken: () => getAccessToken(AUDIT_SCOPES) });
      setIntuneEvents(events);
      setAuditState('ready');
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : 'Intune audit events could not be loaded.');
      setAuditState('error');
    }
  };

  if (log.length === 0) {
    return (
      <div className="space-y-4">
        <div className="border border-app-hairline bg-app-surface p-8 text-center text-sm text-app-ink/70 shadow-sm">
          No actions recorded yet this session.
        </div>
        <Button variant="secondary" onClick={refresh}>Refresh local log</Button>
        <AuditEventsPanel events={intuneEvents} state={auditState} error={auditError} onLoad={loadIntuneEvents} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-app-ink/70">{log.length} action(s) recorded this session.</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={refresh}>
            Refresh
          </Button>
          <Button onClick={() => downloadCsv(auditLogToCsv(log))}>Download CSV</Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border border-app-hairline bg-app-surface">
        <table className="w-full min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-app-hairline">
              <th className="px-3 py-2 font-semibold">Device</th>
              <th className="px-3 py-2 font-semibold">Serial</th>
              <th className="px-3 py-2 font-semibold">Matched on</th>
              <th className="px-3 py-2 font-semibold">Action</th>
              <th className="px-3 py-2 font-semibold">Outcome</th>
              <th className="px-3 py-2 font-semibold">Timestamp</th>
              <th className="px-3 py-2 font-semibold">Full device data</th>
            </tr>
          </thead>
          <tbody>
            {log.map((entry, i) => (
              <tr key={`${entry.timestamp}-${i}`} className="border-b border-app-hairline last:border-0">
                <td className="px-3 py-2 font-mono-tabular">{entry.deviceName}</td>
                <td className="px-3 py-2 font-mono-tabular">{entry.serialNumber ?? '—'}</td>
                <td className="px-3 py-2">{entry.matchedOn}</td>
                <td className="px-3 py-2">{actionLabel(entry.action)}</td>
                <td className="px-3 py-2">{entry.outcome}</td>
                <td className="px-3 py-2">{new Date(entry.timestamp).toLocaleString()}</td>
                <td className="px-3 py-2">
                  <details>
                    <summary className="cursor-pointer text-[var(--color-brand-primary)]">View snapshot</summary>
                    <dl className="mt-2 grid min-w-[520px] grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {Object.entries(entry.deviceSnapshot ?? {}).map(([field, value]) => (
                        <div key={field}>
                          <dt className="font-semibold text-app-ink/55">{field}</dt>
                          <dd className="font-mono-tabular">{String(value ?? '—')}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AuditEventsPanel events={intuneEvents} state={auditState} error={auditError} onLoad={loadIntuneEvents} />
    </div>
  );
}

function AuditEventsPanel({
  events,
  state,
  error,
  onLoad,
}: {
  events: IntuneAuditEvent[];
  state: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  onLoad: () => void;
}) {
  return (
    <section className="border border-app-hairline bg-app-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Microsoft Intune audit events</h2>
          <p className="mt-1 text-xs text-app-ink/60">Historical events are loaded from Microsoft Graph, not this browser session.</p>
        </div>
        <Button variant="secondary" onClick={() => void onLoad()} disabled={state === 'loading'}>
          {state === 'loading' ? 'Loading audit events...' : 'Load Intune history'}
        </Button>
      </div>
      {error && <p role="alert" className="mt-3 bg-app-delete/5 p-3 text-sm text-app-delete">{error}</p>}
      {state === 'ready' && events.length === 0 && <p className="mt-4 text-sm text-app-ink/60">No Intune audit events were returned.</p>}
      {events.length > 0 && (
        <div className="mt-4 max-h-80 overflow-auto border border-app-hairline">
          <table className="min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 bg-app-surface"><tr className="border-b border-app-hairline">
              <th className="px-3 py-2">Time</th><th className="px-3 py-2">Activity</th><th className="px-3 py-2">Actor</th><th className="px-3 py-2">Resource</th>
            </tr></thead>
            <tbody>{events.map((event) => <tr key={event.id} className="border-b border-app-hairline">
              <td className="px-3 py-2 whitespace-nowrap">{new Date(event.activityDateTime).toLocaleString()}</td>
              <td className="px-3 py-2">{event.displayName || event.activityType || event.activity}</td>
              <td className="px-3 py-2">{event.actor?.userPrincipalName ?? event.actor?.userId ?? '—'}</td>
              <td className="px-3 py-2">{event.resources?.map((resource) => resource.resourceName ?? resource.resourceId).filter(Boolean).join(', ') || '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
