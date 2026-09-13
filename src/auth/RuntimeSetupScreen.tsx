import { useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { validateRuntimeAuthConfig, type RuntimeAuthConfig } from './msalConfig';

interface RuntimeSetupScreenProps {
    initialConfig: RuntimeAuthConfig | null;
    onConfigured: (config: RuntimeAuthConfig, remember: boolean) => void;
}

export function RuntimeSetupScreen({ initialConfig, onConfigured }: RuntimeSetupScreenProps) {
    const [clientId, setClientId] = useState(initialConfig?.clientId ?? '');
    const [tenantId, setTenantId] = useState(initialConfig?.tenantId ?? '');
    const [remember, setRemember] = useState(Boolean(initialConfig));
    const [error, setError] = useState<string | null>(null);

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const config = { clientId: clientId.trim(), tenantId: tenantId.trim() };
        const validationError = validateRuntimeAuthConfig(config);
        if (validationError) {
            setError(validationError);
            return;
        }
        setError(null);
        onConfigured(config, remember);
    }

    return (
        <main className="min-h-screen bg-app-background px-6 py-12">
            <section className="mx-auto max-w-xl rounded-md border border-app-hairline bg-app-surface p-8 shadow-sm">
                <div className="mb-8 flex items-center gap-3" aria-label="Microsoft Intune">
                    <img src="/intune-logo.svg" alt="Microsoft Intune" className="h-10 w-10" />
                    <span className="text-lg font-semibold tracking-tight">Intune</span>
                </div>
                <p className="text-sm font-semibold uppercase tracking-wide text-app-keeper">Step 1 of 2</p>
                <h1 className="mt-3 text-3xl font-semibold text-app-ink">Connect your Microsoft tenant</h1>
                <p className="mt-3 text-sm leading-6 text-app-ink/70">
                    Enter the app registration details supplied by your Entra administrator. They are used
                    only in this browser to start delegated Microsoft Graph authentication.
                </p>
                <form className="mt-8 space-y-5" onSubmit={submit}>
                    <label className="block text-left text-sm font-medium">
                        Application (client) ID
                        <input value={clientId} onChange={(event) => setClientId(event.target.value)}
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off"
                            className="mt-2 w-full rounded-md border border-app-hairline bg-white px-3 py-2 font-mono-tabular text-sm outline-none focus:border-app-ink" />
                    </label>
                    <label className="block text-left text-sm font-medium">
                        Directory (tenant) ID
                        <input value={tenantId} onChange={(event) => setTenantId(event.target.value)}
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off"
                            className="mt-2 w-full rounded-md border border-app-hairline bg-white px-3 py-2 font-mono-tabular text-sm outline-none focus:border-app-ink" />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-app-ink/75">
                        <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                        Remember these IDs on this browser
                    </label>
                    {error && <p role="alert" className="rounded-md bg-app-delete/5 p-3 text-sm text-app-delete">{error}</p>}
                    <Button type="submit">Continue to Microsoft sign-in</Button>
                </form>
                <p className="mt-6 text-xs leading-5 text-app-ink/55">
                    These IDs are not passwords. Never enter a client secret. The Entra app must be a SPA
                    with this site registered as its redirect URI.
                </p>
            </section>
        </main>
    );
}