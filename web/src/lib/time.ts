// All display is in Asia/Jakarta regardless of the device timezone.
// Business decisions (what is past, bookable, check-in-able) are made by the server.

export const TZ = 'Asia/Jakarta';

/** "YYYY-MM-DD" → Date at 00:00 UTC (only used for calendar arithmetic/formatting). */
function dateOnly(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!));
}

export function addDays(d: string, n: number): string {
  const x = dateOnly(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatDateLong(d: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(dateOnly(d));
}

export function formatDateShort(d: string): { weekday: string; day: string; month: string } {
  const x = dateOnly(d);
  return {
    weekday: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' }).format(x),
    day: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric' }).format(x),
    month: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short' }).format(x),
  };
}

/** "Today", "Tomorrow" or "Tue 6 Oct" relative to the server's Jakarta today. */
export function relativeDay(d: string, today: string): string {
  if (d === today) return 'Today';
  if (d === addDays(today, 1)) return 'Tomorrow';
  const s = formatDateShort(d);
  return `${s.weekday} ${s.day} ${s.month}`;
}

/** "18:00:00" → "18:00" */
export const hhmm = (t: string) => t.slice(0, 5);

export function addMinutesToTime(t: string, minutes: number): string {
  const [h, m] = t.split(':').map(Number);
  const total = h! * 60 + m! + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** ISO timestamp → "HH:MM" in Jakarta. */
export function timeInJakarta(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

export function dateTimeInJakarta(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso));
}

export function greeting(nowMs: number): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date(nowMs)));
  if (hour < 11) return 'Good morning';
  if (hour < 15) return 'Good afternoon';
  if (hour < 19) return 'Good evening';
  return 'Good night';
}

export function formatDuration(minutes: number): string {
  return `${minutes} minutes`;
}

/** Half-hour options between two "HH:MM" values (inclusive). */
export function halfHourOptions(from = '00:00', to = '23:30'): string[] {
  const out: string[] = [];
  for (let t = from; t <= to; t = addMinutesToTime(t, 30)) {
    out.push(t);
    if (t === '23:30') break;
  }
  return out;
}
