import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';

const ET_TIMEZONE = 'America/New_York';

/**
 * Gets the target Saturday date based on current time in ET timezone.
 * Week transitions happen on Monday at 6 AM ET.
 * This function is DST-aware.
 */
export function getTargetSaturdayDate(): Date {
  const nowET = toZonedTime(new Date(), ET_TIMEZONE);
  const day = nowET.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const hour = nowET.getHours();

  let daysToSaturday: number;

  // Week transitions Monday 6 AM ET
  if ((day === 1 && hour >= 6) || (day >= 2 && day <= 6)) {
    // It's Monday after 6 AM through Saturday - target THIS Saturday
    daysToSaturday = 6 - day; // 0 on Saturday, 1 on Friday, etc.
  } else {
    // It's Sunday or Monday before 6 AM - target LAST Saturday (show locked picks)
    daysToSaturday = day === 0 ? -1 : -2; // Sunday: -1 day, Monday before 6 AM: -2 days
  }

  const targetET = new Date(nowET);
  targetET.setDate(nowET.getDate() + daysToSaturday);
  targetET.setHours(12, 0, 0, 0); // Noon ET - safe time that won't roll to next day in UTC

  return fromZonedTime(targetET, ET_TIMEZONE);
}

/**
 * Gets the pick deadline for a given Saturday date.
 * Deadline is Saturday at 11 AM ET.
 * This function is DST-aware.
 *
 * NOTE: When a date string like '2026-01-17' is parsed with new Date(),
 * it's treated as midnight UTC, which is 7 PM ET the previous day.
 * We need to extract the actual date components to set the correct deadline.
 */
export function getPickDeadline(saturdayDate: Date | string): Date {
  // Handle both Date objects and date strings
  let year: number, month: number, day: number;

  if (typeof saturdayDate === 'string') {
    // Parse 'YYYY-MM-DD' string directly
    const parts = saturdayDate.split('-');
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
    day = parseInt(parts[2], 10);
  } else {
    // For Date objects, we need to be careful about UTC vs local interpretation
    // If the date was created from a string, extract the UTC date parts
    year = saturdayDate.getUTCFullYear();
    month = saturdayDate.getUTCMonth();
    day = saturdayDate.getUTCDate();
  }

  // Create a date representing 11 AM ET on the Saturday
  // We create it in the ET timezone context
  const deadlineET = new Date(year, month, day, 13, 0, 0, 0);
  return fromZonedTime(deadlineET, ET_TIMEZONE);
}

/**
 * Formats a date in ET timezone.
 */
export function formatETTime(date: Date, formatStr: string = 'h:mm a zzz'): string {
  return format(toZonedTime(date, ET_TIMEZONE), formatStr, { timeZone: ET_TIMEZONE });
}

/**
 * Checks if picks are currently locked (past deadline).
 */
export function arePicksLocked(saturdayDate: Date | string): boolean {
  const deadline = getPickDeadline(saturdayDate);
  return new Date() > deadline;
}

/**
 * Checks if current time is past 3 AM ET Sunday (day after the given Saturday).
 */
export function isAfterSunday3AM(saturdayDate: Date | string): boolean {
  // Parse the Saturday date
  let year: number, month: number, day: number;

  if (typeof saturdayDate === 'string') {
    const parts = saturdayDate.split('-');
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    day = parseInt(parts[2], 10);
  } else {
    year = saturdayDate.getUTCFullYear();
    month = saturdayDate.getUTCMonth();
    day = saturdayDate.getUTCDate();
  }

  // Create Sunday 3 AM ET (Saturday + 1 day, 3 AM)
  const sunday3amET = new Date(year, month, day + 1, 3, 0, 0, 0);
  const sunday3amUTC = fromZonedTime(sunday3amET, ET_TIMEZONE);

  return new Date() > sunday3amUTC;
}

/**
 * Gets time remaining until deadline in a human-readable format.
 */
export function getTimeUntilDeadline(saturdayDate: Date | string): string {
  const deadline = getPickDeadline(saturdayDate);
  const now = new Date();

  if (now > deadline) {
    return 'Locked';
  }

  const diff = deadline.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  return `${hours}h ${minutes}m`;
}
