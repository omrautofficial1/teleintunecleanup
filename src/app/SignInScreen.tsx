// Sign-in screen (spec §9.1): Microsoft sign-in button, read-only scope
// only. Shows a setup panel with the exact redirect URI if the app is
// served from an unsupported origin (spec §3 — file:// never works).

import { useAuth } from '../auth/useAuth';
import { Button } from '../components/ui/Button';
import { BrandMark } from '../components/ui/BrandMark';

export function SignInScreen() {
  const { signIn, isSigningIn } = useAuth();

  return (
    <div className="mx-auto mt-24 max-w-md space-y-6 rounded-md border border-app-hairline bg-app-surface p-8 text-center shadow-sm">
      <div className="flex justify-center">
        <BrandMark />
      </div>
      <h1 className="text-xl font-semibold">Intune Device Cleanup</h1>
      <p className="text-sm text-app-ink/70">
        Sign in with a Microsoft work account to browse and clean up duplicate Intune device
        records. Read-only access is requested at sign-in; write access is only requested at the
        moment of a real deletion.
      </p>

      <Button onClick={() => void signIn()} disabled={isSigningIn}>
        {isSigningIn ? 'Signing in…' : 'Sign in with Microsoft'}
      </Button>
    </div>
  );
}
