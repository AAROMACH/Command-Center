import { startOfWeek, format, isValid } from 'date-fns';

/**
 * The Monday-based `weekOf` key ('MM-dd-yyyy') for a work order's scheduled
 * date — the week that owns the assignment. Weekly logs are keyed by this
 * value, so completing a job must file it in the log for its SCHEDULED week,
 * not whatever week it happened to be completed in.
 *
 * Accepts the two scheduleDate shapes the app stores (ISO `YYYY-MM-DD` and
 * `M/D/YYYY`); falls back to the current week only when the date is missing or
 * unparseable.
 */
export function weekOfForScheduleDate(scheduleDate: string | undefined | null): string {
  let d: Date | null = null;
  if (scheduleDate) {
    const parts = scheduleDate.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        d = new Date(`${scheduleDate}T12:00:00`);
      } else {
        const [m, day, y] = parts.map(Number);
        if (y && m && day) d = new Date(y, m - 1, day, 12);
      }
    }
  }
  if (!d || !isValid(d)) d = new Date();
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'MM-dd-yyyy');
}
