import React from 'react';
import type { StandingsRow, User } from '../../types';

interface StandingsViewProps {
  standings: StandingsRow[];
  currentUser: User | null;
}

/**
 * Standings view - League leaderboard
 */
export const StandingsView: React.FC<StandingsViewProps> = ({ standings, currentUser }) => (
  <div className="animate-in fade-in slide-in-from-bottom-4">
    <header className="mb-8">
      <h2 className="text-3xl font-display font-bold text-white">League Standings</h2>
      <p className="text-slate-400">Official Leaderboard</p>
    </header>

    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-950 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
              <th className="p-4 font-medium">Rank</th>
              <th className="p-4 font-medium">Member</th>
              <th className="p-4 font-medium text-center">W-L</th>
              <th className="p-4 font-medium text-center">Weekly</th>
              <th className="p-4 font-medium text-right">Total Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {standings.map((row) => (
              <tr
                key={row.userId}
                className={`hover:bg-slate-800/50 transition-colors ${
                  row.userId === currentUser?.id ? 'bg-ice-900/10' : ''
                }`}
              >
                <td className="p-4">
                  <span
                    className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-display font-bold ${
                      row.rank === 1
                        ? 'bg-yellow-500/20 text-yellow-500'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {row.rank}
                  </span>
                </td>
                <td className="p-4">
                  <span
                    className={`font-medium ${
                      row.userId === currentUser?.id ? 'text-ice-400' : 'text-slate-200'
                    }`}
                  >
                    {row.name}
                  </span>
                </td>
                <td className="p-4 text-center text-slate-400 text-sm">
                  {row.wins}-{row.losses}
                </td>
                <td className="p-4 text-center">
                  <span className="inline-block px-2 py-1 bg-slate-800 rounded text-xs text-slate-300">
                    +{row.weeklyScore}
                  </span>
                </td>
                <td className="p-4 text-right font-display font-bold text-lg text-white">
                  {row.totalPoints}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);
