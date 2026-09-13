// MsalProvider wrapper. Nothing else in the app talks to MSAL directly —
// see solution-strategy.md decomposition: only auth/ imports @azure/msal-*.
//
// After initialize() resolves, MSAL requires a call to
// handleRedirectPromise() before anything reads getAllAccounts()/the
// useMsal() account state — that call is what consumes the `#code=...`
// response sitting in the URL fragment after a loginRedirect() round-trip
// and clears MSAL's own `interaction_in_progress` sessionStorage flag.
// Skipping it leaves the redirect leg permanently unresolved: the UI never
// leaves SignInScreen, and every subsequent sign-in attempt throws
// BrowserAuthError: interaction_in_progress because the flag is never
// cleared. See task t_50fe4eeb for the full failure trace.

import { MsalProvider } from '@azure/msal-react';
import { useEffect, useState, type ReactNode } from 'react';
import { RuntimeSetupScreen } from './RuntimeSetupScreen';
import {
  createMsalInstance,
  validateRuntimeAuthConfig,
  type RuntimeAuthConfig,
} from './msalConfig';
import { ACTIVE_AUTH_CONFIG_KEY, AUTH_CONFIG_KEY } from './authConstants';

function readStoredConfig(): RuntimeAuthConfig | null {
  try {
    const raw = localStorage.getItem(AUTH_CONFIG_KEY) ?? sessionStorage.getItem(ACTIVE_AUTH_CONFIG_KEY);
    const config = raw ? (JSON.parse(raw) as RuntimeAuthConfig) : null;
    return config && !validateRuntimeAuthConfig(config) ? config : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RuntimeAuthConfig | null>(() => readStoredConfig());
  const [instance, setInstance] = useState<ReturnType<typeof createMsalInstance> | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!config) {
      setInstance(null);
      setInitialized(false);
      return;
    }

    const nextInstance = createMsalInstance(config);
    let cancelled = false;
    setInstance(nextInstance);
    setInitialized(false);
    nextInstance
      .initialize()
      .then(() => nextInstance.handleRedirectPromise())
      .then((result) => {
        const account = result?.account ?? nextInstance.getAllAccounts()[0];
        if (account) {
          nextInstance.setActiveAccount(account);
        }
      })
      .catch((err: unknown) => {
        // A failed/expired redirect response (e.g. stale hash, replayed
        // code) should not crash the app — surface it and let the user
        // land on SignInScreen to retry, but don't silently swallow it.
        console.error('MSAL redirect handling failed', err);
      })
      .finally(() => {
        if (!cancelled) setInitialized(true);
      });
    return () => {
      cancelled = true;
    };
  }, [config]);

  function configure(nextConfig: RuntimeAuthConfig, remember: boolean) {
    sessionStorage.setItem(ACTIVE_AUTH_CONFIG_KEY, JSON.stringify(nextConfig));
    if (remember) localStorage.setItem(AUTH_CONFIG_KEY, JSON.stringify(nextConfig));
    else localStorage.removeItem(AUTH_CONFIG_KEY);
    setConfig(nextConfig);
  }

  if (!config || !instance) {
    return <RuntimeSetupScreen initialConfig={config} onConfigured={configure} />;
  }

  if (!initialized) return null;

  return <MsalProvider instance={instance}>{children}</MsalProvider>;
}
