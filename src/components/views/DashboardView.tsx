import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, Lock } from 'lucide-react';
import type { Profile } from '../../lib/supabase';
import type { Game, Pick, Segment, StandingsRow, Week } from '../../types';
import { Button } from '../Button';
import { MemberAvatar } from '../MemberAvatar';
import { TEAMS, FULL_SEASON_LABEL } from '../../constants';
import { formatETTime, getPickDeadline } from '../../lib/timezone';
import { summarizeWeekSheet, topStandings, type WeekSheet } from '../../lib/dashboard';

/**
 * Where the week stands, modelled on the DegenNFL dashboard: this member's
 * sheet and the deadline side by side, the top of the table underneath.
 *
 * `weekPicks` are the member's *saved* picks, not the Picks screen's working
 * copy — the dashboard reports what the pool will score, and an unsaved edit
 * scores nothing.
 *
 * The standings arrive already scoped to the current segment, which is what the
 * Standings screen opens on, so the top five here is the top five there. The
 * order comes from `computeStandings`; nothing on this screen re-sorts it.
 */
interface DashboardViewProps {
  user: Profile;
  week: Week | null;
  weekGames: Game[];
  weekPicks: Pick[];
  isLocked: boolean;
  timeLeft: string;
  standings: StandingsRow[];
  /** The scope `standings` covers; null is the full season. */
  segment: Segment | null;
}

const PICKS_PER_WEEK = 5;
const TOP_N = 5;

const getLogoUrl = (abbr: string) =>
  `https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg`;

/** "Oct 3 – Dec 5" for a segment's date range. */
const formatRange = (segment: Segment) => {
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
  return `${fmt(segment.startDate)} – ${fmt(segment.endDate)}`;
};

const formatWeekDate = (week: Week) =>
  new Date(`${week.startDate}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  week,
  weekGames,
  weekPicks,
  isLocked,
  timeLeft,
  standings,
  segment
}) => {
  const navigate = useNavigate();

  const sheet = useMemo(
    () => summarizeWeekSheet(weekPicks, weekGames),
    [weekPicks, weekGames]
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <header>
        <h2 className="text-3xl font-display font-bold text-white">
          {week ? `Week of ${formatWeekDate(week)}` : 'Dashboard'}
        </h2>
        <p className="text-slate-400">
          <StatusLine sheet={sheet} isLocked={isLocked} />
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-5">
        <div className="md:col-span-3">
          <PicksPanel
            sheet={sheet}
            isLocked={isLocked}
            onGoToPicks={() => navigate('/picks')}
          />
        </div>
        <div className="md:col-span-2">
          <DeadlinePanel
            week={week}
            games={weekGames}
            isLocked={isLocked}
            timeLeft={timeLeft}
          />
        </div>
      </div>

      <TopStandingsPanel standings={standings} segment={segment} userId={user.id} />
    </div>
  );
};

/** The one-line answer to "where am I?", under the heading. */
const StatusLine: React.FC<{ sheet: WeekSheet; isLocked: boolean }> = ({
  sheet,
  isLocked
}) => {
  const picked = sheet.lines.length;

  if (!isLocked) {
    return picked === 0 ? (
      <>No picks in yet — {PICKS_PER_WEEK} games to choose and rank.</>
    ) : (
      <>All {PICKS_PER_WEEK} picks are in. You can change them until the deadline.</>
    );
  }

  if (picked === 0) return <>The sheet closed without your picks.</>;
  if (sheet.pending === picked) return <>Picks are locked. Waiting on the games.</>;
  if (sheet.pending > 0) {
    return (
      <>
        {sheet.points} points so far, {sheet.pending} still to play.
      </>
    );
  }
  return <>Final: {sheet.points} points this week.</>;
};

/** This member's sheet for the week, most confident first. */
const PicksPanel: React.FC<{
  sheet: WeekSheet;
  isLocked: boolean;
  onGoToPicks: () => void;
}> = ({ sheet, isLocked, onGoToPicks }) => {
  const hasPicks = sheet.lines.length > 0;
  const anyScored = sheet.wins + sheet.losses > 0;

  return (
    <section className="h-full bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xl font-display font-bold text-white">Your Picks</h3>
        {anyScored && (
          <div className="text-sm text-slate-400 tabular-nums">
            <span className="text-green-400">{sheet.wins}</span>
            <span className="text-slate-600 mx-1">-</span>
            <span className="text-red-400">{sheet.losses}</span>
            <span className="text-slate-600 mx-2">·</span>
            <span className="text-white font-semibold">{sheet.points}</span> pts
          </div>
        )}
      </div>

      {hasPicks ? (
        <ul className="mt-4 divide-y divide-slate-800">
          {sheet.lines.map(({ pick, game }) => (
            <PickLine key={pick.gameId} pick={pick} game={game} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-slate-400">
          {isLocked
            ? 'No sheet was submitted this week, so there is nothing to score.'
            : `Choose ${PICKS_PER_WEEK} of Saturday's games and rank them ${PICKS_PER_WEEK} (most confident) down to 1.`}
        </p>
      )}

      <div className="mt-5">
        {isLocked ? (
          <Link to="/matrix" className="text-sm text-ice-400 hover:text-ice-300">
            See everyone's picks in the League Matrix →
          </Link>
        ) : (
          <Button onClick={onGoToPicks} className="w-full sm:w-auto">
            {hasPicks ? 'Edit Picks' : 'Make Picks'}
          </Button>
        )}
      </div>
    </section>
  );
};

/** One pick: confidence, the side taken, the game's state, and what it earned. */
const PickLine: React.FC<{ pick: Pick; game: Game | undefined }> = ({ pick, game }) => {
  const team = TEAMS[pick.selectedTeamId];
  const abbr = team?.abbreviation ?? pick.selectedTeamId;

  const isHome = game?.homeTeamId === pick.selectedTeamId;
  const opponentId = game ? (isHome ? game.awayTeamId : game.homeTeamId) : undefined;

  const resultClass =
    pick.result === 'WIN'
      ? 'text-green-400'
      : pick.result === 'LOSS'
        ? 'text-red-400'
        : 'text-slate-500';

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-ice-900/40 border border-ice-500/30 font-display font-bold text-ice-400 shrink-0"
        title={`Confidence ${pick.confidence}`}
      >
        {pick.confidence}
      </span>

      <img src={getLogoUrl(abbr)} alt="" className="w-8 h-8 shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-200 truncate">
          {team ? `${team.city} ${team.name}` : abbr}
        </div>
        <div className="text-xs text-slate-500 truncate">
          {opponentId && (
            <>
              {isHome ? 'vs' : '@'} {opponentId}
              <span className="mx-1.5">·</span>
            </>
          )}
          <GameState game={game} />
        </div>
      </div>

      <span
        className={`font-display font-bold tabular-nums text-right w-10 shrink-0 ${resultClass}`}
        title={pick.result === 'PENDING' ? 'Not yet scored' : pick.result.toLowerCase()}
      >
        {pick.result === 'PENDING' ? '—' : `+${pick.pointsEarned}`}
      </span>
    </li>
  );
};

/** Puck drop, live, or the final score, away first as the NHL writes it. */
const GameState: React.FC<{ game: Game | undefined }> = ({ game }) => {
  if (!game) return null;

  const score =
    game.awayScore != null && game.homeScore != null
      ? `${game.awayTeamId} ${game.awayScore} – ${game.homeScore} ${game.homeTeamId}`
      : '';

  if (game.status === 'FINAL') return <>Final{score && `: ${score}`}</>;
  if (game.status === 'LIVE') {
    return <span className="text-amber-400">Live{score && ` · ${score}`}</span>;
  }
  return <>{formatETTime(new Date(game.startTime), 'EEE h:mm a zzz')}</>;
};

/**
 * The one deadline this pool has — Saturday noon ET — and, once it has passed,
 * how far through the slate the games are.
 */
const DeadlinePanel: React.FC<{
  week: Week | null;
  games: Game[];
  isLocked: boolean;
  timeLeft: string;
}> = ({ week, games, isLocked, timeLeft }) => {
  const deadline = week ? getPickDeadline(week.startDate) : null;

  const firstPuckDrop =
    games.length > 0
      ? new Date(Math.min(...games.map(g => new Date(g.startTime).getTime())))
      : null;

  const finals = games.filter(g => g.status === 'FINAL').length;
  const live = games.filter(g => g.status === 'LIVE').length;

  return (
    <section className="h-full bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="flex items-center gap-2 text-xl font-display font-bold text-white">
        {isLocked ? <Lock size={18} aria-hidden /> : <Clock size={18} aria-hidden />}
        Deadline
      </h3>

      <div className="mt-4">
        <div className="text-xs uppercase tracking-wider text-slate-500">
          {isLocked ? 'Picks locked' : 'Picks lock in'}
        </div>
        <div className="text-4xl font-display font-bold text-ice-400 tabular-nums">
          {isLocked ? 'Locked' : timeLeft || '—'}
        </div>
        {deadline && (
          <div className="text-sm text-slate-400">
            {formatETTime(deadline, 'EEEE, MMM d · h:mm a zzz')}
          </div>
        )}
      </div>

      {games.length > 0 && (
        <div className="mt-5 border-t border-slate-800 pt-4">
          {isLocked ? (
            <>
              <div className="text-xs uppercase tracking-wider text-slate-500">Games</div>
              <div className="text-2xl font-display font-bold text-white tabular-nums">
                {finals} <span className="text-slate-500 text-lg">of {games.length} final</span>
              </div>
              {live > 0 && <div className="text-sm text-amber-400">{live} in progress</div>}
            </>
          ) : (
            firstPuckDrop && (
              <>
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  First puck drop
                </div>
                <div className="text-sm text-slate-300">
                  {formatETTime(firstPuckDrop, 'EEE h:mm a zzz')} · {games.length} games
                </div>
              </>
            )
          )}
        </div>
      )}
    </section>
  );
};

/** The top of the table, plus this member's own row if they fall below the cut. */
const TopStandingsPanel: React.FC<{
  standings: StandingsRow[];
  segment: Segment | null;
  userId: string;
}> = ({ standings, segment, userId }) => {
  const { top, mine } = topStandings(standings, userId, TOP_N);

  const renderRow = (row: StandingsRow, detached: boolean) => {
    const isMe = row.userId === userId;
    return (
      <tr
        key={row.userId}
        className={`${detached ? 'border-t-2 border-dashed border-slate-700' : ''} ${
          isMe ? 'bg-ice-900/10' : ''
        }`}
      >
        <td className="py-2.5 pl-4 pr-2">
          <span
            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-display font-bold ${
              row.rank === 1 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {row.rank}
          </span>
        </td>
        <td className="py-2.5 pr-3">
          <span
            className={`flex items-center gap-2.5 font-medium ${
              isMe ? 'text-ice-400' : 'text-slate-200'
            }`}
          >
            <MemberAvatar avatar={row.avatar} name={row.name} />
            <span className="truncate">{row.name}</span>
          </span>
        </td>
        <td className="hidden sm:table-cell py-2.5 pr-3 text-center text-sm text-slate-400 tabular-nums">
          {row.wins}-{row.losses}
        </td>
        <td className="py-2.5 pr-3 text-center">
          <span className="inline-block px-2 py-0.5 bg-slate-800 rounded text-xs text-slate-300 tabular-nums">
            +{row.weeklyScore}
          </span>
        </td>
        <td className="py-2.5 pr-4 text-right font-display font-bold text-white tabular-nums">
          {row.totalPoints}
        </td>
      </tr>
    );
  };

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-xl font-display font-bold text-white">Top {TOP_N}</h3>
          <p className="text-sm text-slate-500">
            {segment ? `${segment.label} · ${formatRange(segment)}` : FULL_SEASON_LABEL}
          </p>
        </div>
        <Link to="/standings" className="text-sm text-ice-400 hover:text-ice-300 shrink-0">
          Full standings →
        </Link>
      </div>

      {top.length === 0 ? (
        <p className="text-slate-500 text-sm">No members yet.</p>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                <th scope="col" className="py-2 pl-4 pr-2 font-medium">#</th>
                <th scope="col" className="py-2 pr-3 font-medium">Member</th>
                <th scope="col" className="hidden sm:table-cell py-2 pr-3 font-medium text-center">W-L</th>
                <th scope="col" className="py-2 pr-3 font-medium text-center">Week</th>
                <th scope="col" className="py-2 pr-4 font-medium text-right">Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {top.map(row => renderRow(row, false))}
              {mine && renderRow(mine, true)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
