import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { supabaseService } from './lib/supabaseService';
import { isAuthCallback } from './lib/authRedirect';
import { getTimeUntilDeadline, arePicksLocked } from './lib/timezone';
import { computeStandings } from './lib/standings';
import { getSegments, getCurrentSegment } from './lib/segments';
import type { Week, Game, Pick } from './types';
import type { Profile } from './lib/supabase';

// Layout
import { Sidebar } from './components/layout/Sidebar';

// Views
import { LoginView } from './components/views/LoginView';
import { AuthCallbackView } from './components/views/AuthCallbackView';
import { DashboardView } from './components/views/DashboardView';
import { PicksView } from './components/views/PicksView';
import { StandingsView } from './components/views/StandingsView';
import { ResultsView } from './components/views/ResultsView';
import { TeamStatsView } from './components/views/TeamStatsView';
import { MyHistoryView } from './components/views/MyHistoryView';
import { AdminView } from './components/views/AdminView';
import { SettingsView } from './components/views/SettingsView';
import { PUBLIC_ROUTES } from './routes';

function App() {
  // Authentication
  const { user, profile, loading: authLoading, signIn, signOut, refreshProfile } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  /** Which route is showing — drives the per-view data loaders. */
  const path = location.pathname;

  // The standings segment and the matrix week live in the query string rather
  // than component state, so both are linkable and survive a refresh.
  const [searchParams, setSearchParams] = useSearchParams();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  // True for the lifetime of an emailed auth link, until the user leaves the
  // callback screen. Seeded once from the load-time snapshot.
  const [handlingAuthCallback, setHandlingAuthCallback] = useState(isAuthCallback);

  // Data state
  const [currentWeek, setCurrentWeek] = useState<Week | null>(null);
  const [allWeeks, setAllWeeks] = useState<Week[]>([]);
  const [weekGames, setWeekGames] = useState<Game[]>([]);
  const [currentPicks, setCurrentPicks] = useState<Partial<Pick>[]>([]);
  const [leagueProfiles, setLeagueProfiles] = useState<Profile[]>([]);

  // Raw standings inputs, fetched once. The season table and each segment's
  // table are derived from these, so switching segment costs no round-trip.
  const [allPicks, setAllPicks] = useState<Pick[]>([]);

  const segments = useMemo(() => getSegments(), []);

  // UI state
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState(''); // Pick save errors
  const [loadError, setLoadError] = useState(''); // Data load errors
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

        // Sync scores on login for the current week and any recent past weeks that
        // aren't COMPLETED yet — ensures scores update even after the week advances
        if (arePicksLocked(week.startDate)) {
          await supabaseService.syncScores(week.id);
        }
        const pastWeekIds = await supabaseService.getRecentIncompleteWeeks(week.id);
        for (const pastWeekId of pastWeekIds) {
          await supabaseService.syncScores(pastWeekId);
        }

        // One fetch feeds both the league directory and every standings scope
        const { profiles, picks } = await supabaseService.getStandingsInputs();
        setLeagueProfiles(profiles);
        setAllPicks(picks);
        setLoadError(''); // Clear any previous error
      } catch (error: any) {
        console.error('Error loading initial data:', error);
        setLoadError(error.message || 'Failed to load dashboard. Please refresh the page.');
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
      // Prevent concurrent fetches — set immediately before any async work
      if (fetchingGamesRef.current) return;
      fetchingGamesRef.current = true;

      try {
        // Try to get games from database first
        const games = await supabaseService.getGamesByWeek(currentWeek.id);

        if (games.length > 0) {
          setWeekGames(games);
          return;
        }

        // If no games, fetch from NHL via Netlify function
        setLoadingSchedule(true);
        const dateStr = currentWeek.startDate;

        const response = await fetch('/.netlify/functions/nhl-schedule', {
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
      setIsLocked(arePicksLocked(currentWeek.startDate));
      setTimeLeft(getTimeUntilDeadline(currentWeek.startDate));
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

  // Which week the matrix shows: ?week= when it names a viewable week, else the
  // most recent. Validating against the list means a stale or hand-edited link
  // falls back rather than rendering an empty grid.
  const selectedResultsWeekId = useMemo(() => {
    const requested = searchParams.get('week');
    if (requested && availableResultsWeeks.some(w => w.id === requested)) return requested;
    return availableResultsWeeks[0]?.id ?? '';
  }, [searchParams, availableResultsWeeks]);

  const setSelectedResultsWeekId = (weekId: string) => setParam('week', weekId);

  // Load data for results view (uses selected week)
  const [resultsWeekGames, setResultsWeekGames] = useState<Game[]>([]);
  const [resultsWeekPicks, setResultsWeekPicks] = useState<Pick[]>([]);
  const [syncingScores, setSyncingScores] = useState(false);

  useEffect(() => {
    if (path !== '/matrix' || !selectedResultsWeekId) return;

    const loadResultsData = async () => {
      try {
        // A COMPLETED week is fully resolved — syncing it can't change anything,
        // so skip the Netlify round-trip entirely.
        const isCompleted =
          allWeeks.find(w => w.id === selectedResultsWeekId)?.status === 'COMPLETED';

        if (!isCompleted) {
          setSyncingScores(true);
          await supabaseService.syncScores(selectedResultsWeekId);
          setSyncingScores(false);
        }

        // Then load the updated data (independent queries — run them together).
        // Refresh the standings inputs too, since a sync may have resolved picks.
        const [games, picks, inputs] = await Promise.all([
          supabaseService.getGamesByWeek(selectedResultsWeekId),
          supabaseService.getAllPicks(selectedResultsWeekId),
          supabaseService.getStandingsInputs()
        ]);

        setResultsWeekGames(games);
        setResultsWeekPicks(picks);
        setAllPicks(inputs.picks);
      } catch (error) {
        console.error('Error loading results data:', error);
        setSyncingScores(false);
      }
    };

    loadResultsData();
  }, [path, selectedResultsWeekId, allWeeks]);

  // Load picks from completed weeks only for team stats view
  const [teamStatsPicks, setTeamStatsPicks] = useState<Pick[]>([]);

  // My History view state — picks and games keyed by weekId
  const [myHistoryPicks, setMyHistoryPicks] = useState<Record<string, Pick[]>>({});
  const [myHistoryGames, setMyHistoryGames] = useState<Record<string, Game[]>>({});

  useEffect(() => {
    if (path !== '/affinity') return;

    const loadCompletedWeeksPicks = async () => {
      try {
        // Single batched query rather than one round-trip per completed week
        const completedWeekIds = allWeeks
          .filter(w => w.status === 'COMPLETED')
          .map(w => w.id);

        setTeamStatsPicks(await supabaseService.getPicksForWeeks(completedWeekIds));
      } catch (error) {
        console.error('Error loading completed weeks picks:', error);
      }
    };

    loadCompletedWeeksPicks();
  }, [path, allWeeks]);

  // Load picks and games for all locked/completed weeks for My History view
  useEffect(() => {
    if (path !== '/history' || !user) return;

    const loadMyHistory = async () => {
      try {
        const relevantWeekIds = allWeeks
          .filter(w => w.status === 'LOCKED' || w.status === 'COMPLETED')
          .map(w => w.id);

        // Two batched queries in parallel, rather than two per week
        const [picks, gamesMap] = await Promise.all([
          supabaseService.getPicksForWeeks(relevantWeekIds),
          supabaseService.getGamesForWeeks(relevantWeekIds)
        ]);

        const picksMap: Record<string, Pick[]> = {};
        for (const weekId of relevantWeekIds) picksMap[weekId] = [];
        for (const pick of picks) (picksMap[pick.weekId] ??= []).push(pick);

        setMyHistoryPicks(picksMap);
        setMyHistoryGames(gamesMap);
      } catch (error) {
        console.error('Error loading my history:', error);
      }
    };

    loadMyHistory();
  }, [path, allWeeks, user]);

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

      // Reload picks and the standings inputs
      const [picks, inputs] = await Promise.all([
        supabaseService.getUserPicks(user.id, currentWeek.id),
        supabaseService.getStandingsInputs()
      ]);
      setCurrentPicks(picks);
      setAllPicks(inputs.picks);

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
      navigate('/', { replace: true });
      // Clear all data
      setCurrentWeek(null);
      setWeekGames([]);
      setCurrentPicks([]);
      setResultsWeekGames([]);
      setResultsWeekPicks([]);
      setTeamStatsPicks([]);
      setMyHistoryPicks({});
      setMyHistoryGames({});
      setAllPicks([]);
      setLeagueProfiles([]);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Standings, derived rather than fetched. The dashboard always shows season
  // position; the standings view follows the selected segment.
  const seasonStandings = useMemo(
    () => computeStandings(leagueProfiles, allPicks, { weekId: currentWeek?.id }),
    [leagueProfiles, allPicks, currentWeek]
  );

  // Which scope the standings show: ?segment=1|2|3, ?segment=season, or — with
  // no parameter — whichever segment the season is currently in.
  const selectedSegment = useMemo(() => {
    const requested = searchParams.get('segment');
    if (requested === 'season') return null;

    const asNumber = Number(requested);
    if (requested !== null && segments.some(s => s.number === asNumber)) return asNumber;

    return getCurrentSegment(currentWeek?.startDate, segments)?.number ?? null;
  }, [searchParams, segments, currentWeek]);

  const setSelectedSegment = (segment: number | null) =>
    setParam('segment', segment === null ? 'season' : String(segment));

  const scopedStandings = useMemo(
    () =>
      selectedSegment === null
        ? seasonStandings
        : computeStandings(leagueProfiles, allPicks, {
            weekId: currentWeek?.id,
            segment: selectedSegment
          }),
    [selectedSegment, seasonStandings, leagueProfiles, allPicks, currentWeek]
  );


  // Validation
  const isPickSheetValid = useMemo(() => {
    if (currentPicks.length !== 5) return false;
    const confidences = new Set(currentPicks.map(p => p.confidence));
    return [1, 2, 3, 4, 5].every(v => confidences.has(v));
  }, [currentPicks]);

  // isLocked for selected results week (not the current picks week)
  const isResultsWeekLocked = useMemo(() => {
    const selectedWeek = allWeeks.find(w => w.id === selectedResultsWeekId);
    if (!selectedWeek) return false;
    return arePicksLocked(selectedWeek.startDate);
  }, [allWeeks, selectedResultsWeekId]);

  // The auth callback owns the whole screen and is checked before anything
  // else. A recovery link *does* establish a session, so without this the
  // authed shell would render around it — sidebar and all — or redirect past it
  // before the user could choose a new password.
  //
  // Matched on the path *or* on the load-time snapshot: if the Supabase
  // redirect allowlist ever sends a link somewhere other than /auth/callback,
  // the parameters still arrive and still need handling.
  if (path === PUBLIC_ROUTES.authCallback || handlingAuthCallback) {
    return (
      <AuthCallbackView
        onDone={() => {
          setHandlingAuthCallback(false);
          // Leaves /auth/callback and drops the PKCE `code`. The fragment is
          // already gone — supabase-js consumed it during init.
          navigate('/', { replace: true });
        }}
      />
    );
  }

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Signed out
  if (!user) {
    return <LoginView onLogin={signIn} />;
  }

  const leagueUsers = leagueProfiles.map(p => ({
    id: p.id,
    name: p.name,
    email: p.email,
    avatar: p.avatar || '',
    role: p.role
  }));

  const isAdmin = profile?.role === 'admin';

  // Main app
  return (
    <div className="min-h-screen bg-slate-950 flex text-slate-200 font-sans selection:bg-ice-500/30">
      <Sidebar onLogout={handleLogout} isAdmin={isAdmin} />

      <main className="flex-1 md:ml-20 lg:ml-64 p-4 lg:p-10 pb-24 md:pb-4 lg:pb-10 max-w-7xl mx-auto w-full">
        {/* Data Load Error Banner */}
        {loadError && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 flex items-start justify-between">
            <div>
              <p className="font-semibold">Error Loading Data</p>
              <p className="text-sm mt-1">{loadError}</p>
            </div>
            <button
              onClick={() => setLoadError('')}
              className="text-red-300 hover:text-red-100 ml-4 flex-shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        <Routes>
          <Route
            path="/"
            element={
              <DashboardView
                user={profile}
                standings={seasonStandings}
                currentPicks={currentPicks}
                isLocked={isLocked}
              />
            }
          />

          <Route
            path="/picks"
            element={
              currentWeek ? (
                <PicksView
                  selectedWeekId={currentWeek.id}
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
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                  <div className="text-center space-y-2">
                    <p className="text-red-400 font-semibold">Failed to Load Picks</p>
                    <p className="text-slate-400 text-sm">
                      Unable to load this week's schedule. Please try refreshing the page.
                    </p>
                  </div>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-ice-600 hover:bg-ice-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Refresh Page
                  </button>
                </div>
              )
            }
          />

          <Route
            path="/standings"
            element={
              <StandingsView
                standings={scopedStandings}
                currentUser={profile ? { ...profile, role: profile.role as 'admin' | 'member' } : null}
                segments={segments}
                selectedSegment={selectedSegment}
                onSelectSegment={setSelectedSegment}
              />
            }
          />

          <Route
            path="/matrix"
            element={
              <ResultsView
                selectedWeekId={selectedResultsWeekId}
                availableWeeks={availableResultsWeeks}
                onWeekSelect={setSelectedResultsWeekId}
                isLocked={isResultsWeekLocked}
                weekGames={resultsWeekGames}
                leagueUsers={leagueUsers}
                leaguePicks={resultsWeekPicks}
                syncingScores={syncingScores}
              />
            }
          />

          <Route
            path="/affinity"
            element={<TeamStatsView leagueUsers={leagueUsers} allPicks={teamStatsPicks} />}
          />

          <Route
            path="/history"
            element={
              <MyHistoryView
                currentUserId={user.id}
                relevantWeeks={allWeeks.filter(
                  w => w.status === 'LOCKED' || w.status === 'COMPLETED'
                )}
                picksByWeek={myHistoryPicks}
                gamesByWeek={myHistoryGames}
              />
            }
          />

          <Route
            path="/settings"
            element={
              <SettingsView
                userId={user.id}
                profile={profile}
                onProfileUpdated={async () => {
                  await refreshProfile();
                  // Keep the league directory (matrix/affinity/admin lists) in sync
                  try {
                    setLeagueProfiles(await supabaseService.getProfiles());
                  } catch (error) {
                    console.error('Error reloading profiles:', error);
                  }
                }}
              />
            }
          />

          <Route
            path="/admin"
            element={
              isAdmin ? (
                <AdminView allWeeks={allWeeks} leagueUsers={leagueUsers} />
              ) : (
                <div className="flex items-center justify-center min-h-[60vh]">
                  <p className="text-red-400">Access denied. Admin privileges required.</p>
                </div>
              )
            }
          />

          {/* Signed-in users have no use for the login screen */}
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
