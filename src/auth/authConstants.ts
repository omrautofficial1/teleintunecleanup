export const AUTH_REDIRECT_PENDING_KEY = 'intune-cleanup.auth-redirect-pending';
export const AUTH_CONFIG_KEY = 'intune-cleanup.auth-config';
export const ACTIVE_AUTH_CONFIG_KEY = 'intune-cleanup.active-auth-config';

export function clearRuntimeAuthConfig(): void {
    localStorage.removeItem(AUTH_CONFIG_KEY);
    sessionStorage.removeItem(ACTIVE_AUTH_CONFIG_KEY);
}
