import React, { useMemo } from 'react';
import type { User, Pick } from '../../types';
import { TEAMS } from '../../constants';

interface TeamStatsViewProps {
  leagueUsers: User[];
  allPicks: Pick[];
}

/**
 * Team Stats view - Team affinity and pick patterns
 */
export const TeamStatsView: React.FC<TeamStatsViewProps> = ({ leagueUsers, allPicks }) => {
  const userAffinities = useMemo(() => {
    return leagueUsers.map(user => {
      const userPicks = allPicks.filter(p => p.userId === user.id);
      const teamCounts: Record<string, number> = {};

      userPicks.forEach(p => {
        teamCounts[p.selectedTeamId] = (teamCounts[p.selectedTeamId] || 0) + 1;
      });

      const sorted = Object.entries(teamCounts)
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      return { ...user, topTeams: sorted };
    });
  }, [leagueUsers, allPicks]);

  const getLogoUrl = (abbr: string) => `https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg`;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4">
      <header className="mb-8">
        <h2 className="text-3xl font-display font-bold text-white">Team Affinity</h2>
        <p className="text-slate-400">Most frequently picked teams by player</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {userAffinities.map(user => (
          <div
            key={user.id}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col"
          >
            <div className="flex items-center gap-4 mb-6">
              {user.avatar && (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-12 h-12 rounded-full border-2 border-slate-800"
                />
              )}
              <div>
                <h3 className="text-lg font-bold text-white">{user.name}</h3>
                <span className="text-xs text-slate-500 uppercase tracking-widest">{user.role}</span>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-[10px] text-slate-500 uppercase font-bold tracking-widest border-b border-slate-800 pb-2">
                Top 3 Favorite Teams
              </h4>
              {user.topTeams && user.topTeams.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {user.topTeams.map((stat: { id: string; count: number }) => {
                    const team = TEAMS[stat.id];
                    return (
                      <div
                        key={stat.id}
                        className="relative group flex flex-col items-center p-3 rounded-lg bg-slate-950/50 border border-slate-800 hover:border-ice-500/50 transition-colors"
                      >
                        <div className="absolute -top-1 -right-1 bg-ice-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg z-10">
                          {stat.count}
                        </div>
                        <img
                          src={getLogoUrl(stat.id)}
                          alt={team?.name}
                          className="w-10 h-10 object-contain drop-shadow-md mb-2"
                        />
                        <span className="text-[10px] font-bold text-slate-400">{stat.id}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-4 text-center text-slate-600 text-sm italic">
                  No picks recorded yet
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
