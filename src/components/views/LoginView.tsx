import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../Button';
import { supabase } from '../../lib/supabase';
import { PUBLIC_ROUTES } from '../../routes';

/** Matches SettingsView's MIN_PASSWORD_LENGTH and AuthCallbackView's check. */
const MIN_PASSWORD_LENGTH = 8;

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignUp: (
    email: string,
    password: string,
    name: string,
    inviteCode: string
  ) => Promise<{ needsConfirmation: boolean }>;
  /** Set by the route — `/login` or `/signup`. Reset is a sub-mode of login. */
  initialMode?: 'login' | 'signup';
}

const inputClass =
  'w-full bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-ice-500 focus:border-transparent transition-all outline-none placeholder:text-slate-600';

const labelClass = 'block text-sm font-medium text-slate-400 mb-2';

/**
 * Login, signup and password reset — the whole signed-out surface.
 *
 * Signup takes an invite code because the pool is invite-only: creating an auth
 * account is open (the anon key is public, `auth.signUp` is reachable by
 * anyone), but it gets you nothing on its own. The code is what
 * `redeem_invite()` turns into a `profiles` row, and a profile row is
 * membership. See supabase/migrations/0009_invites_and_membership.sql.
 *
 * A failed redemption does not fail the signup: the account exists, and the
 * user lands on RedeemInviteView to try the code again. That is deliberate —
 * failing the whole thing would leave an auth account behind with no way to
 * finish, since the app cannot delete one.
 */
export const LoginView: React.FC<LoginViewProps> = ({
  onLogin,
  onSignUp,
  initialMode = 'login'
}) => {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>(initialMode);
  const [resetMessage, setResetMessage] = useState('');
  const [signupMessage, setSignupMessage] = useState('');

  const clearMessages = () => {
    setError('');
    setResetMessage('');
    setSignupMessage('');
  };

  const goToMode = (next: 'login' | 'signup' | 'reset') => {
    clearMessages();
    setMode(next);
    // Keep the URL truthful for login and signup so the signup link is
    // shareable and the back button behaves. Reset has no route of its own.
    if (next === 'login') navigate(PUBLIC_ROUTES.login, { replace: true });
    if (next === 'signup') navigate(PUBLIC_ROUTES.signup, { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onLogin(email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const { needsConfirmation } = await onSignUp(email, password, name, inviteCode);

      if (needsConfirmation) {
        // Only reachable if "Confirm email" gets switched back on in the
        // Supabase project. The code is redeemed on the next sign-in instead.
        setSignupMessage(
          'Check your email to confirm your address, then sign in — we will ask for your invite code once more.'
        );
        setPassword('');
        setLoading(false);
        return;
      }

      // On success the session lands, this screen unmounts, and the app shell
      // takes over. Nothing to do here — including turning `loading` off, which
      // would set state on an unmounted component.
    } catch (err: any) {
      setError(err.message || 'Signup failed. Please try again.');
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`
      });

      if (error) throw error;

      setResetMessage('Check your email for a password reset link.');
      setEmail('');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const errorBanner = error && (
    <p className="text-red-400 text-sm bg-red-900/20 border border-red-500/50 rounded px-3 py-2">
      {error}
    </p>
  );

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-slate-950">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-ice-600/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 blur-[120px] rounded-full"></div>
      </div>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-md p-8">
        <div className="text-center mb-10">
          <h1 className="font-display text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-ice-200 mb-2">
            ICEPICK
          </h1>
          <p className="text-ice-200/60 uppercase tracking-widest text-sm">
            Official NHL Pick'em League
          </p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl">
          {mode === 'login' && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="login-email" className={labelClass}>
                  Email Address
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="login-password" className={labelClass}>
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className={inputClass}
                />
              </div>

              {errorBanner}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Signing in...' : 'Enter League'}
              </Button>

              <div className="text-center space-y-2 text-xs text-slate-500">
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('reset');
                      clearMessages();
                      setPassword('');
                    }}
                    className="text-ice-400 hover:text-ice-300 underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div>
                  Got an invite code?{' '}
                  <button
                    type="button"
                    onClick={() => goToMode('signup')}
                    className="text-ice-400 hover:text-ice-300 underline"
                  >
                    Create your account
                  </button>
                </div>
              </div>
            </form>
          )}

          {mode === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-6">
              <div>
                <label htmlFor="signup-code" className={labelClass}>
                  Invite Code
                </label>
                <input
                  id="signup-code"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="ABCD-EFGH-IJKL"
                  required
                  autoComplete="off"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-600">
                  Case, spaces and dashes do not matter.
                </p>
              </div>

              <div>
                <label htmlFor="signup-name" className={labelClass}>
                  Display Name
                </label>
                <input
                  id="signup-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="How you appear in the standings"
                  required
                  maxLength={50}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="signup-email" className={labelClass}>
                  Email Address
                </label>
                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="signup-password" className={labelClass}>
                  Password
                </label>
                <input
                  id="signup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-600">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              </div>

              {errorBanner}

              {signupMessage && (
                <p className="text-green-400 text-sm bg-green-900/20 border border-green-500/50 rounded px-3 py-2">
                  {signupMessage}
                </p>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Creating account...' : 'Join the League'}
              </Button>

              <div className="text-center space-y-2 text-xs text-slate-500">
                <div>No code? Ask the pool admin for one.</div>
                <div>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => goToMode('login')}
                    className="text-ice-400 hover:text-ice-300 underline"
                  >
                    Sign in
                  </button>
                </div>
              </div>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-6">
              <div>
                <label htmlFor="reset-email" className={labelClass}>
                  Email Address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className={inputClass}
                />
              </div>

              {errorBanner}

              {resetMessage && (
                <p className="text-green-400 text-sm bg-green-900/20 border border-green-500/50 rounded px-3 py-2">
                  {resetMessage}
                </p>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Email'}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    clearMessages();
                    setEmail('');
                  }}
                  className="text-ice-400 hover:text-ice-300 underline text-xs"
                >
                  Back to login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
