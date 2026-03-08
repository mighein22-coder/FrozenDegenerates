import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import { supabaseService } from './lib/supabaseService';
import { getTimeUntilDeadline, arePicksLocked } from './lib/timezone';
import type { Week, Game, Pick, StandingsRow } from './types';

// Layout
import { Sidebar } from './components/layout/Sidebar';

// Views
import { LoginView } from './components/views/LoginView';
import { DashboardView } from './components/views/DashboardView';
import { PicksView } from './components/views/PicksView';
import { StandingsView } from './components/views/StandingsView';
import { ResultsView } from './components/views/ResultsView';
import { TeamStatsView } from './components/views/TeamStatsView';
import { MyHistoryView } from './components/views/MyHistoryView';

type ViewState = 'DASHBOARD' | 'PICKS' | 'STANDINGS' | 'RESULTS' | 'TEAM_STATS' | 'MY_HISTORY';

function App() {
  // Authentication
  const { user, profile, loading: authLoading, signIn, signOut } = useAuth();

  // View state
  const [view, setView] = useState<ViewState>('DASHBOARD');

  // Data state
  const [currentWeek, setCurrentWeek] = useState<Week | null>(null);
  const [allWeeks, setAllWeeks] = useState<Week[]>([]);
  const [selectedResultsWeekId, setSelectedResultsWeekId] = useState<string>('');
  const [weekGames, setWeekGames] = useState<Game[]>([]);
  const [currentPicks, setCurrentPicks] = useState<Partial<Pick>[]>([]);
  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [leagueProfiles, setLeagueProfiles] = useState<any[]>([]);

  // UI state
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [timeLeft, setTimeLeft] = useState('');
  const [isLocked, setIsLocked] = useState(false);

  // Load initial data when user logs in
  useEffect(() => {
    if (!user) return;

    const loadInitialData = async () => {
      try {
        // Load current week
        const week = await supabaseService.getCurrentWeek();
        setCurrentWeek(week);

        // Sync scores on login if the week deadline has passed — ensures standings
        // are always up-to-date without requiring a visit to the Results view
        if (arePicksLocked(week.saturday_date)) {
          await supabaseService.syncScores(week.id);
        }

        // Load standings (pass current week ID for weekly score calculation)
        const standingsData = await supabaseService.getStandings(week.id);
        setStandings(standingsData);

        // Load all profiles
        const profiles = await supabaseService.getProfiles();
        setLeagueProfiles(profiles);
      } catch (error) {
        console.error('Error loading initial data:', error);
      }
    };

    loadInitialData();
  }, [user]);

  // Load all weeks for week selector
  useEffect(() => {
    if (!user) return;

    const loadWeeks = async () => {
      try {
        const weeks = await supabaseService.getAllWeeks();
        setAllWeeks(weeks);
      } catch (error) {
        console.error('Error loading weeks:', error);
      }
    };

    loadWeeks();
  }, [user]);

  // Guard to prevent duplicate fetches
  const fetchingGamesRef = useRef(false);

  // Load games for current week
  useEffect(() => {
    if (!currentWeek) return;

    const loadGames = async () => {
      // Prevent concurrent fetches
      if (fetchingGamesRef.current) return;

      try {
        // Try to get games from database first
        const games = await supabaseService.getGamesByWeek(currentWeek.id);

        if (games.length > 0) {
          setWeekGames(games);
          return;
        }

        // Mark as fetching before async operation
        fetchingGamesRef.current = true;

        // If no games, fetch from NHL via Netlify function
        setLoadingSchedule(true);
        const dateStr = currentWeek.saturday_date;

        const response = await fetch('/.netlify/functions/gemini-schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dateStr })
        });

        if (!response.ok) {
          throw new Error('Failed to fetch schedule');
        }

        const data = await response.json();
        setSourceUrl(data.sourceUrl);

        // Save games to database (already in correct format from Netlify function)
        await supabaseService.saveGames(currentWeek.id, data.games);

        // Reload games
        const savedGames = await supabaseService.getGamesByWeek(currentWeek.id);
        setWeekGames(savedGames);
      } catch (error) {
        console.error('Error loading games:', error);
      } finally {
        setLoadingSchedule(false);
        fetchingGamesRef.current = false;
      }
    };

    loadGames();

    // Set up deadline timer
    const updateDeadline = () => {
      if (!currentWeek) return;

      // Pass the date string directly - timezone.ts will parse it correctly
      setIsLocked(arePicksLocked(currentWeek.saturday_date));
      setTimeLeft(getTimeUntilDeadline(currentWeek.saturday_date));
    };

    updateDeadline();
    const interval = setInterval(updateDeadline, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [currentWeek]);

  // Load user picks
  useEffect(() => {
    if (!user || !currentWeek) return;

    const loadPicks = async () => {
      try {
        const picks = await supabaseService.getUserPicks(user.id, currentWeek.id);
        setCurrentPicks(picks);
      } catch (error) {
        console.error('Error loading picks:', error);
      }
    };

    loadPicks();
  }, [user, currentWeek]);

  // Load data for results view (uses selected week)
  const [resultsWeekGames, setResultsWeekGames] = useState<Game[]>([]);
  const [resultsWeekPicks, setResultsWeekPicks] = useState<Pick[]>([]);
  const [syncingScores, setSyncingScores] = useState(false);

  useEffect(() => {
    if (view !== 'RESULTS' || !selectedResultsWeekId) return;

    const loadResultsData = async () => {
      try {
        // First sync scores from NHL API
        setSyncingScores(true);
        await supabaseService.syncScores(selectedResultsWeekId);
        setSyncingScores(false);

        // Then load the updated data
        const games = await supabaseService.getGamesByWeek(selectedResultsWeekId);
        const picks = await supabaseService.getAllPicks(selectedResultsWeekId);
        setResultsWeekGames(games);
        setResultsWeekPicks(picks);

        // Refresh standings after score sync
        const standingsData = await supabaseService.getStandings(selectedResultsWeekId);
        setStandings(standingsData);
      } catch (error) {
        console.error('Error loading results data:', error);
        setSyncingScores(false);
      }
    };

    loadResultsData();
  }, [view, selectedResultsWeekId]);

  // Load picks from completed weeks only for team stats view
  const [teamStatsPicks, setTeamStatsPicks] = useState<Pick[]>([]);

  // My History view state — picks and games keyed by weekId
  const [myHistoryPicks, setMyHistoryPicks] = useState<Record<string, Pick[]>>({});
  const [myHistoryGames, setMyHistoryGames] = useState<Record<string, Game[]>>({});

  useEffect(() => {
    if (view !== 'TEAM_STATS') return;

    const loadCompletedWeeksPicks = async () => {
      try {
        // Get only completed weeks
        const completedWeeks = allWeeks.filter(w => w.status === 'COMPLETED');

        // Load picks for each completed week
        const allCompletedPicks: Pick[] = [];
        for (const week of completedWeeks) {
          const picks = await supabaseService.getAllPicks(week.id);
          allCompletedPicks.push(...picks);
        }

        setTeamStatsPicks(allCompletedPicks);
      } catch (error) {
        console.error('Error loading completed weeks picks:', error);
      }
    };

    loadCompletedWeeksPicks();
  }, [view, allWeeks]);

  // Load picks and games for all locked/completed weeks for My History view
  useEffect(() => {
    if (view !== 'MY_HISTORY' || !user) return;

    const loadMyHistory = async () => {
      try {
        const relevantWeeks = allWeeks.filter(
          w => w.status === 'LOCKED' || w.status === 'COMPLETED'
        );
        const picksMap: Record<string, Pick[]> = {};
        const gamesMap: Record<string, Game[]> = {};

        for (const week of relevantWeeks) {
          picksMap[week.id] = await supabaseService.getAllPicks(week.id);
          gamesMap[week.id] = await supabaseService.getGamesByWeek(week.id);
        }

        setMyHistoryPicks(picksMap);
        setMyHistoryGames(gamesMap);
      } catch (error) {
        console.error('Error loading my history:', error);
      }
    };

    loadMyHistory();
  }, [view, allWeeks, user]);

  // Handlers
  const handleSelectTeam = (gameId: string, teamId: string) => {
    if (isLocked) return;

    const existing = currentPicks.find(p => p.gameId === gameId);

    if (existing && existing.selectedTeamId === teamId) {
      // Deselect
      setCurrentPicks(currentPicks.filter(p => p.gameId !== gameId));
    } else if (existing) {
      // Change selection
      setCurrentPicks(
        currentPicks.map(p =>
          p.gameId === gameId ? { ...p, selectedTeamId: teamId } : p
        )
      );
    } else {
      // New selection
      setCurrentPicks([...currentPicks, { gameId, selectedTeamId: teamId, confidence: 0 }]);
    }

    setSaveStatus('IDLE');
  };

  const handleSetConfidence = (gameId: string, confidence: number) => {
    if (isLocked) return;

    let updated = [...currentPicks];

    // Clear any other pick with this confidence
    if (confidence > 0) {
      updated = updated.map(p =>
        p.confidence === confidence && p.gameId !== gameId ? { ...p, confidence: 0 } : p
      );
    }

    // Set confidence for this pick
    const pickIndex = updated.findIndex(p => p.gameId === gameId);
    if (pickIndex >= 0) {
      updated[pickIndex] = { ...updated[pickIndex], confidence };
      setCurrentPicks(updated);
    }

    setSaveStatus('IDLE');
  };

  const handleSubmitPicks = async () => {
    if (!user || !currentWeek || !isPickSheetValid) return;

    try {
      setSaveStatus('SAVING');

      const picksToSave = currentPicks.map(p => ({
        gameId: p.gameId!,
        selectedTeamId: p.selectedTeamId!,
        confidence: p.confidence!
      }));

      await supabaseService.savePicks(user.id, currentWeek.id, picksToSave);

      setSaveStatus('SAVED');

      // Reload picks and standings
      const picks = await supabaseService.getUserPicks(user.id, currentWeek.id);
      setCurrentPicks(picks);

      const standingsData = await supabaseService.getStandings(currentWeek?.id);
      setStandings(standingsData);

      // Reset status after 2 seconds
      setTimeout(() => setSaveStatus('IDLE'), 2000);
    } catch (error: any) {
      console.error('Error saving picks:', error);
      setSaveStatus('ERROR');
      setErrorMessage(error.message || 'Failed to save picks');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      setView('DASHBOARD');
      // Clear all data
      setCurrentWeek(null);
      setWeekGames([]);
      setCurrentPicks([]);
      setResultsWeekGames([]);
      setResultsWeekPicks([]);
      setTeamStatsPicks([]);
      setMyHistoryPicks({});
      setMyHistoryGames({});
      setStandings([]);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Validation
  const isPickSheetValid = useMemo(() => {
    if (currentPicks.length !== 5) return false;
    const confidences = new Set(currentPicks.map(p => p.confidence));
    return [1, 2, 3, 4, 5].every(v => confidences.has(v));
  }, [currentPicks]);

  // Available weeks for Results view - only completed weeks + current week if past deadline
  const availableResultsWeeks = useMemo(() => {
    return allWeeks.filter(week => {
      // Always show completed weeks
      if (week.status === 'COMPLETED') return true;

      // For open/locked weeks, only show if past deadline (Saturday 10 AM ET)
      if (week.status === 'OPEN' || week.status === 'LOCKED') {
        return arePicksLocked(week.startDate);
      }

      return false;
    });
  }, [allWeeks]);

  // isLocked for selected results week (not the current picks week)
  const isResultsWeekLocked = useMemo(() => {
    const selectedWeek = allWeeks.find(w => w.id === selectedResultsWeekId);
    if (!selectedWeek) return false;
    return arePicksLocked(selectedWeek.startDate);
  }, [allWeeks, selectedResultsWeekId]);

  // Set default selected results week to most recent available week
  useEffect(() => {
    if (availableResultsWeeks.length > 0 && !selectedResultsWeekId) {
      setSelectedResultsWeekId(availableResultsWeeks[0].id);
    }
    // If current selection is not in available weeks, reset to first available
    if (selectedResultsWeekId && availableResultsWeeks.length > 0) {
      const isValid = availableResultsWeeks.some(w => w.id === selectedResultsWeekId);
      if (!isValid) {
        setSelectedResultsWeekId(availableResultsWeeks[0].id);
      }
    }
  }, [availableResultsWeeks, selectedResultsWeekId]);

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Login view
  if (!user) {
    return <LoginView onLogin={signIn} />;
  }

  // Main app
  return (
    <div className="min-h-screen bg-slate-950 flex text-slate-200 font-sans selection:bg-ice-500/30">
      <Sidebar currentView={view} onNavigate={setView} onLogout={handleLogout} />

      <main className="flex-1 md:ml-20 lg:ml-64 p-4 lg:p-10 pb-24 md:pb-4 lg:pb-10 max-w-7xl mx-auto w-full">
        {view === 'DASHBOARD' && (
          <DashboardView
            user={profile}
            standings={standings}
            currentPicks={currentPicks}
            onNavigate={setView}
          />
        )}

        {view === 'PICKS' && currentWeek && (
          <PicksView
            selectedWeekId={currentWeek.id}
            weeks={[currentWeek]}
            isLocked={isLocked}
            timeLeft={timeLeft}
            currentPicks={currentPicks}
            saveStatus={saveStatus}
            errorMessage={errorMessage}
            weekGames={weekGames}
            handleSelectTeam={handleSelectTeam}
            handleSetConfidence={handleSetConfidence}
            handleSubmitPicks={handleSubmitPicks}
            isPickSheetValid={isPickSheetValid}
            loadingSchedule={loadingSchedule}
            sourceUrl={sourceUrl}
          />
        )}

        {view === 'STANDINGS' && (
          <StandingsView
            standings={standings}
            currentUser={profile ? { ...profile, role: profile.role as 'admin' | 'member' } : null}
          />
        )}

        {view === 'RESULTS' && (
          <ResultsView
            selectedWeekId={selectedResultsWeekId}
            availableWeeks={availableResultsWeeks}
            onWeekSelect={setSelectedResultsWeekId}
            isLocked={isResultsWeekLocked}
            weekGames={resultsWeekGames}
            leagueUsers={leagueProfiles.map(p => ({
              id: p.id,
              name: p.name,
              email: p.email,
              avatar: p.avatar || '',
              role: p.role
            }))}
            leaguePicks={resultsWeekPicks}
            syncingScores={syncingScores}
          />
        )}

        {view === 'TEAM_STATS' && (
          <TeamStatsView
            leagueUsers={leagueProfiles.map(p => ({
              id: p.id,
              name: p.name,
              email: p.email,
              avatar: p.avatar || '',
              role: p.role
            }))}
            allPicks={teamStatsPicks}
          />
        )}

        {view === 'MY_HISTORY' && user && (
          <MyHistoryView
            currentUserId={user.id}
            relevantWeeks={allWeeks.filter(
              w => w.status === 'LOCKED' || w.status === 'COMPLETED'
            )}
            picksByWeek={myHistoryPicks}
            gamesByWeek={myHistoryGames}
          />
        )}
      </main>
    </div>
  );
}

export default App;
