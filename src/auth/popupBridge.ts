import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

void broadcastResponseToMainFrame().catch((error: unknown) => {
  console.error('MSAL popup response handling failed', error);
});