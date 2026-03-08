import React from 'react';
import { Game } from '../types';
import { TEAMS } from '../constants';
import { Lock } from 'lucide-react';

interface GameCardProps {
  game: Game;
  isSelected: boolean;
  selectedTeamId: string | null;
  confidence: number;
  usedConfidences: number[];
  pickResult?: 'WIN' | 'LOSS' | 'PENDING';
  pointsEarned?: number;
  onSelectTeam: (gameId: string, teamId: string) => void;
  onSetConfidence: (gameId: string, confidence: number) => void;
  disabled?: boolean;
  teamRecords?: Record<string, string>;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  isSelected,
  selectedTeamId,
  confidence,
  usedConfidences,
  pickResult,
  pointsEarned,
  onSelectTeam,
  onSetConfidence,
  disabled = false,
  teamRecords = {}
}) => {
  const home = TEAMS[game.homeTeamId];
  const away = TEAMS[game.awayTeamId];

  // Safety check
  if (!home || !away) {
    return (
      <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-2 flex items-center justify-center text-red-400 text-xs">
        Error: {game.awayTeamId} vs {game.homeTeamId}
      </div>
    );
  }

  const getTeamStyles = (teamId: string) => {
    const isPicked = selectedTeamId === teamId;
    const base = "relative flex-1 p-2 rounded-lg transition-all duration-200 border border-transparent flex flex-col items-center justify-center gap-1";
    
    if (disabled) {
        if (isPicked) {
            return `${base} bg-ice-500/20 border-ice-500 cursor-default opacity-80`;
        }
        return `${base} opacity-40 grayscale cursor-default`;
    }

    return `${base} cursor-pointer 
      ${isPicked 
        ? 'bg-ice-500/10 border-ice-500 shadow-[0_0_10px_rgba(14,165,233,0.1)]' 
        : 'hover:bg-slate-800 hover:border-slate-700'
      }`;
  };

  const getLogoUrl = (abbr: string) => `https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg`;

  return (
    <div className={`group relative bg-slate-900 border border-slate-800 rounded-lg p-3 transition-all duration-300 ${isSelected ? 'ring-1 ring-ice-400/40 bg-slate-900/80' : 'hover:border-slate-700'}`}>
      
      {disabled && !isSelected && (
          <div className="absolute inset-0 bg-slate-950/70 z-10 pointer-events-none rounded-lg" />
      )}

      {/* Result Badge - Only show for WIN or LOSS, not PENDING */}
      {(pickResult === 'WIN' || pickResult === 'LOSS') && (
        <div className={`absolute -top-2 -right-2 z-30 px-2 py-1 rounded-md text-xs font-bold shadow-lg border ${pickResult === 'WIN' ? 'bg-green-900/90 text-green-400 border-green-500' : 'bg-red-900/90 text-red-400 border-red-500'}`}>
            {pickResult === 'WIN' ? 'WIN' : 'LOSS'}
            {pointsEarned !== undefined && pickResult === 'WIN' && ` +${pointsEarned}`}
            {pointsEarned !== undefined && pickResult === 'LOSS' && ` +0`}
        </div>
      )}

      {/* Header: Time */}
      <div className="flex items-center justify-between mb-2 relative z-20">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          {game.status === 'FINAL'
            ? 'FINAL'
            : new Date(game.startTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
          }
        </span>
      </div>

      {/* Teams Row */}
      <div className="flex items-stretch justify-between gap-2 relative z-20 mb-2">
        {/* Away Team */}
        <div 
          className={getTeamStyles(away.id)}
          onClick={() => !disabled && onSelectTeam(game.id, away.id)}
        >
          <img src={getLogoUrl(away.abbreviation)} alt={away.name} className="w-10 h-10 object-contain drop-shadow-md" />
          <div className="text-center leading-none">
             <span className="block font-bold text-slate-200 text-sm">{away.abbreviation}</span>
             <span className="block text-[10px] text-slate-500 mt-0.5">{away.name}</span>
             {teamRecords[away.abbreviation] && (
               <span className="block text-[10px] text-slate-500 mt-0.5">{teamRecords[away.abbreviation]}</span>
             )}
          </div>
          {selectedTeamId === away.id && (
             <div className="absolute top-1 right-1">
                {disabled ? <Lock size={10} className="text-ice-400" /> : <div className="w-2 h-2 bg-ice-500 rounded-full shadow-[0_0_5px_#38bdf8]" />}
             </div>
          )}
          {game.status === 'FINAL' && typeof game.awayScore === 'number' && (
             <div className="mt-1 font-display text-xl font-bold text-white">{game.awayScore}</div>
          )}
        </div>

        <div className="flex items-center justify-center text-slate-700 font-display text-lg font-bold italic">@</div>

        {/* Home Team */}
        <div 
          className={getTeamStyles(home.id)}
          onClick={() => !disabled && onSelectTeam(game.id, home.id)}
        >
           <img src={getLogoUrl(home.abbreviation)} alt={home.name} className="w-10 h-10 object-contain drop-shadow-md" />
           <div className="text-center leading-none">
            <span className="block font-bold text-slate-200 text-sm">{home.abbreviation}</span>
            <span className="block text-[10px] text-slate-500 mt-0.5">{home.name}</span>
            {teamRecords[home.abbreviation] && (
              <span className="block text-[10px] text-slate-500 mt-0.5">{teamRecords[home.abbreviation]}</span>
            )}
          </div>
          {selectedTeamId === home.id && (
             <div className="absolute top-1 right-1">
                {disabled ? <Lock size={10} className="text-ice-400" /> : <div className="w-2 h-2 bg-ice-500 rounded-full shadow-[0_0_5px_#38bdf8]" />}
             </div>
          )}
          {game.status === 'FINAL' && typeof game.homeScore === 'number' && (
             <div className="mt-1 font-display text-xl font-bold text-white">{game.homeScore}</div>
          )}
        </div>
      </div>

      {/* Confidence Selector (Only if selected) */}
      {isSelected && (
          <div className="mt-2 pt-2 border-t border-slate-800/50 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5 px-1">
                <span>Confidence</span>
                <span className={`font-bold ${confidence > 0 ? 'text-ice-400' : 'text-slate-600'}`}>{confidence > 0 ? `${confidence} pts` : 'Select'}</span>
            </div>
            <div className="flex justify-between gap-1">
                {[1, 2, 3, 4, 5].map(val => {
                    const isUsed = usedConfidences.includes(val) && confidence !== val;
                    const isActive = confidence === val;
                    return (
                        <button
                            key={val}
                            onClick={(e) => { e.stopPropagation(); onSetConfidence(game.id, val); }}
                            disabled={disabled || isUsed}
                            className={`
                                h-7 flex-1 rounded text-xs font-bold transition-all duration-200
                                ${isActive 
                                    ? 'bg-ice-500 text-white shadow-sm' 
                                    : isUsed 
                                        ? 'bg-slate-800/50 text-slate-700 cursor-not-allowed border border-transparent' 
                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                                }
                            `}
                        >
                            {val}
                        </button>
                    )
                })}
            </div>
          </div>
      )}
    </div>
  );
};