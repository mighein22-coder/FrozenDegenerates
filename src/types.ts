export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'admin' | 'member';
}

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  logoColor: string;
  city: string;
}

export interface Game {
  id: string;
  weekId: string;
  nhlGameId?: number;
  homeTeamId: string;
  awayTeamId: string;
  startTime: string; // ISO string
  status: 'SCHEDULED' | 'LIVE' | 'FINAL';
  homeScore?: number;
  awayScore?: number;
}

export interface Pick {
  userId: string;
  weekId: string;
  gameId: string;
  selectedTeamId: string;
  confidence: number; // 1-5
  pointsEarned: number; // 0 if loss/pending, equal to confidence if win
  result: 'WIN' | 'LOSS' | 'PENDING';
}

export interface Week {
  id: string;
  number: number;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'LOCKED' | 'COMPLETED';
}

export interface Segment {
  number: number;
  label: string;
  /** First Saturday of the segment, YYYY-MM-DD */
  startDate: string;
  /** Last Saturday of the segment, YYYY-MM-DD */
  endDate: string;
  weekCount: number;
}

export interface StandingsRow {
  userId: string;
  name: string;
  avatar: string;
  /**
   * Points for the selected scope — a single segment, or the whole season when
   * no segment is selected. This drives the rank.
   */
  totalPoints: number;
  /** Cumulative season points, shown alongside for reference in every scope. */
  seasonPoints: number;
  /** Wins and losses for the selected scope. */
  wins: number;
  losses: number;
  weeklyScore: number;
  rank: number;
}