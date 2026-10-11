import React, { useMemo } from 'react';
import { MemberAvatar } from '../MemberAvatar';
import type { User, Pick } from '../../types';
import { TEAMS } from '../../constants';
import { AFFINITY_SORTS, sortAffinity, summarizeAffinity } from '../../lib/affinity';
import type { AffinitySort } from '../../lib/affinity';

interface TeamStatsViewProps {
  leagueUsers: User[];
  /** Picks from completed weeks only. */
  allPicks: Pick[];
  /** The member whose affinity is showing. */
  selectedUserId: string | undefined;
  sort: AffinitySort;
  onUserChange: (userId: string) => void;
  onSortChange: (sort: AffinitySort) => void;
}

const sortLabel: Record<AffinitySort, string> = {
  picks: 'Times picked',
  confidence: 'Confidence',
  points: 'Points'
};

const getLogoUrl = (abbr: string) => `https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg`;

/**
 * Team Affinity — one member's picks from completed weeks, rolled up per team:
 * times picked, confidence assigned, win-loss and points earned.
 */
export const TeamStatsView: React.FC<TeamStatsViewProps> = ({
  leagueUsers,
  allPicks,
  selectedUserId,
  sort,
  onUserChange,
  onSortChange
}) => {
  const member = leagueUsers.find(u => u.id === selectedUserId);

  const rows = useMemo(
    () =>
      sortAffinity(
        summarizeAffinity(allPicks.filter(p => p.userId === selectedUserId)),
        sort
      ),
    [allPicks, selectedUserId, sort]
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (t, r) => ({
          count: t.count + r.count,
          confidenceSum: t.confidenceSum + r.confidenceSum,
          wins: t.wins + r.wins,
          losses: t.losses + r.losses,
          points: t.points + r.points
        }),
        { count: 0, confidenceSum: 0, wins: 0, losses: 0, points: 0 }
      ),
    [rows]
  );

  const sortedUsers = useMemo(
    () => [...leagueUsers].sort((a, b) => a.name.localeCompare(b.name)),
    [leagueUsers]
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4">
      <header className="mb-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-white">Team Affinity</h2>
          <p className="text-slate-400">Every team a member has picked, from completed weeks</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:gap-4">
          {/* Sort pills. */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Sort by</span>
            <div
              role="group"
              aria-label="Sort teams by"
              className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900 p-0.5"
            >
              {AFFINITY_SORTS.map(value => {
                const isActive = sort === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onSortChange(value)}
                    className={`px-3 py-1 min-h-10 md:min-h-0 flex items-center md:block rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-ice-600 text-onaccent'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sortLabel[value]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Member selector. */}
          <select
            value={selectedUserId ?? ''}
            onChange={e => onUserChange(e.target.value)}
            aria-label="Member"
            className="min-h-11 md:min-h-0 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-ice-500"
          >
            {sortedUsers.map(u => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {member && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center gap-4 p-5 border-b border-slate-800">
            <MemberAvatar avatar={member.avatar} name={member.name} className="w-12 h-12 text-lg shrink-0" />
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white truncate">{member.name}</h3>
              <span className="text-xs text-slate-500 uppercase tracking-widest">
                {totals.count} {totals.count === 1 ? 'pick' : 'picks'} · {totals.wins}-{totals.losses} · {totals.points} pts
              </span>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="py-10 text-center text-slate-600 text-sm italic">
              No picks from completed weeks yet
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase font-bold tracking-widest border-b border-slate-800">
                  <th scope="col" className="text-left py-3 pl-5 pr-2">Team</th>
                  <th scope="col" className="text-right py-3 px-2">Picked</th>
                  <th scope="col" className="text-right py-3 px-2">Conf</th>
                  <th scope="col" className="text-right py-3 px-2">W-L</th>
                  <th scope="col" className="text-right py-3 pl-2 pr-5">Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const team = TEAMS[row.id];
                  return (
                    <tr key={row.id} className="border-b border-slate-800/60 last:border-0">
                      <td className="py-2 pl-5 pr-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={getLogoUrl(row.id)}
                            alt=""
                            className="w-8 h-8 shrink-0 object-contain"
                          />
                          <div className="min-w-0">
                            <span className="font-bold text-white">{row.id}</span>
                            <span className="hidden sm:inline text-slate-400 ml-2">{team?.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="text-right py-2 px-2 tabular-nums text-white">{row.count}</td>
                      <td className="text-right py-2 px-2 tabular-nums text-slate-300">{row.confidenceSum}</td>
                      <td className="text-right py-2 px-2 tabular-nums text-slate-300">
                        {row.wins}-{row.losses}
                      </td>
                      <td className="text-right py-2 pl-2 pr-5 tabular-nums font-bold text-white">{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
