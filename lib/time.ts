import type { TimeWindow } from "./types";

/** Local hour ranges for each departure window: [startHour, endHour). */
export const WINDOWS: Record<TimeWindow, { label: string; start: number; end: number }> = {
  morning: { label: "Morning (5am to noon)", start: 5, end: 12 },
  afternoon: { label: "Afternoon (noon to 5pm)", start: 12, end: 17 },
  evening: { label: "Evening (5pm to midnight)", start: 17, end: 24 },
  any: { label: "Any time", start: 0, end: 24 },
};

/** Today's date (YYYY-MM-DD) in the given IANA time zone. */
export function todayIn(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Offset (ms) of a time zone from UTC at a given instant. */
function tzOffsetMs(tz: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - at;
}

/** Convert a local wall-clock time in a time zone to a UTC epoch (ms). */
export function zonedToUtc(date: string, hour: number, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  const offset = tzOffsetMs(tz, guess);
  const first = guess - offset;
  // Re-check once in case the guess straddled a DST change.
  const offset2 = tzOffsetMs(tz, first);
  return guess - offset2;
}

/** UTC epoch range [start, end) for a trip window at an airport. */
export function windowRange(date: string, window: TimeWindow, tz: string): [number, number] {
  const w = WINDOWS[window];
  return [zonedToUtc(date, w.start, tz), zonedToUtc(date, w.end, tz)];
}

export function formatLocal(epochMs: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(epochMs));
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}
