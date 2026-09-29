import {
  LayoutDashboard,
  Calendar,
  Trophy,
  Grid3X3,
  Heart,
  ClipboardList,
  Settings,
  UserCog
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The app's navigable routes, in sidebar order.
 *
 * One definition drives both the router and the navigation, so a path can't
 * exist in one and not the other.
 */
export interface NavRoute {
  path: string;
  label: string;
  /** Shown under the icon in the mobile bottom nav, where space is tight. */
  shortLabel: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /**
   * One of the few tabs shown in the phone bottom bar. Everything else goes
   * behind its "More" button: nine tabs will not fit in 375px.
   */
  primaryMobile?: boolean;
}

export const NAV_ROUTES: NavRoute[] = [
  { path: '/', label: 'Dashboard', shortLabel: 'Dashboard', icon: LayoutDashboard, primaryMobile: true },
  { path: '/picks', label: 'Saturday Picks', shortLabel: 'Picks', icon: Calendar, primaryMobile: true },
  { path: '/matrix', label: 'League Matrix', shortLabel: 'Matrix', icon: Grid3X3, primaryMobile: true },
  { path: '/affinity', label: 'Team Affinity', shortLabel: 'Affinity', icon: Heart },
  { path: '/standings', label: 'Standings', shortLabel: 'Standings', icon: Trophy, primaryMobile: true },
  { path: '/history', label: 'My History', shortLabel: 'History', icon: ClipboardList },
  { path: '/settings', label: 'Settings', shortLabel: 'Settings', icon: UserCog },
  { path: '/admin', label: 'Admin Panel', shortLabel: 'Admin', icon: Settings, adminOnly: true }
];

/** Routes rendered outside the authenticated shell. */
export const PUBLIC_ROUTES = {
  login: '/login',
  signup: '/signup',
  authCallback: '/auth/callback'
} as const;
