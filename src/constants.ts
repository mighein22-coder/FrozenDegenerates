import { Team } from './types';

/**
 * Bounds of the NHL regular season, as YYYY-MM-DD.
 *
 * The pool only plays Saturdays, so these are used to enumerate the season's
 * Saturdays and split them into three segments (see `lib/segments.ts`). Only the
 * Saturdays inside this range count; the exact start and end days need not be
 * Saturdays themselves.
 *
 * 2026-27: opens Tuesday 29 September 2026 and concludes Saturday 10 April 2027
 * — the NHL's first 84-game season since 1993-94.
 *
 * UPDATE THESE EVERY SEASON. They are the only dial controlling where the
 * segment boundaries fall.
 */
export const SEASON_START = '2026-09-29';
export const SEASON_END = '2027-04-10';

/** Label shown for the whole-season view, alongside the three segments. */
export const FULL_SEASON_LABEL = 'Full Season';

export const TEAMS: Record<string, Team> = {
  // Atlantic
  BOS: { id: 'BOS', name: 'Bruins', abbreviation: 'BOS', city: 'Boston', logoColor: '#FFB81C' },
  TOR: { id: 'TOR', name: 'Maple Leafs', abbreviation: 'TOR', city: 'Toronto', logoColor: '#00205B' },
  TBL: { id: 'TBL', name: 'Lightning', abbreviation: 'TBL', city: 'Tampa Bay', logoColor: '#002868' },
  FLA: { id: 'FLA', name: 'Panthers', abbreviation: 'FLA', city: 'Florida', logoColor: '#C8102E' },
  BUF: { id: 'BUF', name: 'Sabres', abbreviation: 'BUF', city: 'Buffalo', logoColor: '#002654' },
  DET: { id: 'DET', name: 'Red Wings', abbreviation: 'DET', city: 'Detroit', logoColor: '#CE1126' },
  MTL: { id: 'MTL', name: 'Canadiens', abbreviation: 'MTL', city: 'Montreal', logoColor: '#AF1E2D' },
  OTT: { id: 'OTT', name: 'Senators', abbreviation: 'OTT', city: 'Ottawa', logoColor: '#DA1A32' },

  // Metro
  NYR: { id: 'NYR', name: 'Rangers', abbreviation: 'NYR', city: 'New York', logoColor: '#0038A8' },
  NJD: { id: 'NJD', name: 'Devils', abbreviation: 'NJD', city: 'New Jersey', logoColor: '#CE1126' },
  CAR: { id: 'CAR', name: 'Hurricanes', abbreviation: 'CAR', city: 'Carolina', logoColor: '#CC0000' },
  NYI: { id: 'NYI', name: 'Islanders', abbreviation: 'NYI', city: 'New York', logoColor: '#00539B' },
  PHI: { id: 'PHI', name: 'Flyers', abbreviation: 'PHI', city: 'Philadelphia', logoColor: '#F74902' },
  PIT: { id: 'PIT', name: 'Penguins', abbreviation: 'PIT', city: 'Pittsburgh', logoColor: '#FCB514' },
  WSH: { id: 'WSH', name: 'Capitals', abbreviation: 'WSH', city: 'Washington', logoColor: '#041E42' },
  CBJ: { id: 'CBJ', name: 'Blue Jackets', abbreviation: 'CBJ', city: 'Columbus', logoColor: '#002654' },

  // Central
  COL: { id: 'COL', name: 'Avalanche', abbreviation: 'COL', city: 'Colorado', logoColor: '#6F263D' },
  DAL: { id: 'DAL', name: 'Stars', abbreviation: 'DAL', city: 'Dallas', logoColor: '#006847' },
  NSH: { id: 'NSH', name: 'Predators', abbreviation: 'NSH', city: 'Nashville', logoColor: '#FFB81C' },
  CHI: { id: 'CHI', name: 'Blackhawks', abbreviation: 'CHI', city: 'Chicago', logoColor: '#CF0A2C' },
  MIN: { id: 'MIN', name: 'Wild', abbreviation: 'MIN', city: 'Minnesota', logoColor: '#154734' },
  STL: { id: 'STL', name: 'Blues', abbreviation: 'STL', city: 'St. Louis', logoColor: '#002F87' },
  WPG: { id: 'WPG', name: 'Jets', abbreviation: 'WPG', city: 'Winnipeg', logoColor: '#041E42' },
  UTA: { id: 'UTA', name: 'Hockey Club', abbreviation: 'UTA', city: 'Utah', logoColor: '#010101' },

  // Pacific
  VGK: { id: 'VGK', name: 'Golden Knights', abbreviation: 'VGK', city: 'Vegas', logoColor: '#B4975A' },
  EDM: { id: 'EDM', name: 'Oilers', abbreviation: 'EDM', city: 'Edmonton', logoColor: '#FF4C00' },
  VAN: { id: 'VAN', name: 'Canucks', abbreviation: 'VAN', city: 'Vancouver', logoColor: '#00205B' },
  LAK: { id: 'LAK', name: 'Kings', abbreviation: 'LAK', city: 'Los Angeles', logoColor: '#111111' },
  SJS: { id: 'SJS', name: 'Sharks', abbreviation: 'SJS', city: 'San Jose', logoColor: '#006D75' },
  ANA: { id: 'ANA', name: 'Ducks', abbreviation: 'ANA', city: 'Anaheim', logoColor: '#F47A38' },
  CGY: { id: 'CGY', name: 'Flames', abbreviation: 'CGY', city: 'Calgary', logoColor: '#C8102E' },
  SEA: { id: 'SEA', name: 'Kraken', abbreviation: 'SEA', city: 'Seattle', logoColor: '#99D9D9' },
};
