import React, { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, Calendar, Trophy, LogOut, CheckCircle2, AlertCircle, Clock, Lock, Grid3X3, ShieldAlert, ChevronDown, Heart, RefreshCw, ExternalLink } from 'lucide-react';
import { User, Game, Pick, StandingsRow, Week } from './types';
import { dataService, getTargetSaturdayDate } from './services/dataService';
import { MOCK_USERS, TEAMS } from './constants';
import { GameCard } from './components/GameCard';
import { Button } from './components/Button';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchRealNhlSchedule } from './services/geminiService';

type ViewState = 'LOGIN' | 'DASHBOARD' | 'PICKS' | 'STANDINGS' | 'RESULTS' | 'TEAM_STATS';

// --- Sub-View Components ---

interface LoginViewProps {
  loginEmail: string;
  setLoginEmail: (val: string) => void;
  handleLogin: (e: React.FormEvent) => void;
  loginError: string;
}

const LoginView: React.FC<LoginViewProps> = ({ loginEmail, setLoginEmail, handleLogin, loginError }) => (
  <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
    <div className="absolute inset-0 bg-slate-950">
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-ice-600/20 blur-[120px] rounded-full"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/20 blur-[120px] rounded-full"></div>
    </div>

    <div className="relative z-10 w-full max-w-md p-8">
      <div className="text-center mb-10">
        <h1 className="font-display text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-ice-200 mb-2">ICEPICK</h1>
        <p className="text-ice-200/60 uppercase tracking-widest text-sm">Official NHL Pick'em League</p>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl">
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Email Address</label>
            <input 
              type="email" 
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="demo@example.com"
              className="w-full bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-ice-500 focus:border-transparent transition-all outline-none placeholder:text-slate-600"
            />
          </div>
          {loginError && <p className="text-red-400 text-sm">{loginError}</p>}
          <Button type="submit" className="w-full" size="lg">Enter League</Button>
          <div className="text-center text-xs text-slate-500 mt-4">
            Tip: Use <code className="text-ice-400">user@example.com</code> to demo
          </div>
        </form>
      </div>
    </div>
  </div>
);

interface DashboardViewProps {
  currentUser: User | null;
  standings: StandingsRow[];
  currentPicks: Partial<Pick>[];
  setView: (v: ViewState) => void;
}

const DashboardView: React.FC<DashboardViewProps> = ({ currentUser, standings, currentPicks, setView }) => {
  const userStats = standings.find(s => s.userId === currentUser?.id);
  const mockChartData = [
    { name: 'Wk 1', score: 12 },
    { name: 'Wk 2', score: 8 },
    { name: 'Wk 3', score: 15 },
    { name: 'Wk 4', score: 10 },
    { name: 'Wk 5', score: userStats?.weeklyScore || 0 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-display font-bold text-white">Dashboard</h2>
          <p className="text-slate-400">Welcome back, {currentUser?.name}</p>
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-sm text-slate-400 uppercase tracking-wider">Current Rank</div>
          <div className="text-4xl font-display font-bold text-ice-400">#{userStats?.rank || '-'}</div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
          <div className="text-slate-400 text-sm font-medium mb-1">Total Score</div>
          <div className="text-4xl font-display font-bold text-white">{userStats?.totalPoints || 0}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
           <div className="text-slate-400 text-sm font-medium mb-1">Season Record</div>
           <div className="text-4xl font-display font-bold text-white">
             <span className="text-green-400">{userStats?.wins || 0}</span>
             <span className="text-slate-600 mx-2">-</span>
             <span className="text-red-400">{userStats?.losses || 0}</span>
           </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
           <div className="text-slate-400 text-sm font-medium mb-1">Current Picks</div>
           <div className="text-4xl font-display font-bold text-ice-400">
             {currentPicks.length}<span className="text-slate-600 text-2xl">/5</span>
           </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl h-80">
        <h3 className="text-lg font-bold text-white mb-4">Performance History</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mockChartData}>
            <XAxis dataKey="name" stroke="#64748b" tick={{fill: '#64748b'}} />
            <YAxis stroke="#64748b" tick={{fill: '#64748b'}} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
              itemStyle={{ color: '#38bdf8' }}
            />
            <Line type="monotone" dataKey="score" stroke="#38bdf8" strokeWidth={3} dot={{ fill: '#38bdf8', strokeWidth: 2 }} activeDot={{ r: 8 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-gradient-to-r from-ice-900/50 to-slate-900 border border-ice-500/20 p-8 rounded-xl flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white mb-2">Make Picks</h3>
          <p className="text-slate-400 max-w-lg">
            Check the schedule and make your confidence selections for the upcoming Saturday.
          </p>
        </div>
        <Button size="lg" onClick={() => setView('PICKS')}>Make Picks</Button>
      </div>
    </div>
  );
};

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

const PicksView: React.FC<PicksViewProps> = ({ 
  selectedWeekId, weeks, isLocked, timeLeft, 
  currentPicks, saveStatus, errorMessage, weekGames, 
  handleSelectTeam, handleSetConfidence, handleSubmitPicks, isPickSheetValid,
  loadingSchedule, sourceUrl
}) => {
  const usedConfidences = currentPicks.map(p => p.confidence || 0).filter(c => c > 0);
  const targetDateStr = selectedWeekId.replace('week-', '');

  return (
    <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-4">
       <header className="flex flex-col lg:flex-row lg:justify-between lg:items-center sticky top-0 bg-slate-950/90 backdrop-blur-md py-4 z-30 border-b border-slate-800 gap-4 -mx-4 px-4 lg:-mx-10 lg:px-10">
        <div className="flex items-center gap-4">
          <div>
              <h2 className="text-2xl font-display font-bold text-white uppercase tracking-wider">
                Saturday, {new Date(targetDateStr).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
              </h2>
              <div className="flex items-center gap-3 text-slate-400 text-sm mt-1">
                  <span className={`flex items-center gap-1 ${isLocked ? 'text-slate-500' : 'text-ice-400'}`}>
                      {isLocked ? <Lock size={14}/> : <Clock size={14}/>} 
                      {isLocked ? 'Selections Locked' : `Deadline: 11AM ET (${timeLeft})`}
                  </span>
                  {sourceUrl && (
                    <a href={sourceUrl} target="_blank" rel="noopener" className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-ice-400 transition-colors">
                        <ExternalLink size={10} /> Source: NHL.com
                    </a>
                  )}
              </div>
          </div>
        </div>

        <div className="flex items-center gap-4 justify-between lg:justify-end">
           <div className="text-right">
              <div className="text-xs text-slate-500 uppercase">Selected</div>
              <div className={`font-bold ${currentPicks.length === 5 ? 'text-green-400' : 'text-slate-200'}`}>{currentPicks.length}/5</div>
           </div>
           {isLocked ? (
               <div className="bg-slate-800 px-4 py-2 rounded text-slate-400 font-bold border border-slate-700 flex items-center gap-2">
                   <Lock size={16}/> Locked
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

      {loadingSchedule ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <RefreshCw className="text-ice-500 animate-spin" size={48} />
              <p className="text-slate-400 font-display text-xl uppercase tracking-widest">Synchronizing Production Schedule...</p>
          </div>
      ) : (
          <>
            {saveStatus === 'ERROR' && (
                <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-lg text-red-200 animate-in fade-in slide-in-from-top-2">
                    {errorMessage}
                </div>
            )}
            
            {!isPickSheetValid && currentPicks.length > 0 && !isLocked && (
                <div className="bg-ice-900/20 border border-ice-500/20 rounded-lg p-3 text-sm text-ice-200 flex items-center gap-2">
                    <AlertCircle size={16} />
                    <span>Select 5 winners and assign a unique confidence score (1-5) to each directly on the card.</span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {weekGames.length === 0 ? (
                    <div className="col-span-full py-24 text-center">
                        <p className="text-slate-500 text-lg">No games scheduled for this Saturday.</p>
                        <p className="text-slate-600 text-sm mt-2">Check back later as the schedule is updated weekly.</p>
                    </div>
                ) : weekGames.map(game => {
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
                    />
                );
                })}
            </div>
          </>
      )}
    </div>
  );
};

interface StandingsViewProps {
  standings: StandingsRow[];
  currentUser: User | null;
}

const StandingsView: React.FC<StandingsViewProps> = ({ standings, currentUser }) => (
  <div className="animate-in fade-in slide-in-from-bottom-4">
    <header className="mb-8">
      <h2 className="text-3xl font-display font-bold text-white">League Standings</h2>
      <p className="text-slate-400">Official Leaderboard</p>
    </header>

    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-950 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
              <th className="p-4 font-medium">Rank</th>
              <th className="p-4 font-medium">Member</th>
              <th className="p-4 font-medium text-center">W-L</th>
              <th className="p-4 font-medium text-center">Weekly</th>
              <th className="p-4 font-medium text-right">Total Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {standings.map((row) => (
              <tr key={row.userId} className={`hover:bg-slate-800/50 transition-colors ${row.userId === currentUser?.id ? 'bg-ice-900/10' : ''}`}>
                <td className="p-4">
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-display font-bold ${row.rank === 1 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-slate-800 text-slate-400'}`}>
                    {row.rank}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <img src={row.avatar} alt={row.userName} className="w-8 h-8 rounded-full bg-slate-800" />
                    <span className={`font-medium ${row.userId === currentUser?.id ? 'text-ice-400' : 'text-slate-200'}`}>{row.userName}</span>
                  </div>
                </td>
                <td className="p-4 text-center text-slate-400 text-sm">
                  {row.wins}-{row.losses}
                </td>
                <td className="p-4 text-center">
                   <span className="inline-block px-2 py-1 bg-slate-800 rounded text-xs text-slate-300">
                     +{row.weeklyScore}
                   </span>
                </td>
                <td className="p-4 text-right font-display font-bold text-lg text-white">
                  {row.totalPoints}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

interface ResultsViewProps {
  selectedWeekId: string;
  isLocked: boolean;
  weekGames: Game[];
  leagueUsers: User[];
  leaguePicks: Pick[];
}

const ResultsView: React.FC<ResultsViewProps> = ({ 
  selectedWeekId, isLocked, weekGames, leagueUsers, leaguePicks 
}) => {
    const targetDateStr = selectedWeekId.replace('week-', '');
    return (
        <div className="animate-in fade-in slide-in-from-bottom-4">
            <header className="flex flex-col lg:flex-row lg:justify-between lg:items-center sticky top-0 bg-slate-950/90 backdrop-blur-md py-4 z-30 border-b border-slate-800 gap-4 -mx-4 px-4 lg:-mx-10 lg:px-10 mb-8">
                <div className="flex items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-display font-bold text-white uppercase tracking-wider">
                            Matrix: {new Date(targetDateStr).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </h2>
                        <p className="text-slate-400 text-sm">Real-time league-wide selections</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2 text-slate-400 text-sm uppercase tracking-widest font-bold">
                    {isLocked ? <Lock size={14} className="text-green-500" /> : <ShieldAlert size={14} className="text-orange-500" />} 
                    {isLocked ? 'Picks Revealed' : 'Classified'}
                </div>
            </header>

            {!isLocked ? (
                <div className="h-[50vh] flex flex-col items-center justify-center animate-in fade-in zoom-in-95">
                    <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 relative">
                        <ShieldAlert size={48} className="text-ice-500" />
                        <div className="absolute inset-0 border-4 border-ice-500/20 rounded-full animate-pulse"></div>
                    </div>
                    <h3 className="text-2xl font-display font-bold text-white mb-2 uppercase tracking-widest">Classified</h3>
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
                                <th className="sticky left-0 z-10 bg-slate-950 p-4 border-b border-r border-slate-800 min-w-[200px] text-xs font-semibold text-slate-500 uppercase tracking-wider">Player</th>
                                {weekGames.sort((a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).map(game => (
                                    <th key={game.id} className="p-2 border-b border-slate-800 text-center min-w-[120px] bg-slate-900/50">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-[10px] text-slate-500">{new Date(game.startTime).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}</span>
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
                                        <img src={user.avatar} className="w-6 h-6 rounded-full" alt="" />
                                        {user.name}
                                    </td>
                                    {weekGames.map(game => {
                                        const pick = leaguePicks.find(p => p.userId === user.id && p.gameId === game.id);
                                        let cellClass = "p-3 text-center border-l border-slate-800/50";
                                        let textClass = "font-bold text-slate-400";
                                        
                                        if (pick && game.status === 'FINAL') {
                                            const isWin = (game.homeScore! > game.awayScore! && pick.selectedTeamId === game.homeTeamId) || 
                                                            (game.awayScore! > game.homeScore! && pick.selectedTeamId === game.awayTeamId);
                                            textClass = isWin ? "text-green-400" : "text-red-400 line-through decoration-red-500/50";
                                        } else if (pick) {
                                            textClass = "text-ice-400";
                                        }

                                        return (
                                            <td key={game.id} className={cellClass}>
                                                {pick ? (
                                                    <div className="flex flex-col items-center">
                                                        <span className={`${textClass} text-lg`}>{pick.selectedTeamId}</span>
                                                        <span className="text-xs bg-slate-800 px-1.5 rounded text-slate-500 border border-slate-700">{pick.confidence} pts</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-700">-</span>
                                                )}
                                            </td>
                                        )
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

interface TeamStatsViewProps {
  leagueUsers: User[];
  allPicks: Pick[];
}

const TeamStatsView: React.FC<TeamStatsViewProps> = ({ leagueUsers, allPicks }) => {
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
          <div key={user.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col">
            <div className="flex items-center gap-4 mb-6">
              <img src={user.avatar} alt={user.name} className="w-12 h-12 rounded-full border-2 border-slate-800" />
              <div>
                <h3 className="text-lg font-bold text-white">{user.name}</h3>
                <span className="text-xs text-slate-500 uppercase tracking-widest">{user.role}</span>
              </div>
            </div>
            
            <div className="space-y-4">
              <h4 className="text-[10px] text-slate-500 uppercase font-bold tracking-widest border-b border-slate-800 pb-2">Top 3 Favorite Teams</h4>
              {user.topTeams.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {user.topTeams.map((stat, idx) => {
                    const team = TEAMS[stat.id];
                    return (
                      <div key={stat.id} className="relative group flex flex-col items-center p-3 rounded-lg bg-slate-950/50 border border-slate-800 hover:border-ice-500/50 transition-colors">
                        <div className="absolute -top-1 -right-1 bg-ice-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-lg z-10">
                          {stat.count}
                        </div>
                        <img src={getLogoUrl(stat.id)} alt={team?.name} className="w-10 h-10 object-contain drop-shadow-md mb-2" />
                        <span className="text-[10px] font-bold text-slate-400">{stat.id}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-4 text-center text-slate-600 text-sm italic">No picks recorded yet</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Main App Component ---

function App() {
  const [view, setView] = useState<ViewState>('LOGIN');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginError, setLoginError] = useState('');

  const [weeks, setWeeks] = useState<Week[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState('');
  const [weekGames, setWeekGames] = useState<Game[]>([]);
  const [currentPicks, setCurrentPicks] = useState<Partial<Pick>[]>([]);
  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [leagueUsers, setLeagueUsers] = useState<User[]>([]);
  const [allPicks, setAllPicks] = useState<Pick[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');

  // Initial Data
  useEffect(() => {
    const calculatedWeekId = dataService.getCurrentWeekId();
    setSelectedWeekId(calculatedWeekId);
    setWeeks(dataService.getWeeks());
    setStandings(dataService.getStandings());
    setLeagueUsers(dataService.getUsers());
  }, []);

  // Fetch real games from production schedule via Gemini
  useEffect(() => {
    if (!selectedWeekId) return;

    const fetchGames = async () => {
        // Check local storage first to avoid redundant API calls
        const existing = dataService.getGamesByWeek(selectedWeekId);
        if (existing.length > 0) {
            setWeekGames(existing);
            return;
        }

        try {
            setLoadingSchedule(true);
            const dateStr = selectedWeekId.replace('week-', '');
            const result = await fetchRealNhlSchedule(dateStr);
            setWeekGames(result.games as Game[]);
            setSourceUrl(result.sourceUrl);
            dataService.saveGamesToStorage(selectedWeekId, result.games as Game[]);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingSchedule(false);
        }
    };

    fetchGames();
    
    // Timer for deadline
    const d = dataService.getPickDeadline(selectedWeekId);
    const checkLockStatus = () => {
        const locked = dataService.isPicksLocked(selectedWeekId);
        setIsLocked(locked);
        const now = new Date();
        const diff = d.getTime() - now.getTime();
        
        if (diff > 0) {
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            setTimeLeft(`${hours}h ${minutes}m`);
        } else {
            setTimeLeft('Locked');
        }
    };
    
    checkLockStatus();
    const interval = setInterval(checkLockStatus, 60000);
    return () => clearInterval(interval);
  }, [selectedWeekId]);

  // Load user-specific picks
  useEffect(() => {
    if (currentUser && selectedWeekId) {
        setCurrentPicks(dataService.getUserPicks(currentUser.id, selectedWeekId));
    }
  }, [currentUser, selectedWeekId]);

  // Refresh all picks for league views
  useEffect(() => {
    if (view === 'RESULTS' || view === 'TEAM_STATS') {
        setAllPicks(dataService.getAllPicks());
    }
  }, [view, selectedWeekId]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = dataService.login(loginEmail);
    if (user) {
      setCurrentUser(user);
      setView('DASHBOARD');
      setLoginError('');
    } else {
      setLoginError(`User Not Found. Ensure you are using a registered email.`);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentPicks([]);
    setView('LOGIN');
  };

  const handleSelectTeam = (gameId: string, teamId: string) => {
    if (isLocked) return;
    setErrorMessage('');
    setSaveStatus('IDLE');
    const existingIndex = currentPicks.findIndex(p => p.gameId === gameId);
    
    if (existingIndex >= 0) {
      const currentPick = currentPicks[existingIndex];
      if (currentPick.selectedTeamId === teamId) {
        setCurrentPicks(prev => prev.filter((_, idx) => idx !== existingIndex));
      } else {
        const updated = [...currentPicks];
        updated[existingIndex] = { ...updated[existingIndex], selectedTeamId: teamId };
        setCurrentPicks(updated);
      }
    } else {
      if (currentPicks.length < 5) {
        setCurrentPicks(prev => [...prev, { 
          gameId, 
          selectedTeamId: teamId, 
          userId: currentUser!.id, 
          weekId: selectedWeekId,
          confidence: 0 
        }]);
      } else {
         setSaveStatus('ERROR');
         setErrorMessage('Maximum 5 picks allowed.');
         setTimeout(() => setSaveStatus('IDLE'), 4000);
      }
    }
  };

  const handleSetConfidence = (gameId: string, confidence: number) => {
    if (isLocked) return;
    setErrorMessage('');
    const isUsed = currentPicks.some(p => p.confidence === confidence && p.gameId !== gameId);
    let updated = [...currentPicks];
    if (isUsed) {
       updated = updated.map(p => (p.confidence === confidence && p.gameId !== gameId) ? { ...p, confidence: 0 } : p);
    }
    const pickIndex = updated.findIndex(p => p.gameId === gameId);
    if (pickIndex >= 0) {
        updated[pickIndex] = { ...updated[pickIndex], confidence };
        setCurrentPicks(updated);
    }
    setSaveStatus('IDLE');
  };

  const isPickSheetValid = useMemo(() => {
    if (currentPicks.length !== 5) return false;
    const usedConfidence = new Set(currentPicks.map(p => p.confidence));
    return [1,2,3,4,5].every(v => usedConfidence.has(v));
  }, [currentPicks]);

  const handleSubmitPicks = () => {
    if (!currentUser || !isPickSheetValid) return;
    try {
        setSaveStatus('SAVING');
        dataService.savePicks(currentPicks as Pick[]);
        setTimeout(() => {
          setSaveStatus('SAVED');
          setAllPicks(dataService.getAllPicks());
        }, 800);
    } catch (e: any) {
        setSaveStatus('ERROR');
        setErrorMessage(e.message);
    }
  };

  if (view === 'LOGIN') {
    return <LoginView loginEmail={loginEmail} setLoginEmail={setLoginEmail} handleLogin={handleLogin} loginError={loginError} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex text-slate-200 font-sans selection:bg-ice-500/30">
      <aside className="fixed left-0 top-0 h-full w-20 lg:w-64 bg-slate-900 border-r border-slate-800 z-50 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-tr from-ice-400 to-ice-600 rounded-lg shadow-lg shadow-ice-500/20 shrink-0"></div>
          <span className="font-display text-2xl font-bold text-white tracking-wide hidden lg:block uppercase">ICEPICK</span>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-2">
          <button onClick={() => setView('DASHBOARD')} className={`w-full flex items-center gap-3 px-3 lg:px-4 py-3 rounded-lg transition-all duration-200 group ${view === 'DASHBOARD' ? 'bg-ice-500/10 text-ice-400' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}>
            <LayoutDashboard size={20} className={view === 'DASHBOARD' ? 'stroke-[2.5]' : ''} /><span className="font-medium hidden lg:block">Dashboard</span>
          </button>
          <button onClick={() => setView('PICKS')} className={`w-full flex items-center gap-3 px-3 lg:px-4 py-3 rounded-lg transition-all duration-200 group ${view === 'PICKS' ? 'bg-ice-500/10 text-ice-400' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}>
            <Calendar size={20} className={view === 'PICKS' ? 'stroke-[2.5]' : ''} /><span className="font-medium hidden lg:block">Saturday Picks</span>
          </button>
          <button onClick={() => setView('RESULTS')} className={`w-full flex items-center gap-3 px-3 lg:px-4 py-3 rounded-lg transition-all duration-200 group ${view === 'RESULTS' ? 'bg-ice-500/10 text-ice-400' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}>
            <Grid3X3 size={20} className={view === 'RESULTS' ? 'stroke-[2.5]' : ''} /><span className="font-medium hidden lg:block">League Matrix</span>
          </button>
          <button onClick={() => setView('TEAM_STATS')} className={`w-full flex items-center gap-3 px-3 lg:px-4 py-3 rounded-lg transition-all duration-200 group ${view === 'TEAM_STATS' ? 'bg-ice-500/10 text-ice-400' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}>
            <Heart size={20} className={view === 'TEAM_STATS' ? 'stroke-[2.5]' : ''} /><span className="font-medium hidden lg:block">Team Affinity</span>
          </button>
          <button onClick={() => setView('STANDINGS')} className={`w-full flex items-center gap-3 px-3 lg:px-4 py-3 rounded-lg transition-all duration-200 group ${view === 'STANDINGS' ? 'bg-ice-500/10 text-ice-400' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}>
            <Trophy size={20} className={view === 'STANDINGS' ? 'stroke-[2.5]' : ''} /><span className="font-medium hidden lg:block">Standings</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
           <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2 text-slate-500 hover:text-white transition-colors text-sm">
             <LogOut size={16} /><span className="hidden lg:block">Sign Out</span>
           </button>
        </div>
      </aside>

      <main className="flex-1 ml-20 lg:ml-64 p-4 lg:p-10 max-w-7xl mx-auto w-full">
        {view === 'DASHBOARD' && <DashboardView currentUser={currentUser} standings={standings} currentPicks={currentPicks} setView={setView} />}
        {view === 'PICKS' && <PicksView 
            selectedWeekId={selectedWeekId} weeks={weeks} 
            isLocked={isLocked} timeLeft={timeLeft} currentPicks={currentPicks} saveStatus={saveStatus} 
            errorMessage={errorMessage} weekGames={weekGames} handleSelectTeam={handleSelectTeam} 
            handleSetConfidence={handleSetConfidence} handleSubmitPicks={handleSubmitPicks} isPickSheetValid={isPickSheetValid} 
            loadingSchedule={loadingSchedule} sourceUrl={sourceUrl} />}
        {view === 'STANDINGS' && <StandingsView standings={standings} currentUser={currentUser} />}
        {view === 'RESULTS' && <ResultsView 
            selectedWeekId={selectedWeekId} isLocked={isLocked} 
            weekGames={weekGames} leagueUsers={leagueUsers} leaguePicks={allPicks.filter(p => p.weekId === selectedWeekId)} />}
        {view === 'TEAM_STATS' && <TeamStatsView leagueUsers={leagueUsers} allPicks={allPicks} />}
      </main>
    </div>
  );
}

export default App;