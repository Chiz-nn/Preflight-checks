import { fetchCached } from "../http";

/**
 * Terminal Aerodrome Forecasts from aviationweather.gov (NOAA). These are the
 * airport-specific forecasts pilots and airline dispatchers plan against.
 * They cover roughly the next 24 to 30 hours. Public, no key.
 */
export function tafApiUrl(code: string): string {
  return `https://aviationweather.gov/api/data/taf?ids=K${code}&format=json`;
}

export function tafPageUrl(code: string): string {
  return `https://aviationweather.gov/data/taf/?ids=K${code}&decoded=1`;
}

export interface TafForecast {
  timeFrom: number; // epoch seconds
  timeTo: number;
  fcstChange: string | null; // FM, TEMPO, PROB, BECMG or null
  probability: number | null;
  wspd: number | null;
  wgst: number | null;
  visib: number | string | null; // "6+" means 6 statute miles or more
  wxString: string | null;
  clouds: { cover: string; base: number | null; type: string | null }[];
}

export interface Taf {
  icaoId: string;
  rawTAF: string;
  issueTime: string;
  validTimeFrom: number;
  validTimeTo: number;
  fcsts: TafForecast[];
}

export async function getTaf(code: string): Promise<Taf | null> {
  const res = await fetchCached<Taf[]>(tafApiUrl(code), { ttlMs: 10 * 60_000, parse: "json" });
  return Array.isArray(res) && res.length ? res[0] : null;
}

export function visibilityMiles(v: TafForecast["visib"]): number {
  if (v == null) return 10;
  if (typeof v === "number") return v;
  const n = parseFloat(v.replace("+", ""));
  return Number.isFinite(n) ? n : 10;
}

/** Lowest broken/overcast layer or vertical visibility, in feet. */
export function ceilingFt(f: TafForecast): number | null {
  const bases = (f.clouds ?? [])
    .filter((c) => ["BKN", "OVC", "VV", "OVX"].includes(c.cover) && c.base != null)
    .map((c) => c.base as number);
  return bases.length ? Math.min(...bases) : null;
}
