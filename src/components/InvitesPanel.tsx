import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { supabaseService } from '../lib/supabaseService';
import type { Invite, InviteClaim } from '../types';

type InviteState = 'OPEN' | 'EXPIRED' | 'REVOKED';

/**
 * Revoked beats expired: an admin closing a code deliberately is the more
 * informative fact, and a revoked code that later passes its expiry should not
 * silently change how it reads.
 */
function inviteState(invite: Invite, now: number): InviteState {
  if (invite.revokedAt) return 'REVOKED';
  if (new Date(invite.expiresAt).getTime() <= now) return 'EXPIRED';
  return 'OPEN';
}

const STATE_CLASS: Record<InviteState, string> = {
  OPEN: 'bg-green-900/30 text-green-300',
  EXPIRED: 'bg-slate-700/50 text-slate-400',
  REVOKED: 'bg-red-900/30 text-red-300'
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/** Hyphenates a 12-character code into readable thirds for display only. */
function pretty(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1-');
}

const inputClass =
  'w-full bg-slate-950/50 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-ice-500 outline-none';

/**
 * Mint, revoke and audit invite codes.
 *
 * A code is reusable and uncapped — the normal way to open the pool is one key
 * to the group, not one code per person. Binding an email makes a code personal
 * instead; both shapes are the same mechanism.
 *
 * Everything here is gated in the database on `is_admin()`, not merely by
 * living behind the admin route: `admin_create_invite` and
 * `admin_revoke_invite` refuse a non-admin, and the SELECT policies on
 * `invites` / `invite_claims` return no rows to one.
 */
export const InvitesPanel: React.FC = () => {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [claims, setClaims] = useState<InviteClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [minting, setMinting] = useState(false);
  const [mintedCode, setMintedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [inviteRows, claimRows] = await Promise.all([
        supabaseService.listInvites(),
        supabaseService.listInviteClaims()
      ]);
      setInvites(inviteRows);
      setClaims(claimRows);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleMint = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMinting(true);
    setCopied(false);
    try {
      // A date input gives a bare YYYY-MM-DD. Push it to the end of that day in
      // the admin's own timezone, so a code set to expire "on the 20th" is
      // still good all through the 20th.
      const expiresAt = expiresOn
        ? new Date(`${expiresOn}T23:59:59`).toISOString()
        : null;

      const invite = await supabaseService.createInvite({ email, expiresAt });
      setMintedCode(invite.code);
      setEmail('');
      setExpiresOn('');
      await load();
    } catch (err: any) {
      setError((err?.message ?? String(err)).replace(/^admin_create_invite:\s*/, ''));
    } finally {
      setMinting(false);
    }
  };

  const handleRevoke = async (code: string) => {
    setError('');
    setRevoking(code);
    try {
      await supabaseService.revokeInvite(code);
      if (mintedCode === code) setMintedCode(null);
      await load();
    } catch (err: any) {
      setError((err?.message ?? String(err)).replace(/^admin_revoke_invite:\s*/, ''));
    } finally {
      setRevoking(null);
    }
  };

  const handleCopy = async () => {
    if (!mintedCode) return;
    try {
      await navigator.clipboard.writeText(mintedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (insecure origin, permissions). The
      // code is on screen and selectable, so this is not worth an error banner.
      setCopied(false);
    }
  };

  const now = Date.now();
  const claimCounts = claims.reduce<Record<string, number>>((acc, claim) => {
    acc[claim.code] = (acc[claim.code] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">Invites</h2>
        <button
          onClick={load}
          disabled={loading}
          className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <p className="mb-4 text-red-400 text-sm bg-red-900/20 border border-red-500/50 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Mint */}
      <form onSubmit={handleMint} className="space-y-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium text-slate-400 mb-2">
              Bind to email <span className="text-slate-600">(optional)</span>
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Leave blank for a shared code"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="invite-expiry" className="block text-sm font-medium text-slate-400 mb-2">
              Expires <span className="text-slate-600">(optional)</span>
            </label>
            <input
              id="invite-expiry"
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <p className="text-xs text-slate-500">
          A code is reusable — one shared code lets the whole pool sign itself
          up. Blank expiry defaults to 14 days, which is too short for a code
          minted at the start of a season: set an explicit date for the pool&rsquo;s
          main code.
        </p>

        <button
          type="submit"
          disabled={minting}
          className="px-4 py-2 bg-ice-600 hover:bg-ice-700 disabled:opacity-50 text-onaccent rounded-lg text-sm font-medium transition-colors"
        >
          {minting ? 'Minting...' : 'Mint invite code'}
        </button>
      </form>

      {mintedCode && (
        <div className="mb-6 bg-slate-950/60 border border-ice-500/40 rounded-lg p-4">
          <p className="text-xs text-slate-400 mb-2">
            New code — send this to whoever is joining.
          </p>
          <div className="flex items-center gap-3">
            <code className="font-display text-2xl tracking-widest text-ice-300 select-all">
              {pretty(mintedCode)}
            </code>
            <button
              onClick={handleCopy}
              className="text-slate-400 hover:text-white transition-colors"
              title="Copy code"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Outstanding codes */}
      <h3 className="text-sm font-semibold text-slate-300 mb-3">
        Codes ({invites.length})
      </h3>

      {loading && invites.length === 0 ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : invites.length === 0 ? (
        <p className="text-slate-500 text-sm">
          No codes yet. Mint one above to open the pool.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-4 font-medium">Code</th>
                <th className="py-2 pr-4 font-medium">Bound to</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Expires</th>
                <th className="py-2 pr-4 font-medium text-center">Joined</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {invites.map((invite) => {
                const state = inviteState(invite, now);
                return (
                  <tr key={invite.code}>
                    <td className="py-2 pr-4">
                      <code className="text-slate-200 tracking-wide select-all">
                        {pretty(invite.code)}
                      </code>
                    </td>
                    <td className="py-2 pr-4 text-slate-400">
                      {invite.email ?? <span className="text-slate-600">anyone</span>}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${STATE_CLASS[state]}`}>
                        {state.toLowerCase()}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-400">{formatDate(invite.expiresAt)}</td>
                    <td className="py-2 pr-4 text-center text-slate-400">
                      {claimCounts[invite.code] ?? 0}
                    </td>
                    <td className="py-2 text-right">
                      {state === 'OPEN' && (
                        <button
                          onClick={() => handleRevoke(invite.code)}
                          disabled={revoking === invite.code}
                          className="text-xs text-red-400 hover:text-red-300 underline disabled:opacity-50"
                        >
                          {revoking === invite.code ? 'Revoking…' : 'Revoke'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Who came in on what */}
      <h3 className="text-sm font-semibold text-slate-300 mt-8 mb-3">
        Claims ({claims.length})
      </h3>

      {claims.length === 0 ? (
        <p className="text-slate-500 text-sm">
          Nobody has joined through a code yet. The founding admin&rsquo;s profile
          predates the invite system and has no claim.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-2 pr-4 font-medium">Member</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Code</th>
                <th className="py-2 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {claims.map((claim) => (
                <tr key={claim.userId}>
                  <td className="py-2 pr-4 text-slate-200">{claim.name}</td>
                  <td className="py-2 pr-4 text-slate-400">{claim.email}</td>
                  <td className="py-2 pr-4">
                    <code className="text-slate-400 tracking-wide">{pretty(claim.code)}</code>
                  </td>
                  <td className="py-2 text-slate-400">{formatDate(claim.claimedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
