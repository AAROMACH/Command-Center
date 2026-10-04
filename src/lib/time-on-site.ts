import type { AssignmentTimeLog, TripLog } from './types';

/**
 * Parse a clock string — "14:30", "2:30 PM", "2:30PM", "10:00 AM EST" — into
 * hours/minutes (24h). Null when it isn't a time.
 */
export function parseClock(t: string | undefined | null): { h: number; m: number } | null {
    if (!t) return null;
    const match = t.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/);
    if (!match) return null;
    let h = Number(match[1]);
    const m = Number(match[2]);
    const ap = match[3]?.toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    if (h > 23 || m > 59) return null;
    return { h, m };
}

/** "2:30 PM" for any clock string or ISO datetime; the input unchanged if unparseable. */
export function formatClock(t: string | undefined | null): string {
    if (!t) return 'TBD';
    const iso = /^\d{4}-\d{2}-\d{2}T/.test(t) ? new Date(t) : null;
    const c = iso && !isNaN(iso.getTime()) ? { h: iso.getHours(), m: iso.getMinutes() } : parseClock(t);
    if (!c) return t;
    const h12 = c.h % 12 === 0 ? 12 : c.h % 12;
    return `${h12}:${String(c.m).padStart(2, '0')} ${c.h < 12 ? 'AM' : 'PM'}`;
}

/** A trip log's date ('yyyy-MM-dd') + clock string → ISO timestamp. */
function atClock(date: string, clock: string | undefined): string | undefined {
    const c = parseClock(clock);
    const [y, mo, d] = (date || '').split('-').map(Number);
    if (!c || !y || !mo || !d) return undefined;
    return new Date(y, mo - 1, d, c.h, c.m).toISOString();
}

/**
 * On-site sessions from the real trip records (Start Trip → Check In →
 * Check Out): on site from arrival (check-in) to the trip's end (check-out).
 * Replaces the demo `assignmentTimeLogs` several screens were reading.
 */
export function onSiteSessions(trips: TripLog[]): AssignmentTimeLog[] {
    return trips
        .filter(t => !!t.arrivedAt)
        .map(t => {
            const checkInTime = atClock(t.date, t.arrivedAt)!;
            const checkOutTime = t.endTime ? atClock(t.date, t.endTime) : undefined;
            const minutesWorked = checkInTime && checkOutTime
                ? Math.max(0, Math.round((new Date(checkOutTime).getTime() - new Date(checkInTime).getTime()) / 60000))
                : undefined;
            return {
                id: t.id,
                workOrderId: t.assignmentId || t.workOrderId || '',
                techId: t.technicianId,
                checkInTime,
                checkOutTime,
                minutesWorked,
                location: t.arrivalLocation || t.endLocation || '',
            };
        })
        .filter(s => !!s.checkInTime)
        .sort((a, b) => b.checkInTime.localeCompare(a.checkInTime));
}
