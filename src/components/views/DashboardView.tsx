import React from 'react';
import type { Profile } from '../../lib/supabase';
import type { StandingsRow, Pick } from '../../types';
import { Button } from '../Button';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardViewProps {
  user: Profile | null;
  standings: StandingsRow[];
  currentPicks: Partial<Pick>[];
  onNavigate: (view: string) => void;
}

/**
 * Dashboard view - User's home page with stats and performance
 */
export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  standings,
  currentPicks,
  onNavigate
}) => {
  const userStats = standings.find(s => s.userId === user?.id);

  // Mock chart data - in production, this would come from historical picks
  const mockChartData = [
    { name: 'Wk 1', score: 12 },
    { name: 'Wk 2', score: 8 },
    { name: 'Wk 3', score: 15 },
    { name: 'Wk 4', score: 10 },
    { name: 'Wk 5', score: userStats?.totalPoints ? Math.min(userStats.totalPoints % 15, 15) : 0 },
  ];

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

      {/* Performance Chart */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl h-80">
        <h3 className="text-lg font-bold text-white mb-4">Performance History</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mockChartData}>
            <XAxis
              dataKey="name"
              stroke="#64748b"
              tick={{ fill: '#64748b' }}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fill: '#64748b' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#1e293b',
                color: '#f8fafc'
              }}
              itemStyle={{ color: '#38bdf8' }}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#38bdf8"
              strokeWidth={3}
              dot={{ fill: '#38bdf8', strokeWidth: 2 }}
              activeDot={{ r: 8 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Call to Action */}
      <div className="bg-gradient-to-r from-ice-900/50 to-slate-900 border border-ice-500/20 p-8 rounded-xl flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white mb-2">Make Picks</h3>
          <p className="text-slate-400 max-w-lg">
            Check the schedule and make your confidence selections for the upcoming Saturday.
          </p>
        </div>
        <Button size="lg" onClick={() => onNavigate('PICKS')}>
          Make Picks
        </Button>
      </div>
    </div>
  );
};
