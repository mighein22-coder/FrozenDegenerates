import React, { useState } from 'react';

interface MemberAvatarProps {
  /** Full image URL, or null/empty for the initial fallback. */
  avatar?: string | null;
  /** Used for the initial, and for the alt text. */
  name: string;
  /** Tailwind size classes for the circle. Defaults to a 24px avatar. */
  className?: string;
}

/**
 * A member's avatar, falling back to the initial of their name.
 *
 * **The fallback is the normal case, not an edge case.** `redeem_invite` never
 * sets `avatar`, so every member starts at null and stays there until they set
 * one from Settings. Before this component existed the league matrix, the
 * affinity view and the admin directory each rendered `{user.avatar && <img/>}`
 * and so showed nothing at all for a member without one — which, on a fresh
 * roster, is everybody.
 *
 * `profiles.avatar` here is a full image URL (Settings validates `^https?://`),
 * not the short emoji field the sibling NFL app uses. A URL can rot, so a
 * broken image falls back to the initial too rather than leaving a gap.
 */
export const MemberAvatar: React.FC<MemberAvatarProps> = ({
  avatar,
  name,
  className = 'w-6 h-6 text-xs'
}) => {
  const [broken, setBroken] = useState(false);
  const src = avatar?.trim();
  const initial = (name.trim()[0] || '?').toUpperCase();

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setBroken(true)}
        className={`${className} rounded-full object-cover border border-slate-700 bg-slate-800 shrink-0`}
      />
    );
  }

  return (
    <div
      aria-label={name}
      title={name}
      className={`${className} rounded-full bg-slate-800 border border-slate-700 shrink-0 flex items-center justify-center text-slate-400 font-display leading-none`}
    >
      {initial}
    </div>
  );
};
