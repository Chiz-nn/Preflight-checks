import { fetchCached } from "../http";
import type { Airport } from "../airports";

/**
 * National Weather Service API (api.weather.gov). Public, no key, requires a
 * User-Agent. Two calls per airport: the hourly forecast (about 7 days out)
 * and any active watches, warnings, and advisories for that exact point.
 */
const BASE = "https://api.weather.gov";

interface PointsResponse {
  properties: { forecastHourly: string; forecast: string; timeZone: string; gridId: string; gridX: number; gridY: number };
}

export interface HourlyPeriod {
  startTime: string; // ISO with the local offset, e.g. 2026-10-13T14:00:00-05:00
  endTime: string;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string; // "10 mph" or "10 to 15 mph"
  windGust?: { value: number | null } | string | null;
  shortForecast: string;
  probabilityOfPrecipitation?: { value: number | null };
}

export interface NwsAlert {
  id: string;
  event: string;
  severity: string; // Extreme | Severe | Moderate | Minor | Unknown
  certainty: string;
  urgency: string;
  headline: string;
  description: string;
  onset: string | null;
  ends: string | null;
  expires: string | null;
  areaDesc: string;
}

export function forecastPageUrl(a: Airport): string {
  return `https://forecast.weather.gov/MapClick.php?lat=${a.lat}&lon=${a.lon}`;
}

export function alertsUrl(a: Airport): string {
  return `${BASE}/alerts/active?point=${a.lat},${a.lon}`;
}

async function getPoint(a: Airport): Promise<PointsResponse> {
  // Gridpoint metadata almost never changes; cache for a day.
  return fetchCached<PointsResponse>(`${BASE}/points/${a.lat},${a.lon}`, {
    ttlMs: 24 * 3_600_000,
    parse: "json",
    headers: { Accept: "application/geo+json" },
  });
}

export async function getHourlyForecast(a: Airport): Promise<HourlyPeriod[]> {
  const point = await getPoint(a);
  const res = await fetchCached<{ properties: { periods: HourlyPeriod[] } }>(point.properties.forecastHourly, {
    ttlMs: 15 * 60_000,
    parse: "json",
    timeoutMs: 12_000,
    headers: { Accept: "application/geo+json" },
  });
  return res.properties.periods ?? [];
}

export async function getActiveAlerts(a: Airport): Promise<NwsAlert[]> {
  const res = await fetchCached<{ features: { id: string; properties: NwsAlert }[] }>(alertsUrl(a), {
    ttlMs: 5 * 60_000,
    parse: "json",
    headers: { Accept: "application/geo+json" },
  });
  return (res.features ?? []).map((f) => ({ ...f.properties, id: f.properties.id ?? f.id }));
}

/** "10 to 15 mph" -> 15 */
export function maxMph(s: string | undefined): number {
  if (!s) return 0;
  const nums = s.match(/\d+/g)?.map(Number) ?? [];
  return nums.length ? Math.max(...nums) : 0;
}
