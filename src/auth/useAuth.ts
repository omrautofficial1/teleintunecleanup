// Consent-state exposure (header badge), silent-refresh-then-interactive
// login, and incremental consent + decline fallback (ADR-006). Nothing
// else in the app talks to MSAL directly — this hook is the boundary.

import { useMsal } from '@azure/msal-react';
import {
  InteractionRequiredAuthError,
  type AccountInfo,
} from '@azure/msal-browser';
import { useCallback, useRef, useState } from 'react';
import { getPopupRedirectUri, READ_SCOPES, WRITE_SCOPES } from './msalConfig';
import { AUTH_REDIRECT_PENDING_KEY } from './authConstants';
import { clearRuntimeAuthConfig } from './authConstants';

export type ConsentLevel = 'none' | 'read-only' | 'read-and-write';

export interface WriteConsentDeclinedError {
  kind: 'write-consent-declined';
  message: string;
}

export function useAuth() {
  const { instance, accounts } = useMsal();
  const account: AccountInfo | null = accounts[0] ?? null;
  const [consentLevel, setConsentLevel] = useState<ConsentLevel>(
    account ? 'read-only' : 'none',
  );
  const [writeConsentError, setWriteConsentError] = useState<string | null>(null);
  // Guards against a second loginPopup/loginRedirect firing while one is
  // already in flight (double-click, or a re-render-triggered re-call) —
  // MSAL throws BrowserAuthError: interaction_in_progress if two
  // interactive calls overlap. This is a ref, not state, so it updates
  // synchronously on the very first click with no extra render in between.
  const signInInFlight = useRef(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const signIn = useCallback(async () => {
    if (signInInFlight.current) return;
    signInInFlight.current = true;
    setIsSigningIn(true);
    try {
      sessionStorage.setItem(AUTH_REDIRECT_PENDING_KEY, 'true');
      // Use the app-root redirect for initial sign-in. It avoids browser popup
      // relay restrictions; AuthProvider consumes the response on return.
      await instance.loginRedirect({ scopes: READ_SCOPES });
    } finally {
      signInInFlight.current = false;
      setIsSigningIn(false);
    }
  }, [instance]);

  const signOut = useCallback(async () => {
    clearRuntimeAuthConfig();
    sessionStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
    instance.setActiveAccount(null);
    try {
      await instance.logoutRedirect({
        postLogoutRedirectUri: window.location.origin,
      });
    } catch {
      // If the identity provider cannot complete logout, still return to the
      // local setup screen instead of leaving the authenticated dashboard.
      window.location.replace(window.location.origin);
    }
  }, [instance]);

  /** Acquires a token for the given scopes, trying silent refresh first and
   * only escalating to interactive login if silent refresh fails
   * (spec §5). */
  const getAccessToken = useCallback(
    async (scopes: string[]): Promise<string> => {
      if (!account) throw new Error('No signed-in account.');
      try {
        const result = await instance.acquireTokenSilent({ scopes, account });
        return result.accessToken;
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
          const result = await instance.acquireTokenPopup({
            scopes,
            account,
            redirectUri: getPopupRedirectUri(),
          });
          return result.accessToken;
        }
        throw error;
      }
    },
    [instance, account],
  );

  const getReadToken = useCallback(() => getAccessToken(READ_SCOPES), [getAccessToken]);

  /**
   * Requests write scope via incremental consent, only at the moment of a
   * real-delete confirmation (spec §5). Tries silent acquisition first
   * (reusing an already-granted write-scope session within this browser
   * tab, same as getAccessToken above) and only escalates to an
   * interactive popup if that fails. On any decline/failure: abort (no
   * Graph DELETE calls are ever issued from this path — caller enforces
   * that), do NOT flip the header badge to "Read and write" (ADR-006),
   * and surface a named error distinct from a generic auth failure.
   */
  const requestWriteConsent = useCallback(async (): Promise<string> => {
    if (!account) throw new Error('No signed-in account.');
    try {
      let result;
      try {
        result = await instance.acquireTokenSilent({ scopes: WRITE_SCOPES, account });
      } catch (error) {
        if (!(error instanceof InteractionRequiredAuthError)) throw error;
        result = await instance.acquireTokenPopup({
          scopes: WRITE_SCOPES,
          account,
          redirectUri: getPopupRedirectUri(),
        });
      }
      setConsentLevel('read-and-write');
      setWriteConsentError(null);
      return result.accessToken;
    } catch (error) {
      setWriteConsentError(
        'Write access was not granted. Real deletion is unavailable until write consent is granted.',
      );
      // ADR-006: header badge stays at read-only — never optimistically
      // flipped before a confirmed, successful token acquisition.
      setConsentLevel((prev) => (prev === 'read-and-write' ? 'read-only' : prev));
      throw error;
    }
  }, [instance, account]);

  const clearWriteConsentError = useCallback(() => setWriteConsentError(null), []);

  return {
    account,
    isSignedIn: Boolean(account),
    isSigningIn,
    consentLevel,
    writeConsentError,
    signIn,
    signOut,
    getReadToken,
    getAccessToken,
    requestWriteConsent,
    clearWriteConsentError,
  };
}
