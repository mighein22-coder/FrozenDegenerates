import React from 'react';
import { Lock, ShieldAlert, Clock, RefreshCw } from 'lucide-react';
import type { Game, User, Pick, Week } from '../../types';

interface ResultsViewProps {
  selectedWeekId: string;
  availableWeeks: Week[];
  onWeekSelect: (weekId: string) => void;
  isLocked: boolean;
  weekGames: Game[];
  leagueUsers: User[];
  leaguePicks: Pick[];
  syncingScores?: boolean;
}

/**
 * Results view - League-wide pick matrix
 */
export const ResultsView: React.FC<ResultsViewProps> = ({
  selectedWeekId,
  availableWeeks,
  onWeekSelect,
  isLocked,
  weekGames,
  leagueUsers,
  leaguePicks,
  syncingScores = false
}) => {
  // Handle case where no weeks are available yet
  if (availableWeeks.length === 0) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4">
        <header className="mb-8">
          <h2 className="text-3xl font-display font-bold text-white uppercase tracking-wider">League Matrix</h2>
          <p className="text-slate-400 text-sm">Real-time league-wide selections</p>
        </header>

        <div className="h-[50vh] flex flex-col items-center justify-center">
          <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 relative">
            <Clock size={48} className="text-ice-500" />
            <div className="absolute inset-0 border-4 border-ice-500/20 rounded-full animate-pulse"></div>
          </div>
          <h3 className="text-2xl font-display font-bold text-white mb-2 uppercase tracking-widest">
            No Results Yet
          </h3>
          <p className="text-slate-400 max-w-md text-center">
            Results will be available after the Saturday 11:00 AM ET deadline passes.
            Check back then to see how everyone picked!
          </p>
        </div>
      </div>
    );
  }

  const targetDateStr = selectedWeekId.replace('week-', '');

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:justify-between lg:items-center sticky top-0 bg-slate-950/90 backdrop-blur-md py-4 z-30 border-b border-slate-800 gap-4 -mx-4 px-4 lg:-mx-10 lg:px-10 mb-8">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold text-white uppercase tracking-wider">
              Matrix: {new Date(targetDateStr + 'T12:00:00Z').toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })}
            </h2>
            <p className="text-slate-400 text-sm">Real-time league-wide selections</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Week Selector - show when there's at least 1 week */}
          {availableWeeks.length >= 1 && (
            <select
              value={selectedWeekId}
              onChange={(e) => onWeekSelect(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-ice-500"
            >
              {availableWeeks.map(week => (
                <option key={week.id} value={week.id}>
                  Week {week.number} - {new Date(week.startDate + 'T12:00:00Z').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC'
                  })} ({week.status})
                </option>
              ))}
            </select>
          )}

          {/* Syncing indicator */}
          {syncingScores && (
            <div className="flex items-center gap-2 text-ice-400 text-sm">
              <RefreshCw size={14} className="animate-spin" />
              <span>Updating scores...</span>
            </div>
          )}

          {/* Lock Status */}
          <div className="flex items-center gap-2 text-slate-400 text-sm uppercase tracking-widest font-bold">
            {isLocked ? (
              <Lock size={14} className="text-green-500" />
            ) : (
              <ShieldAlert size={14} className="text-orange-500" />
            )}
            {isLocked ? 'Picks Revealed' : 'Classified'}
          </div>
        </div>
      </header>

      {/* Locked/Unlocked Content */}
      {!isLocked ? (
        <div className="h-[50vh] flex flex-col items-center justify-center animate-in fade-in zoom-in-95">
          <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 relative">
            <ShieldAlert size={48} className="text-ice-500" />
            <div className="absolute inset-0 border-4 border-ice-500/20 rounded-full animate-pulse"></div>
          </div>
          <h3 className="text-2xl font-display font-bold text-white mb-2 uppercase tracking-widest">
            Classified
          </h3>
          <p className="text-slate-400 max-w-md text-center">
            League picks are hidden until the Saturday 11:00 AM ET deadline. Check back then to see the field.
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-950 p-4 border-b border-r border-slate-800 min-w-[200px] text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Player
                  </th>
                  {weekGames
                    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                    .map(game => (
                      <th
                        key={game.id}
                        className="p-2 border-b border-slate-800 text-center min-w-[120px] bg-slate-900/50"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[10px] text-slate-500">
                            {new Date(game.startTime).toLocaleTimeString([], {
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </span>
                          <div className="font-bold text-slate-300 text-sm whitespace-nowrap">
                            {game.awayTeamId} <span className="text-slate-600">@</span> {game.homeTeamId}
                          </div>
                        </div>
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {leagueUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-800/30">
                    <td className="sticky left-0 z-10 bg-slate-900 p-4 border-r border-slate-800 font-medium text-slate-200 flex items-center gap-3">
                      {user.avatar && <img src={user.avatar} className="w-6 h-6 rounded-full" alt="" />}
                      {user.name}
                    </td>
                    {weekGames.map(game => {
                      const pick = leaguePicks.find(p => p.userId === user.id && p.gameId === game.id);
                      let cellClass = 'p-3 text-center border-l border-slate-800/50';
                      let textClass = 'font-bold text-slate-400';

                      if (pick && game.status === 'FINAL') {
                        const isWin =
                          (game.homeScore! > game.awayScore! &&
                            pick.selectedTeamId === game.homeTeamId) ||
                          (game.awayScore! > game.homeScore! && pick.selectedTeamId === game.awayTeamId);
                        textClass = isWin
                          ? 'text-green-400'
                          : 'text-red-400 line-through decoration-red-500/50';
                      } else if (pick) {
                        textClass = 'text-ice-400';
                      }

                      return (
                        <td key={game.id} className={cellClass}>
                          {pick ? (
                            <div className="flex flex-col items-center">
                              <span className={`${textClass} text-lg`}>{pick.selectedTeamId}</span>
                              <span className="text-xs bg-slate-800 px-1.5 rounded text-slate-500 border border-slate-700">
                                {pick.confidence} pts
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-700">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
