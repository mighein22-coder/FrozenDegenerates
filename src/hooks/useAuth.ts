import { useEffect, useState } from 'react';
import { supabase, type Profile } from '../lib/supabase';
import { supabaseService } from '../lib/supabaseService';
import type { User } from '@supabase/supabase-js';

/**
 * Authentication hook for managing user sessions with Supabase.
 *
 * The distinction this hook exists to express is that **being signed in is not
 * being a member**. Anyone can create an auth account — the anon key is in the
 * public bundle, so `auth.signUp` is reachable by anybody. Membership is a
 * `profiles` row, and since migration 0009 the only thing that creates one is
 * `redeem_invite()`.
 *
 * So there are three states, not two, and the caller has to tell them apart:
 *
 *   | user | profile | profileError | meaning                              |
 *   |------|---------|--------------|--------------------------------------|
 *   | null | null    | null         | signed out                           |
 *   | set  | null    | null         | signed in, not a member yet          |
 *   | set  | null    | set          | signed in, the lookup FAILED         |
 *   | set  | set     | null         | a member                             |
 *
 * Collapsing the middle two is the bug worth avoiding: it tells an existing
 * member on a dropped connection that they are not in the pool, and their real
 * invite code is then refused with "you are already a member".
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  /**
   * A redemption that failed during signup, held over for the redeem screen.
   *
   * Once `signUp` yields a session, `onAuthStateChange` fires and the login
   * screen unmounts immediately — so an error thrown at that moment would be
   * set on a component nobody is looking at. It is stashed here and handed to
   * the screen the user is about to land on instead.
   */
  const [pendingRedeemError, setPendingRedeemError] = useState<string | null>(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setProfileError(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  /**
   * Load user profile from database.
   *
   * `.maybeSingle()`, not `.single()`. A signed-in user with no profile row is
   * a NORMAL state since 0009 — they hold an account but have not redeemed an
   * invite. `maybeSingle` returns `{ data: null, error: null }` for that, which
   * is what lets "not a member" and "the query failed" be told apart here
   * rather than both landing in the catch.
   */
  async function loadProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      setProfile((data as Profile | null) ?? null);
      setProfileError(null);
    } catch (error: any) {
      console.error('Error loading profile:', error);
      setProfile(null);
      setProfileError(error?.message ?? String(error));
    } finally {
      setLoading(false);
    }
  }

  /**
   * Sign in with email and password
   */
  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });

      if (error) throw error;
      return data;
    } catch (error: any) {
      throw new Error(error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sign out current user
   */
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error: any) {
      throw new Error(error.message || 'Logout failed');
    }
  };

  /**
   * Create an account and join the pool with an invite code.
   *
   * Two operations, deliberately not one. The project has email confirmation
   * switched off, so `auth.signUp` returns a session and both happen in the
   * same action — but they stay separable for two reasons:
   *
   *   * A mistyped code must not strand the account. The redemption failure is
   *     carried to `RedeemInviteView`, which retries it.
   *   * If confirmation is ever switched on, `auth.signUp` returns no session.
   *     There is no `auth.uid()` to attach a profile to, RLS cannot authorise a
   *     request that carries no identity, and the resumable path is the only
   *     one that works. That is the `needsConfirmation` branch.
   */
  const signUp = async (
    email: string,
    password: string,
    name: string,
    inviteCode: string
  ): Promise<{ needsConfirmation: boolean }> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password
      });

      if (error) throw error;
      if (!data.user) throw new Error('User creation failed');

      // No session means the address needs confirming first. Redemption waits.
      if (!data.session) return { needsConfirmation: true };

      try {
        await supabaseService.redeemInvite(inviteCode, name);
        setPendingRedeemError(null);
      } catch (redeemError: any) {
        setPendingRedeemError(
          (redeemError?.message ?? String(redeemError)).replace(/^redeem_invite:\s*/, '')
        );
      }

      await loadProfile(data.user.id);
      return { needsConfirmation: false };
    } catch (error: any) {
      throw new Error(error.message || 'Signup failed');
    }
  };

  /**
   * Redeem an invite code for an account that already exists.
   *
   * The recovery path: a mistyped code at signup, or a confirmed address whose
   * signup returned no session. Also the only path for anyone who signed up
   * without a code at all.
   */
  const redeem = async (inviteCode: string, name: string) => {
    await supabaseService.redeemInvite(inviteCode, name);
    setPendingRedeemError(null);
    if (user) await loadProfile(user.id);
  };

  /**
   * Re-read the current user's profile from the database. Call after a profile
   * update so the sidebar/dashboard pick up the new name or avatar immediately.
   */
  const refreshProfile = async () => {
    if (!user) return;
    await loadProfile(user.id);
  };

  return {
    user,
    profile,
    loading,
    profileError,
    pendingRedeemError,
    signIn,
    signOut,
    signUp,
    redeem,
    refreshProfile,
    isAuthenticated: !!user,
    isAdmin: profile?.role === 'admin'
  };
}
