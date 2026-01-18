export const fetchRealNhlSchedule = async (
  dateStr: string
): Promise<ScheduleResult> => {
  const url = `https://api-web.nhle.com/v1/schedule/${dateStr}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NHL API ${res.status}`);
  const body = await res.json();

  const games = (body.gameWeek?.[0]?.games ?? []).map((g: any, i: number) => ({
    id: `prod-${dateStr}-${i}`,
    weekId: `week-${dateStr}`,
    homeTeamId: g.homeTeam.abbrev,
    awayTeamId: g.awayTeam.abbrev,
    startTime: g.startTimeUTC,          // already ISO-8601 UTC
    status: 'SCHEDULED'
  }));

  return {
    games,
    sourceUrl: `https://www.nhl.com/schedule/${dateStr}`
  };
};