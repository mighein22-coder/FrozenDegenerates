import React, { useState, useEffect } from 'react';
import { User as UserIcon, KeyRound, Mail } from 'lucide-react';
import { Button } from '../Button';
import { supabase, type Profile } from '../../lib/supabase';
import { supabaseService } from '../../lib/supabaseService';

interface SettingsViewProps {
  userId: string;
  profile: Profile | null;
  onProfileUpdated: () => Promise<void> | void;
}

const inputClass =
  'w-full bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-ice-500 focus:border-transparent transition-all outline-none placeholder:text-slate-600';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Settings view — lets a member manage their own display name, avatar and
 * password. Email is read-only: changing it requires a confirmation flow plus
 * a sync back into `profiles`, so it stays an admin task for now.
 */
export const SettingsView: React.FC<SettingsViewProps> = ({ userId, profile, onProfileUpdated }) => {
  // Profile form
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileMessage, setProfileMessage] = useState('');

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

  // Seed the form once the profile arrives (it may load after first render)
  useEffect(() => {
    setName(profile?.name ?? '');
    setAvatar(profile?.avatar ?? '');
  }, [profile?.id]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileMessage('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setProfileError('Display name cannot be empty.');
      return;
    }

    const trimmedAvatar = avatar.trim();
    if (trimmedAvatar && !/^https?:\/\//i.test(trimmedAvatar)) {
      setProfileError('Avatar must be a full image URL starting with http:// or https://');
      return;
    }

    setProfileSaving(true);
    try {
      await supabaseService.updateProfile(userId, { name: trimmedName, avatar: trimmedAvatar });
      await onProfileUpdated();
      setProfileMessage('Profile updated.');
    } catch (err: any) {
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordMessage('');

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('New password must be different from your current password.');
      return;
    }
    if (!profile?.email) {
      setPasswordError('Could not determine your account email. Please reload and try again.');
      return;
    }

    setPasswordSaving(true);
    try {
      // Re-authenticate first so an unattended session can't silently change
      // the password of whoever left the tab open.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: currentPassword
      });
      if (reauthError) throw new Error('Current password is incorrect.');

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setPasswordMessage('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl font-bold text-white uppercase tracking-wide">
          Account Settings
        </h1>
        <p className="text-slate-400 mt-1">Manage how you appear in the league and secure your account.</p>
      </div>

      {/* Profile */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-3">
          <UserIcon size={20} className="text-ice-400" />
          <h2 className="font-display text-xl font-bold text-white uppercase tracking-wide">Profile</h2>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-5">
          <div>
            <label htmlFor="settings-name" className="block text-sm font-medium text-slate-400 mb-2">
              Display Name
            </label>
            <input
              id="settings-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How you appear in the standings"
              maxLength={50}
              required
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="settings-avatar" className="block text-sm font-medium text-slate-400 mb-2">
              Avatar URL <span className="text-slate-600">(optional)</span>
            </label>
            <div className="flex items-center gap-4">
              {avatar.trim() ? (
                <img
                  src={avatar.trim()}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover border border-slate-700 shrink-0 bg-slate-800"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                  }}
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 shrink-0 flex items-center justify-center text-slate-500 font-display text-lg">
                  {(name.trim()[0] || '?').toUpperCase()}
                </div>
              )}
              <input
                id="settings-avatar"
                type="url"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="https://example.com/me.png"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Email</label>
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-slate-950/30 border border-slate-800 text-slate-500">
              <Mail size={16} className="shrink-0" />
              <span className="truncate">{profile?.email || '—'}</span>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              Contact the pool admin to change the email on your account.
            </p>
          </div>

          {profileError && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-500/50 rounded px-3 py-2">
              {profileError}
            </p>
          )}
          {profileMessage && (
            <p className="text-green-400 text-sm bg-green-900/20 border border-green-500/50 rounded px-3 py-2">
              {profileMessage}
            </p>
          )}

          <Button type="submit" disabled={profileSaving}>
            {profileSaving ? 'Saving...' : 'Save Profile'}
          </Button>
        </form>
      </section>

      {/* Password */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-3">
          <KeyRound size={20} className="text-ice-400" />
          <h2 className="font-display text-xl font-bold text-white uppercase tracking-wide">Password</h2>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-5">
          <div>
            <label htmlFor="settings-current-password" className="block text-sm font-medium text-slate-400 mb-2">
              Current Password
            </label>
            <input
              id="settings-current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="settings-new-password" className="block text-sm font-medium text-slate-400 mb-2">
              New Password
            </label>
            <input
              id="settings-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="settings-confirm-password" className="block text-sm font-medium text-slate-400 mb-2">
              Confirm New Password
            </label>
            <input
              id="settings-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
              required
              className={inputClass}
            />
          </div>

          {passwordError && (
            <p className="text-red-400 text-sm bg-red-900/20 border border-red-500/50 rounded px-3 py-2">
              {passwordError}
            </p>
          )}
          {passwordMessage && (
            <p className="text-green-400 text-sm bg-green-900/20 border border-green-500/50 rounded px-3 py-2">
              {passwordMessage}
            </p>
          )}

          <Button type="submit" disabled={passwordSaving}>
            {passwordSaving ? 'Updating...' : 'Change Password'}
          </Button>
        </form>
      </section>
    </div>
  );
};
