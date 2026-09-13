// Regression test for the bug in task t_50fe4eeb: AuthProvider must call
// msalInstance.handleRedirectPromise() after initialize() resolves, and
// must not render children (and thus anything reading useMsal()'s account
// state) until that promise has settled — otherwise a pending redirect
// response (`#code=...` in the URL) is never consumed and the app is
// stuck on SignInScreen forever.
//
// Scope note: MsalProvider (from @azure/msal-react) is mocked out to a
// dumb pass-through here. Faithfully driving msal-react's internal
// account-sync machinery (event callbacks, getAllAccounts()) from a fake
// PublicClientApplication is brittle and duplicates msal-react's own test
// suite; what actually regressed, and what this test pins down, is
// AuthProvider's own effect: does it await handleRedirectPromise() before
// flipping to `initialized`, in the right order, and without getting
// stuck if that promise rejects.

import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const initialize = vi.fn();
const handleRedirectPromise = vi.fn();
const getAllAccounts = vi.fn();
const setActiveAccount = vi.fn();
const msalInstance = { initialize, handleRedirectPromise, getAllAccounts, setActiveAccount };

vi.mock('./msalConfig', () => ({
  createMsalInstance: () => msalInstance,
  validateRuntimeAuthConfig: () => null,
}));

vi.mock('@azure/msal-react', () => ({
  MsalProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Import after the mocks so AuthProvider picks up the mocked module.
const { AuthProvider } = await import('./AuthProvider');

beforeEach(() => {
  initialize.mockReset();
  handleRedirectPromise.mockReset();
  getAllAccounts.mockReset().mockReturnValue([]);
  setActiveAccount.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(
    'intune-cleanup.auth-config',
    JSON.stringify({
      clientId: '11111111-1111-4111-8111-111111111111',
      tenantId: '22222222-2222-4222-8222-222222222222',
    }),
  );
});

describe('AuthProvider — consumes the redirect response before rendering', () => {
  it('calls handleRedirectPromise() after initialize() resolves, before rendering children', async () => {
    let resolveInitialize!: () => void;
    let resolveRedirect!: (value?: unknown) => void;
    initialize.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveInitialize = resolve;
      }),
    );
    handleRedirectPromise.mockReturnValue(
      new Promise((resolve) => {
        resolveRedirect = resolve;
      }),
    );

    render(
      <AuthProvider>
        <div>signed-in content</div>
      </AuthProvider>,
    );

    // Nothing renders while initialize() is still pending.
    expect(screen.queryByText('signed-in content')).toBeNull();
    expect(handleRedirectPromise).not.toHaveBeenCalled();

    resolveInitialize();
    await waitFor(() => expect(handleRedirectPromise).toHaveBeenCalledTimes(1));

    // Still not rendered — handleRedirectPromise (i.e. the pending
    // `#code=...` redirect response) has not been consumed yet. This is
    // exactly the case that regressed: without awaiting this promise,
    // children (and useMsal() consumers like SignInScreen/AppShell) would
    // already be mounted before the account state is populated.
    expect(screen.queryByText('signed-in content')).toBeNull();

    resolveRedirect(undefined);
    await waitFor(() => expect(screen.getByText('signed-in content')).not.toBeNull());
  });

  it('still renders children if handleRedirectPromise rejects, instead of hanging forever', async () => {
    initialize.mockResolvedValue(undefined);
    handleRedirectPromise.mockRejectedValue(new Error('stale redirect response'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { });

    render(
      <AuthProvider>
        <div>signed-in content</div>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('signed-in content')).not.toBeNull());
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
