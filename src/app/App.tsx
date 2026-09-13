import { InteractionStatus } from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AuthProvider } from '../auth/AuthProvider';
import { useAuth } from '../auth/useAuth';
import { SignInScreen } from './SignInScreen';
import { InventoryScreen } from './InventoryScreen';
import { DuplicateGroupList } from '../features/duplicates/DuplicateGroupList';
import { ReviewDeleteScreen } from './ReviewDeleteScreen';
import { AuditLogView } from '../features/audit/AuditLogView';
import { Button } from '../components/ui/Button';
import { useDevices } from '../features/devices/useDevices';
import { useDuplicates } from '../features/duplicates/useDuplicates';
import { AUTH_REDIRECT_PENDING_KEY } from '../auth/authConstants';
import { clearRuntimeAuthConfig } from '../auth/authConstants';
import { BrandMark } from '../components/ui/BrandMark';

const queryClient = new QueryClient();

type Screen = 'inventory' | 'duplicates' | 'review' | 'audit';

const SCREENS: { id: Screen; label: string }[] = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'duplicates', label: 'Duplicates' },
  { id: 'review', label: 'Review & delete' },
  { id: 'audit', label: 'Audit log' },
];

function AppShell() {
  const { account, signOut } = useAuth();
  const { devices } = useDevices();
  const { groups } = useDuplicates();
  const [screen, setScreen] = useState<Screen>('inventory');
  const staleCount = groups.reduce(
    (count, group) => count + group.members.filter((member) => member.role === 'candidate' && member.deletable).length,
    0,
  );

  return (
    <div className="min-h-screen bg-app-background">
      <header className="border-b border-app-hairline bg-app-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-5">
            <BrandMark />
            <span className="hidden h-6 w-px bg-app-hairline sm:block" />
            <div>
              <h1 className="text-base font-semibold">Intune Device Cleanup</h1>
              <p className="text-xs text-app-ink/60">
                {account?.username ? account.username : 'for Microsoft Intune'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={() => void signOut()}>Sign out</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            {/* UI/UX fix (Phase 2): this label was borrowed from the
                keeper-role green, which the design tokens explicitly
                reserve for device-role status, not decoration (see
                styles/tokens.css). It now uses the brand accent instead. */}
            <p className="text-xs font-semibold tracking-wide" style={{ color: 'var(--color-brand-primary)' }}>Device management</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Duplicate device cleanup</h2>
            <p className="mt-1 text-sm text-app-ink/65">Review stale Intune records before removing them.</p>
          </div>
        </div>

        <nav className="mb-6 flex flex-wrap gap-1 border-b border-app-hairline" aria-label="Screens">
          {SCREENS.map((s) => (
            <button key={s.id} type="button" onClick={() => setScreen(s.id)} aria-current={screen === s.id ? 'page' : undefined}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${screen === s.id ? 'border-[var(--color-brand-accent)] text-[var(--color-brand-primary)]' : 'border-transparent text-app-ink/65 hover:border-app-hairline hover:text-app-ink'}`}>
              {s.label}
            </button>
          ))}
        </nav>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Managed devices', value: devices?.length ?? '—', hint: 'Current inventory' },
            { label: 'Duplicate device Identified', value: groups.length, hint: 'Needs review' },
            { label: 'Stale Devices', value: staleCount, hint: 'Eligible for review' },
          ].map((metric) => (
            <div key={metric.label} className="border border-app-hairline bg-app-surface p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-app-ink/55">{metric.label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{metric.value}</p>
              <p className="mt-1 text-xs text-app-ink/55">{metric.hint}</p>
            </div>
          ))}
        </div>

        <main>
          {screen === 'inventory' && <InventoryScreen />}
          {screen === 'duplicates' && <DuplicateGroupList />}
          {screen === 'review' && <ReviewDeleteScreen />}
          {screen === 'audit' && <AuditLogView />}
        </main>
      </div>
    </div>
  );
}

function GraphAccessGate() {
  const { account, getReadToken, signOut } = useAuth();
  const [state, setState] = useState<'checking' | 'ready' | 'error'>('checking');
  const [error, setError] = useState('');

  function changeConfiguration() {
    clearRuntimeAuthConfig();
    window.location.reload();
  }

  useEffect(() => {
    let cancelled = false;
    setState('checking');
    setError('');

    void getReadToken()
      .then((token) =>
        fetch(
          'https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$top=1&$select=id',
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      )
      .then(async (response) => {
        if (response.ok) return;
        const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message || `Microsoft Graph returned HTTP ${response.status}.`);
      })
      .then(() => {
        if (!cancelled) setState('ready');
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Microsoft Graph access could not be verified.');
          setState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getReadToken]);

  if (state === 'checking') {
    return <div className="mx-auto mt-24 max-w-xl rounded-md border border-app-hairline bg-app-surface p-8 text-center">Verifying Intune access for {account?.username}...</div>;
  }

  if (state === 'error') {
    return (
      <div className="mx-auto mt-24 max-w-xl space-y-4 rounded-md border border-app-delete/40 bg-app-surface p-8">
        <h1 className="text-xl font-semibold">Intune access is required</h1>
        <p className="text-sm text-app-ink/70">The dashboard is locked until this account can read Intune managed devices.</p>
        <p role="alert" className="rounded-md bg-app-delete/5 p-4 text-sm text-app-delete">{error}</p>
        <p className="text-sm text-app-ink/70">Ask an administrator to grant DeviceManagementManagedDevices.Read.All consent and confirm that Intune is provisioned for this tenant.</p>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={changeConfiguration}>Change configuration</Button>
          <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </div>
    );
  }

  return <AppShell />;
}

function AuthenticatedRouter() {
  const { accounts, inProgress } = useMsal();
  const [restorationTimedOut, setRestorationTimedOut] = useState(false);
  const redirectPending = sessionStorage.getItem(AUTH_REDIRECT_PENDING_KEY) === 'true';

  useEffect(() => {
    if (accounts.length > 0) {
      sessionStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
      return;
    }
    if (!redirectPending) return;
    const timeout = window.setTimeout(() => setRestorationTimedOut(true), 5000);
    return () => window.clearTimeout(timeout);
  }, [accounts.length, redirectPending]);

  if (inProgress !== InteractionStatus.None || (redirectPending && accounts.length === 0 && !restorationTimedOut)) {
    return <div className="mx-auto mt-24 max-w-xl border border-app-hairline bg-app-surface p-8 text-center shadow-sm">Restoring your Microsoft sign-in...</div>;
  }
  if (accounts.length > 0) return <GraphAccessGate />;
  return <SignInScreen />;
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <AuthenticatedRouter />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
