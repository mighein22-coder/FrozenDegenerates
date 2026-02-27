import { User, Game, Week, Pick, StandingsRow } from '../types';
import { TEAMS, MOCK_USERS, CURRENT_WEEK_ID } from '../constants';

/**
 * Transition Rule: Mondays at 6:00 AM Eastern time.
 * If before Mon 6AM, target is the Saturday that just occurred.
 * If after Mon 6AM, target is the upcoming Saturday.
 */
export const getTargetSaturdayDate = (): Date => {
  const now = new Date();
  // Simplified ET Offset (-5h)
  const etOffset = -5; 
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const nowET = new Date(utc + (3600000 * etOffset));
  
  const day = nowET.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const hour = nowET.getHours();

  let daysToSaturday;
  
  // Transition logic
  if ((day === 1 && hour >= 6) || day > 1) {
    // It's Mon 6AM+ through Saturday. Target is the *next* Saturday.
    daysToSaturday = (6 - day + 7) % 7;
  } else {
    // It's Sunday or Mon before 6AM. Target is the *previous* Saturday.
    daysToSaturday = (day === 0) ? -1 : -2;
  }

  const target = new Date(nowET);
  target.setDate(nowET.getDate() + daysToSaturday);
  target.setHours(19, 0, 0, 0); 
  return target;
};

// Initial Setup Helper
const initializeData = () => {
  const targetSat = getTargetSaturdayDate();
  const dateStr = targetSat.toISOString().split('T')[0];
  const weekId = `week-${dateStr}`;

  // Ensure mock users exist in storage
  if (!localStorage.getItem('icepick_users')) {
    localStorage.setItem('icepick_users', JSON.stringify(MOCK_USERS));
  }
};

initializeData();

export const dataService = {
  getWeeks: (): Week[] => {
    const targetSat = getTargetSaturdayDate();
    const dateStr = targetSat.toISOString().split('T')[0];
    
    // Dynamic week generation based on the Monday 6AM rule
    const currentWeek: Week = {
        id: `week-${dateStr}`,
        number: Math.ceil(targetSat.getDate() / 7) + (targetSat.getMonth() * 4), // Dummy week number logic
        startDate: dateStr,
        endDate: dateStr,
        status: new Date() > new Date(targetSat.getTime() + 86400000) ? 'COMPLETED' : 'OPEN'
    };

    return [currentWeek];
  },

  getCurrentWeekId: (): string => {
    const targetSat = getTargetSaturdayDate();
    return `week-${targetSat.toISOString().split('T')[0]}`;
  },
  
  getGamesByWeek: (weekId: string): Game[] => {
    const games = JSON.parse(localStorage.getItem(`icepick_games_${weekId}`) || '[]');
    return games;
  },

  saveGamesToStorage: (weekId: string, games: Game[]) => {
    localStorage.setItem(`icepick_games_${weekId}`, JSON.stringify(games));
  },

  getUserPicks: (userId: string, weekId: string): Pick[] => {
    const picks = JSON.parse(localStorage.getItem('icepick_picks') || '[]') as Pick[];
    return picks.filter(p => p.userId === userId && p.weekId === weekId);
  },

  getAllPicksByWeek: (weekId: string): Pick[] => {
    const picks = JSON.parse(localStorage.getItem('icepick_picks') || '[]') as Pick[];
    return picks.filter(p => p.weekId === weekId);
  },

  getAllPicks: (): Pick[] => {
    return JSON.parse(localStorage.getItem('icepick_picks') || '[]');
  },

  getUsers: (): User[] => {
    return JSON.parse(localStorage.getItem('icepick_users') || JSON.stringify(MOCK_USERS));
  },

  getPickDeadline: (weekId: string): Date => {
    // Deadline is always 11AM ET on the Saturday of that weekId
    const datePart = weekId.replace('week-', '');
    const deadline = new Date(datePart);
    deadline.setHours(11, 0, 0, 0);
    return deadline;
  },

  isPicksLocked: (weekId: string): boolean => {
    const deadline = dataService.getPickDeadline(weekId);
    return new Date() > deadline;
  },

  savePicks: (newPicks: Pick[]) => {
    if (newPicks.length === 0) return;
    const weekId = newPicks[0].weekId;

    if (dataService.isPicksLocked(weekId)) {
      throw new Error("Picks are locked for this week.");
    }

    const allPicks = JSON.parse(localStorage.getItem('icepick_picks') || '[]') as Pick[];
    const filtered = allPicks.filter(p => !(p.userId === newPicks[0].userId && p.weekId === newPicks[0].weekId));
    localStorage.setItem('icepick_picks', JSON.stringify([...filtered, ...newPicks]));
  },

  getStandings: (): StandingsRow[] => {
    const users = dataService.getUsers();
    const picks = dataService.getAllPicks();
    const currentWeekId = dataService.getCurrentWeekId();
    
    return users.map(user => {
      const userPicks = picks.filter(p => p.userId === user.id);
      const totalPoints = userPicks.reduce((sum, p) => sum + (p.pointsEarned || 0), 0);
      const wins = userPicks.filter(p => p.result === 'WIN').length;
      const losses = userPicks.filter(p => p.result === 'LOSS').length;
      const currentWeekPicks = userPicks.filter(p => p.weekId === currentWeekId);
      const weeklyScore = currentWeekPicks.reduce((sum, p) => sum + (p.pointsEarned || 0), 0);

      return {
        userId: user.id,
        name: user.name,
        avatar: user.avatar,
        totalPoints,
        wins,
        losses,
        weeklyScore,
        rank: 0,
      };
    }).sort((a, b) => b.totalPoints - a.totalPoints).map((row, index) => ({ ...row, rank: index + 1 }));
  },

  login: (email: string): User | null => {
    const users = dataService.getUsers();
    const normalizedEmail = email.trim().toLowerCase();
    return users.find((u: any) => u.email.toLowerCase() === normalizedEmail) || null;
  }
};