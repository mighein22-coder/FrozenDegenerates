import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { Profile } from '../../lib/supabase';
import type { StandingsRow, Pick } from '../../types';
import { Button } from '../Button';

interface DashboardViewProps {
  user: Profile | null;
  standings: StandingsRow[];
  currentPicks: Partial<Pick>[];
  isLocked: boolean;
}

/**
 * Dashboard view - User's home page with stats and performance
 */
export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  standings,
  currentPicks,
  isLocked
}) => {
  const navigate = useNavigate();
  const userStats = standings.find(s => s.userId === user?.id);

  // The call to action depends on where the user actually is in the week
  const hasFullSheet = currentPicks.length === 5;
  const cta = isLocked
    ? {
        heading: hasFullSheet ? 'Picks Locked In' : 'Week Locked',
        body: hasFullSheet
          ? 'The deadline has passed and your picks are in. Follow the games as results come in.'
          : "The Saturday 10:00 AM ET deadline has passed, so this week's sheet is closed.",
        button: 'View Picks'
      }
    : hasFullSheet
      ? {
          heading: 'Picks Submitted',
          body: 'All five selections are in. You can still change them until Saturday at 10:00 AM ET.',
          button: 'Edit Picks'
        }
      : {
          heading: 'Make Picks',
          body: `Check the schedule and make your confidence selections for the upcoming Saturday. ${5 - currentPicks.length} of 5 still to go.`,
          button: 'Make Picks'
        };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-display font-bold text-white">Dashboard</h2>
          <p className="text-slate-400">Welcome back, {user?.name}</p>
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-sm text-slate-400 uppercase tracking-wider">Current Rank</div>
          <div className="text-4xl font-display font-bold text-ice-400">
            #{userStats?.rank || '-'}
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
          <div className="text-slate-400 text-sm font-medium mb-1">Total Score</div>
          <div className="text-4xl font-display font-bold text-white">
            {userStats?.totalPoints || 0}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
          <div className="text-slate-400 text-sm font-medium mb-1">Season Record</div>
          <div className="text-4xl font-display font-bold text-white">
            <span className="text-green-400">{userStats?.wins || 0}</span>
            <span className="text-slate-600 mx-2">-</span>
            <span className="text-red-400">{userStats?.losses || 0}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
          <div className="text-slate-400 text-sm font-medium mb-1">Current Picks</div>
          <div className="text-4xl font-display font-bold text-ice-400">
            {currentPicks.length}
            <span className="text-slate-600 text-2xl">/5</span>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="bg-gradient-to-r from-ice-900/50 to-slate-900 border border-ice-500/20 p-8 rounded-xl flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white mb-2">{cta.heading}</h3>
          <p className="text-slate-400 max-w-lg">{cta.body}</p>
        </div>
        <Button size="lg" onClick={() => navigate('/picks')}>
          {cta.button}
        </Button>
      </div>
    </div>
  );
};
