// MSAL instance configuration (ADR-002): sessionStorage token cache so a
// closed tab/browser always drops back to read-only on next launch — no
// write-scoped token ever silently outlives the admin's active session.

import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

export const READ_SCOPES = ['DeviceManagementManagedDevices.Read.All'];
export const WRITE_SCOPES = ['DeviceManagementManagedDevices.ReadWrite.All'];
export const AUDIT_SCOPES = ['DeviceManagementConfiguration.Read.All'];

export interface RuntimeAuthConfig {
  clientId: string;
  tenantId: string;
}

export function isValidGuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export function validateRuntimeAuthConfig(config: RuntimeAuthConfig): string | null {
  if (!isValidGuid(config.clientId)) return 'Enter a valid application (client) ID.';
  if (!isValidGuid(config.tenantId)) return 'Enter a valid directory (tenant) ID.';
  return null;
}

export function createMsalInstance(config: RuntimeAuthConfig): PublicClientApplication {
  const msalConfig: Configuration = {
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'sessionStorage' },
    system: { popupBridgeTimeout: 180000, iframeBridgeTimeout: 180000 },
  };
  return new PublicClientApplication(msalConfig);
}

export function getPopupRedirectUri(): string {
  return `${window.location.origin}/auth-popup.html`;
}
