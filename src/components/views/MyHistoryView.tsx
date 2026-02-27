import React, { useMemo } from 'react';
import type { Week, Pick, Game } from '../../types';

interface MyHistoryViewProps {
  currentUserId: string;
  relevantWeeks: Week[];              // LOCKED | COMPLETED weeks, most-recent-first
  picksByWeek: Record<string, Pick[]>; // All league picks per week
  gamesByWeek: Record<string, Game[]>; // Games per week
}

const getLogoUrl = (abbr: string) =>
  `https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg`;

const getResultClass = (result: Pick['result']) => {
  if (result === 'WIN') return 'text-green-400';
  if (result === 'LOSS') return 'text-red-400 line-through decoration-red-500/50';
  return 'text-ice-400';
};

const formatWeekDate = (week: Week) =>
  new Date(week.startDate + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

/**
 * My History view — personal pick history across all completed/locked weeks
 */
export const MyHistoryView: React.FC<MyHistoryViewProps> = ({
  currentUserId,
  relevantWeeks,
  picksByWeek,
  gamesByWeek,
}) => {
  // Build one row per week with the current user's picks
  const weekRows = useMemo(() => {
    return relevantWeeks.map(week => {
      const allPicksForWeek = picksByWeek[week.id] ?? [];
      const myPicks = allPicksForWeek
        .filter(p => p.userId === currentUserId)
        .sort((a, b) => b.confidence - a.confidence); // highest confidence first
      const games = gamesByWeek[week.id] ?? [];

      const weekWins = myPicks.filter(p => p.result === 'WIN').length;
      const weekLosses = myPicks.filter(p => p.result === 'LOSS').length;
      const weekScore = myPicks.reduce((sum, p) => sum + p.pointsEarned, 0);

      return { week, myPicks, games, weekWins, weekLosses, weekScore };
    });
  }, [relevantWeeks, picksByWeek, gamesByWeek, currentUserId]);

  // Season summary stats
  const summaryStats = useMemo(() => {
    const weeksWithPicks = weekRows.filter(r => r.myPicks.length > 0);
    const totalWins = weeksWithPicks.reduce((sum, r) => sum + r.weekWins, 0);
    const totalLosses = weeksWithPicks.reduce((sum, r) => sum + r.weekLosses, 0);
    const totalPoints = weeksWithPicks.reduce((sum, r) => sum + r.weekScore, 0);
    const avgScore =
      weeksWithPicks.length > 0
        ? (totalPoints / weeksWithPicks.length).toFixed(1)
        : '0.0';
    return { totalWins, totalLosses, totalPoints, avgScore, weeksPlayed: weeksWithPicks.length };
  }, [weekRows]);

  // Loading: weeks are known but data hasn't arrived yet
  const isLoading = relevantWeeks.length > 0 && Object.keys(picksByWeek).length === 0;

  // Empty: no weeks exist or user has no picks in any of them
  const hasAnyPicks = weekRows.some(r => r.myPicks.length > 0);

  const pageHeader = (
    <header className="mb-8">
      <h2 className="text-3xl font-display font-bold text-white">My History</h2>
      <p className="text-slate-400">Your picks across all completed weeks</p>
    </header>
  );

  if (isLoading) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4">
        {pageHeader}
        <div className="text-slate-500 text-sm">Loading history…</div>
      </div>
    );
  }

  if (relevantWeeks.length === 0 || !hasAnyPicks) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4">
        {pageHeader}
        <div className="h-[40vh] flex flex-col items-center justify-center text-center">
          <div className="text-5xl mb-4">🏒</div>
          <h3 className="text-xl font-display font-bold text-white mb-2 uppercase tracking-widest">
            No Completed Picks Yet
          </h3>
          <p className="text-slate-400 max-w-md">
            Your pick history will appear here once the first week completes. Make your
            Saturday picks and check back!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-8">
      {pageHeader}

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">
            Season Record
          </div>
          <div className="text-2xl font-display font-bold">
            <span className="text-green-400">{summaryStats.totalWins}</span>
            <span className="text-slate-600 mx-1">-</span>
            <span className="text-red-400">{summaryStats.totalLosses}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">
            Total Points
          </div>
          <div className="text-2xl font-display font-bold text-white">
            {summaryStats.totalPoints}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">
            Avg Weekly Score
          </div>
          <div className="text-2xl font-display font-bold text-ice-400">
            {summaryStats.avgScore}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">
            Weeks Played
          </div>
          <div className="text-2xl font-display font-bold text-white">
            {summaryStats.weeksPlayed}
          </div>
        </div>
      </div>

      {/* Picks history table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                <th className="p-4 font-medium whitespace-nowrap">Week</th>
                <th className="p-4 font-medium" colSpan={5}>
                  Picks &nbsp;<span className="normal-case text-slate-600">(highest confidence first)</span>
                </th>
                <th className="p-4 font-medium text-center whitespace-nowrap">Score</th>
                <th className="p-4 font-medium text-center whitespace-nowrap">W-L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {weekRows.map(({ week, myPicks, games, weekWins, weekLosses, weekScore }) => {
                if (myPicks.length === 0) return null;

                return (
                  <tr key={week.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Week label */}
                    <td className="p-4 whitespace-nowrap align-top">
                      <div className="font-medium text-slate-200 text-sm">Wk {week.number}</div>
                      <div className="text-xs text-slate-500">{formatWeekDate(week)}</div>
                    </td>

                    {/* Pick cells (up to 5) */}
                    {myPicks.map(pick => {
                      const game = games.find(g => g.id === pick.gameId);
                      const opponent = game
                        ? pick.selectedTeamId === game.homeTeamId
                          ? game.awayTeamId
                          : game.homeTeamId
                        : null;
                      const resultClass = getResultClass(pick.result);

                      return (
                        <td
                          key={pick.gameId}
                          className="p-3 text-center border-l border-slate-800/50 min-w-[100px] align-top"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <img
                              src={getLogoUrl(pick.selectedTeamId)}
                              alt={pick.selectedTeamId}
                              className="w-7 h-7 object-contain"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <span className={`text-sm font-bold ${resultClass}`}>
                              {pick.selectedTeamId}
                            </span>
                            {opponent && (
                              <span className="text-[10px] text-slate-600">vs {opponent}</span>
                            )}
                            <span className="text-xs bg-slate-800 px-1.5 rounded text-slate-500 border border-slate-700">
                              {pick.confidence} pts
                            </span>
                          </div>
                        </td>
                      );
                    })}

                    {/* Pad to always have 5 pick columns */}
                    {Array.from({ length: Math.max(0, 5 - myPicks.length) }).map((_, i) => (
                      <td
                        key={`empty-${i}`}
                        className="p-3 border-l border-slate-800/50 min-w-[100px] align-top"
                      >
                        <span className="block text-center text-slate-700">—</span>
                      </td>
                    ))}

                    {/* Weekly score */}
                    <td className="p-4 text-center border-l border-slate-800/50 align-top">
                      <span className="inline-block px-2 py-1 bg-slate-800 rounded text-sm font-display font-bold text-white">
                        +{weekScore}
                      </span>
                    </td>

                    {/* W-L */}
                    <td className="p-4 text-center border-l border-slate-800/50 align-top whitespace-nowrap text-sm">
                      <span className="text-green-400 font-bold">{weekWins}</span>
                      <span className="text-slate-600 mx-1">-</span>
                      <span className="text-red-400 font-bold">{weekLosses}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
