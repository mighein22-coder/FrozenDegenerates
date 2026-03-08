import React, { useState, useEffect } from 'react';
import { Lock, Clock, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import type { Week, Game, Pick } from '../../types';
import { GameCard } from '../GameCard';
import { Button } from '../Button';

interface PicksViewProps {
  selectedWeekId: string;
  weeks: Week[];
  isLocked: boolean;
  timeLeft: string;
  currentPicks: Partial<Pick>[];
  saveStatus: 'IDLE' | 'SAVING' | 'SAVED' | 'ERROR';
  errorMessage: string;
  weekGames: Game[];
  handleSelectTeam: (gameId: string, teamId: string) => void;
  handleSetConfidence: (gameId: string, val: number) => void;
  handleSubmitPicks: () => void;
  isPickSheetValid: boolean;
  loadingSchedule: boolean;
  sourceUrl?: string;
}

/**
 * Picks view - Weekly game selection interface
 */
export const PicksView: React.FC<PicksViewProps> = ({
  selectedWeekId,
  weeks,
  isLocked,
  timeLeft,
  currentPicks,
  saveStatus,
  errorMessage,
  weekGames,
  handleSelectTeam,
  handleSetConfidence,
  handleSubmitPicks,
  isPickSheetValid,
  loadingSchedule,
  sourceUrl
}) => {
  const [teamRecords, setTeamRecords] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/.netlify/functions/team-records')
      .then(res => res.ok ? res.json() : {})
      .then(data => setTeamRecords(data))
      .catch(() => {});
  }, []);

  const usedConfidences = currentPicks.map(p => p.confidence || 0).filter(c => c > 0);
  const targetDateStr = selectedWeekId.replace('week-', '');

  // Parse date string at noon UTC to avoid timezone offset issues
  // (midnight UTC would show as previous day in ET timezone)
  const displayDate = new Date(targetDateStr + 'T12:00:00Z');

  return (
    <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <header className="flex flex-col lg:flex-row lg:justify-between lg:items-center sticky top-0 bg-slate-950/90 backdrop-blur-md py-4 z-30 border-b border-slate-800 gap-4 -mx-4 px-4 lg:-mx-10 lg:px-10">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold text-white uppercase tracking-wider">
              Saturday, {displayDate.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
            </h2>
            <div className="flex items-center gap-3 text-slate-400 text-sm mt-1">
              <span className={`flex items-center gap-1 ${isLocked ? 'text-slate-500' : 'text-ice-400'}`}>
                {isLocked ? <Lock size={14} /> : <Clock size={14} />}
                {isLocked ? 'Selections Locked' : `Deadline: 10AM ET (${timeLeft})`}
              </span>
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-ice-400 transition-colors"
                >
                  <ExternalLink size={10} /> Source: NHL.com
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 justify-between lg:justify-end">
          <div className="text-right">
            <div className="text-xs text-slate-500 uppercase">Selected</div>
            <div className={`font-bold ${currentPicks.length === 5 ? 'text-green-400' : 'text-slate-200'}`}>
              {currentPicks.length}/5
            </div>
          </div>
          {isLocked ? (
            <div className="bg-slate-800 px-4 py-2 rounded text-slate-400 font-bold border border-slate-700 flex items-center gap-2">
              <Lock size={16} /> Locked
            </div>
          ) : (
            <Button
              onClick={handleSubmitPicks}
              disabled={!isPickSheetValid || saveStatus === 'SAVED' || loadingSchedule}
              variant={isPickSheetValid ? 'primary' : 'secondary'}
            >
              {saveStatus === 'SAVING' ? 'Saving...' : saveStatus === 'SAVED' ? 'Updated!' : 'Submit Picks'}
            </Button>
          )}
        </div>
      </header>

      {/* Loading State */}
      {loadingSchedule ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <RefreshCw className="text-ice-500 animate-spin" size={48} />
          <p className="text-slate-400 font-display text-xl uppercase tracking-widest">
            Synchronizing Production Schedule...
          </p>
        </div>
      ) : (
        <>
          {/* Error Message */}
          {saveStatus === 'ERROR' && (
            <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-200 animate-in fade-in slide-in-from-top-2">
              {errorMessage}
            </div>
          )}

          {/* Validation Warning */}
          {!isPickSheetValid && currentPicks.length > 0 && !isLocked && (
            <div className="bg-ice-900/20 border border-ice-500/20 rounded-lg p-3 text-sm text-ice-200 flex items-center gap-2">
              <AlertCircle size={16} />
              <span>Select 5 winners and assign a unique confidence score (1-5) to each directly on the card.</span>
            </div>
          )}

          {/* Game Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {weekGames.length === 0 ? (
              <div className="col-span-full py-24 text-center">
                <p className="text-slate-500 text-lg">No games scheduled for this Saturday.</p>
                <p className="text-slate-600 text-sm mt-2">Check back later as the schedule is updated weekly.</p>
              </div>
            ) : (
              weekGames.map(game => {
                const pick = currentPicks.find(p => p.gameId === game.id);
                return (
                  <GameCard
                    key={game.id}
                    game={game}
                    isSelected={!!pick}
                    selectedTeamId={pick?.selectedTeamId || null}
                    confidence={pick?.confidence || 0}
                    usedConfidences={usedConfidences}
                    pickResult={pick?.result}
                    pointsEarned={pick?.pointsEarned}
                    onSelectTeam={handleSelectTeam}
                    onSetConfidence={handleSetConfidence}
                    disabled={isLocked}
                    teamRecords={teamRecords}
                  />
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
};
