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

export interface StandingsRow {
  userId: string;
  userName: string;
  avatar: string;
  totalPoints: number;
  wins: number;
  losses: number;
  weeklyScore: number;
  rank: number;
}