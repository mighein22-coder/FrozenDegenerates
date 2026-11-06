import React, { useMemo } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { MemberAvatar } from '../MemberAvatar';
import { TEAMS } from '../../constants';
import {
  gamePicksPath,
  gameWinnerId,
  picksOpenLabel,
  summarizeGamePicks,
  type GameSide
} from '../../lib/gamePicks';
import type { Profile } from '../../lib/supabase';
import type { Game, Pick, Week } from '../../types';

interface GamePicksViewProps {
  selectedWeekId: string;
  availableWeeks: Week[];
  /** The same deadline check the Matrix reveals on. */
  isLocked: boolean;
  weekGames: Game[];
  leaguePicks: Pick[];
  members: Profile[];
  currentUserId?: string;
  /** True until the selected week's games and picks have arrived. */
  loading: boolean;
  loadFailed: boolean;
}

/**
 * Who picked a particular game (issue #54), at /matrix/game/:gameId?week=.
 *
 * It sits under the Matrix rather than in the menu, shares the Matrix's week
 * and its loaded data, and adds no query. A game is shown only once its week is
 * locked (see lib/gamePicks.ts): before that the games stay listed, greyed,
 * saying when they open, and a link straight to one says the same rather than
 * rendering a tally of one.
 */
export const GamePicksView: React.FC<GamePicksViewProps> = ({
  selectedWeekId,
  availableWeeks,
  isLocked,
  weekGames,
  leaguePicks,
  members,
  currentUserId,
  loading,
  loadFailed
}) => {
  const { gameId } = useParams<{ gameId?: string }>();
  const { search } = useLocation();
  const navigate = useNavigate();

  const week = availableWeeks.find(w => w.id === selectedWeekId);
  const games = [...weekGames].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
  const chosen = gameId ? games.find(game => game.id === gameId) : undefined;
  const opensLabel = week ? picksOpenLabel(week.startDate) : '';

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4">
      <Link
        to={`/matrix${search}`}
        className="mb-3 inline-flex min-h-11 md:min-h-0 items-center gap-1.5 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft size={16} aria-hidden /> League Matrix
      </Link>

      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-white uppercase tracking-wider">
            Game Picks
          </h2>
          <p className="text-slate-400 text-sm">Who picked each side of a game.</p>
        </div>

        {week && (
          <select
            aria-label="Week"
            value={selectedWeekId}
            onChange={event => navigate(gamePicksPath(search, event.target.value))}
            className="min-h-11 md:min-h-0 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-ice-500"
          >
            {availableWeeks.map(option => (
              <option key={option.id} value={option.id}>
                Week {option.number} -{' '}
                {new Date(option.startDate + 'T12:00:00Z').toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC'
                })}
              </option>
            ))}
          </select>
        )}
      </header>

      {!week && <Note>No week has been played yet.</Note>}
      {week && loadFailed && <Note>Could not load this week. Refresh the page to try again.</Note>}
      {week && !loadFailed && loading && <Note>Loading the week…</Note>}

      {week && !loadFailed && !loading && (
        <>
          {games.length === 0 ? (
            <Note>This week has no games yet.</Note>
          ) : (
            <nav aria-label="Games" className="mb-6 grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {games.map(game => {
                const matchup = (
                  <span className="block font-bold text-sm whitespace-nowrap">
                    {game.awayTeamId} <span className="text-slate-600">@</span> {game.homeTeamId}
                  </span>
                );

                if (!isLocked) {
                  return (
                    <span
                      key={game.id}
                      aria-disabled="true"
                      className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-slate-500 opacity-70"
                    >
                      {matchup}
                      <span className="block text-[11px]">{opensLabel}</span>
                    </span>
                  );
                }

                const isChosen = game.id === chosen?.id;
                return (
                  <Link
                    key={game.id}
                    to={gamePicksPath(search, selectedWeekId, game.id)}
                    aria-current={isChosen ? 'page' : undefined}
                    className={`flex min-h-11 flex-col justify-center rounded-lg border px-3 py-2 transition-colors ${
                      isChosen
                        ? 'border-ice-500 bg-ice-500/10 text-white'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {matchup}
                    <span className="block text-[11px] text-slate-500">
                      {new Date(game.startTime).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </span>
                  </Link>
                );
              })}
            </nav>
          )}

          {gameId && !chosen && games.length > 0 && (
            <Note>That game is not in this week. Choose one above.</Note>
          )}

          {chosen && !isLocked && (
            <Note>
              Picks on {chosen.awayTeamId} @ {chosen.homeTeamId} are not public yet. {opensLabel}.
            </Note>
          )}

          {chosen && isLocked && (
            <GameDetail
              game={chosen}
              leaguePicks={leaguePicks}
              members={members}
              currentUserId={currentUserId}
            />
          )}

          {!gameId && games.length > 0 && (
            <Note>
              {isLocked
                ? 'Choose a game to see who took each side.'
                : `Picks stay hidden until the deadline. ${opensLabel}.`}
            </Note>
          )}
        </>
      )}
    </div>
  );
};

const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-6 text-center text-sm text-slate-400">
    {children}
  </p>
);

const GameDetail: React.FC<{
  game: Game;
  leaguePicks: Pick[];
  members: Profile[];
  currentUserId?: string;
}> = ({ game, leaguePicks, members, currentUserId }) => {
  const summary = useMemo(
    () => summarizeGamePicks(game, leaguePicks, members),
    [game, leaguePicks, members]
  );
  const winnerId = gameWinnerId(game);

  return (
    <div>
      <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-white">
        {game.awayTeamId} @ {game.homeTeamId}
      </h3>
      <p className="mt-1 text-sm text-slate-400">
        {winnerId
          ? `Final: ${game.awayTeamId} ${game.awayScore}, ${game.homeTeamId} ${game.homeScore}`
          : game.status === 'LIVE'
            ? 'In progress'
            : 'Not started'}
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <SidePanel side={summary.away} winnerId={winnerId} currentUserId={currentUserId} />
        <SidePanel side={summary.home} winnerId={winnerId} currentUserId={currentUserId} />
      </div>

      {/* Most of the league is usually here: a sheet is five games of the
          whole Saturday slate, so this is the normal case, not a gap. */}
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h4 className="text-sm text-slate-400">
          No pick on this game <span className="tabular-nums text-slate-500">({summary.noPick.length})</span>
        </h4>
        {summary.noPick.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Everybody picked this game.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
            {summary.noPick.map(member => (
              <li key={member.id}>{member.name}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const SidePanel: React.FC<{
  side: GameSide;
  winnerId: string | null;
  currentUserId?: string;
}> = ({ side, winnerId, currentUserId }) => {
  const team = TEAMS[side.teamId];
  const outcome = winnerId === null ? null : winnerId === side.teamId ? 'won' : 'lost';
  const teamClass =
    outcome === 'won' ? 'text-green-400' : outcome === 'lost' ? 'text-red-400' : 'text-ice-400';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className={`font-display text-xl font-bold tracking-wide ${teamClass}`}>
          {team ? `${team.city} ${team.name}` : side.teamId}
        </h4>
        <span className="shrink-0 text-sm text-slate-400 tabular-nums">
          {side.picks.length} {side.picks.length === 1 ? 'pick' : 'picks'} · {side.totalConfidence} pts
        </span>
      </div>

      {side.picks.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nobody took {side.teamId}.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {side.picks.map(({ member, pick }) => (
            <li
              key={member.id}
              className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1 ${
                member.id === currentUserId ? 'bg-ice-500/10' : ''
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <MemberAvatar avatar={member.avatar} name={member.name} />
                <span className="truncate text-slate-200">{member.name}</span>
              </span>
              <span className="shrink-0 text-xs bg-slate-800 px-1.5 rounded text-slate-400 border border-slate-700">
                {pick.confidence} pts
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
