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

type CellState =
  | { kind: 'win' | 'loss' | 'pending'; teamId: string; confidence: number }
  | { kind: 'hidden' }
  | { kind: 'none' };

/**
 * What to show for one player's pick on one game.
 *
 * Shared by the desktop matrix and the mobile card list so the two can never
 * disagree about whether a pick is revealed.
 */
function cellState(game: Game, pick: Pick | undefined, isLocked: boolean): CellState {
  if (game.status === 'FINAL') {
    if (!pick) return { kind: 'none' };
    const isWin =
      (game.homeScore! > game.awayScore! && pick.selectedTeamId === game.homeTeamId) ||
      (game.awayScore! > game.homeScore! && pick.selectedTeamId === game.awayTeamId);
    return {
      kind: isWin ? 'win' : 'loss',
      teamId: pick.selectedTeamId,
      confidence: pick.confidence
    };
  }

  // Game unfinished and the deadline hasn't passed — picks stay concealed
  if (!isLocked) return { kind: 'hidden' };

  if (!pick) return { kind: 'none' };
  return { kind: 'pending', teamId: pick.selectedTeamId, confidence: pick.confidence };
}

const TEAM_TEXT_CLASS: Record<'win' | 'loss' | 'pending', string> = {
  win: 'text-green-400',
  loss: 'text-red-400 line-through decoration-red-500/50',
  pending: 'text-ice-400'
};

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
            Results will be available after the Saturday 10:00 AM ET deadline passes.
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

      {/* Mobile: one card per player, since a games-wide table can't be read on a phone */}
      <div className="md:hidden space-y-3">
        {leagueUsers.map(user => {
          const sortedGames = [...weekGames].sort(
            (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
          );

          return (
            <div key={user.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-950/60 border-b border-slate-800">
                {user.avatar && <img src={user.avatar} className="w-6 h-6 rounded-full" alt="" />}
                <span className="font-medium text-slate-200 truncate">{user.name}</span>
              </div>

              <ul className="divide-y divide-slate-800/70">
                {sortedGames.map(game => {
                  const pick = leaguePicks.find(p => p.userId === user.id && p.gameId === game.id);
                  const state = cellState(game, pick, isLocked);

                  return (
                    <li key={game.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        {game.awayTeamId} <span className="text-slate-700">@</span> {game.homeTeamId}
                      </span>

                      {state.kind === 'none' && <span className="text-slate-700">-</span>}
                      {state.kind === 'hidden' && (
                        <span className="font-bold text-slate-600">?</span>
                      )}
                      {(state.kind === 'win' || state.kind === 'loss' || state.kind === 'pending') && (
                        <span className="flex items-center gap-2">
                          <span className={`${TEAM_TEXT_CLASS[state.kind]} font-bold`}>
                            {state.teamId}
                          </span>
                          <span className="text-xs bg-slate-800 px-1.5 rounded text-slate-500 border border-slate-700">
                            {state.confidence} pts
                          </span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Desktop: full matrix. Per-cell logic handles open vs locked weeks. */}
      <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-950 p-2 md:p-4 border-b border-r border-slate-800 min-w-[90px] md:min-w-[120px] text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Player
                </th>
                {weekGames
                  .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                  .map(game => (
                    <th
                      key={game.id}
                      className="p-2 border-b border-slate-800 text-center min-w-[80px] md:min-w-[120px] bg-slate-900/50"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          {new Date(game.startTime).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                          {/* Lock icon for non-FINAL games in an open week */}
                          {!isLocked && game.status !== 'FINAL' && (
                            <Lock size={9} className="text-orange-500/70" />
                          )}
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
                  <td className="sticky left-0 z-10 bg-slate-900 p-2 md:p-4 border-r border-slate-800 font-medium text-slate-200 flex items-center gap-3">
                    {user.avatar && <img src={user.avatar} className="w-6 h-6 rounded-full" alt="" />}
                    {user.name}
                  </td>
                  {weekGames.map(game => {
                    const pick = leaguePicks.find(p => p.userId === user.id && p.gameId === game.id);
                    const state = cellState(game, pick, isLocked);
                    const cellClass = 'p-2 md:p-3 text-center border-l border-slate-800/50';

                    if (state.kind === 'none') {
                      return <td key={game.id} className={cellClass}><span className="text-slate-700">-</span></td>;
                    }
                    if (state.kind === 'hidden') {
                      return (
                        <td key={game.id} className={cellClass}>
                          <span className="font-bold text-slate-600">?</span>
                        </td>
                      );
                    }
                    return (
                      <td key={game.id} className={cellClass}>
                        <div className="flex flex-col items-center">
                          <span className={`${TEAM_TEXT_CLASS[state.kind]} text-lg font-bold`}>
                            {state.teamId}
                          </span>
                          <span className="text-xs bg-slate-800 px-1.5 rounded text-slate-500 border border-slate-700">
                            {state.confidence} pts
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
