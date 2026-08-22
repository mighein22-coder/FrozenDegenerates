import React from 'react';
import type { Segment, StandingsRow, User } from '../../types';
import { FULL_SEASON_LABEL } from '../../constants';

interface StandingsViewProps {
  standings: StandingsRow[];
  currentUser: User | null;
  segments: Segment[];
  /** null = full season */
  selectedSegment: number | null;
  onSelectSegment: (segment: number | null) => void;
}

/** "Oct 3 – Dec 5" for a segment's date range. */
function formatRange(segment: Segment): string {
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  return `${fmt(segment.startDate)} – ${fmt(segment.endDate)}`;
}

/**
 * Standings view - League leaderboard
 *
 * Scope is either one segment or the whole season. In a segment scope the rank,
 * record and points column all count only that segment's weeks, while the
 * Season column stays cumulative so nobody loses sight of the overall race.
 */
export const StandingsView: React.FC<StandingsViewProps> = ({
  standings,
  currentUser,
  segments,
  selectedSegment,
  onSelectSegment
}) => {
  const active = segments.find(s => s.number === selectedSegment) ?? null;
  const scopeLabel = active ? active.label : FULL_SEASON_LABEL;

  return (
  <div className="animate-in fade-in slide-in-from-bottom-4">
    <header className="mb-6">
      <h2 className="text-3xl font-display font-bold text-white">League Standings</h2>
      <p className="text-slate-400">
        {active ? `${active.label} · ${formatRange(active)}` : 'Full season, all weeks'}
      </p>
    </header>

    {/* Scope selector */}
    <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Standings scope">
      {[...segments.map(s => ({ key: s.number, label: s.label, hint: formatRange(s) })),
        { key: null, label: FULL_SEASON_LABEL, hint: 'Every week' }
      ].map(tab => {
        const isActive = tab.key === selectedSegment;
        return (
          <button
            key={tab.key ?? 'season'}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectSegment(tab.key)}
            title={tab.hint}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              isActive
                ? 'bg-ice-600 border-ice-500 text-white'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>

    {/* Mobile card list */}
    <div className="md:hidden space-y-2">
      {standings.map((row) => {
        const isCurrentUser = row.userId === currentUser?.id;
        return (
          <div
            key={row.userId}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
              isCurrentUser
                ? 'bg-ice-900/10 border-ice-800'
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            {/* Rank badge */}
            <span
              className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-display font-bold shrink-0 ${
                row.rank === 1
                  ? 'bg-yellow-500/20 text-yellow-500'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {row.rank}
            </span>

            {/* Name + W-L */}
            <div className="flex-1 min-w-0">
              <div className={`font-medium truncate ${isCurrentUser ? 'text-ice-400' : 'text-slate-200'}`}>
                {row.name}
              </div>
              <div className="text-xs text-slate-500">
                {row.wins}W – {row.losses}L
              </div>
            </div>

            {/* Scope points, this week, and season total when scoped */}
            <div className="text-right shrink-0">
              <div className="font-display font-bold text-white">{row.totalPoints}</div>
              <div className="text-xs flex items-center gap-1.5 justify-end">
                <span className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">
                  +{row.weeklyScore}
                </span>
                {active && (
                  <span className="text-slate-600 whitespace-nowrap">
                    {row.seasonPoints} season
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>

    {/* Desktop table */}
    <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-950 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
              <th className="p-4 font-medium">Rank</th>
              <th className="p-4 font-medium">Member</th>
              <th className="p-4 font-medium text-center">W-L</th>
              <th className="p-4 font-medium text-center">Weekly</th>
              {active && <th className="p-4 font-medium text-right">Season</th>}
              <th className="p-4 font-medium text-right">
                {active ? `${active.label} Pts` : 'Total Pts'}
              </th>
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
                {active && (
                  <td className="p-4 text-right text-slate-500 tabular-nums">
                    {row.seasonPoints}
                  </td>
                )}
                <td className="p-4 text-right font-display font-bold text-lg text-white">
                  {row.totalPoints}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {standings.length === 0 && (
      <p className="text-slate-500 text-sm mt-4">No members yet.</p>
    )}

    {active && (
      <p className="text-slate-600 text-xs mt-4">
        Rank, record and points count {active.label} only ({active.weekCount} weeks,{' '}
        {formatRange(active)}). The Season column stays cumulative.
      </p>
    )}
  </div>
  );
};
