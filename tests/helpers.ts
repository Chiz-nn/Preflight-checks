/**
 * Test harness: a fake network that serves each public API's response shape,
 * plus a frozen clock, so the rules engine can be tested offline and the
 * results never depend on today's real weather.
 */
import { vi } from "vitest";
import { AIRPORTS } from "@/lib/airports";
import { clearCache } from "@/lib/http";

/** Tuesday Oct 13 2026, 10:00 in Chicago. "Today" for every test. */
export const NOW = new Date("2026-10-13T15:00:00Z");
export const TODAY = "2026-10-13";
export const TOMORROW = "2026-10-14";

export interface HourlyOverride {
  /** UTC hour range [from, to) on the given UTC date. */
  date: string;
  fromHour: number;
  toHour: number;
  shortForecast: string;
  pop: number;
  wind?: string;
}

export interface FakeWorld {
  faa?: string; // FAA XML document
  hourly?: Record<string, HourlyOverride[]>; // airport -> hazardous hours
  alerts?: Record<string, object[]>; // airport -> alert properties
  taf?: Record<string, object>; // airport -> TAF JSON object
  fail?: string[]; // URL substrings that should return HTTP 503
}

const FAA_EMPTY = `<?xml version="1.0"?><AIRPORT_STATUS_INFORMATION><Update_Time>Tue Oct 13 15:00:00 2026 GMT</Update_Time></AIRPORT_STATUS_INFORMATION>`;

export function faaXml(...delayTypes: string[]): string {
  return `<?xml version="1.0"?><AIRPORT_STATUS_INFORMATION><Update_Time>Tue Oct 13 15:00:00 2026 GMT</Update_Time><Dtd_File>http://nasstatus.faa.gov/xml/AirportStatus.dtd</Dtd_File>${delayTypes.join("")}</AIRPORT_STATUS_INFORMATION>`;
}

/** Seven days of calm hourly NWS periods, with hazards spliced in where the test asks. */
function hourlyPeriods(overrides: HourlyOverride[] = []) {
  const periods = [];
  const start = Date.parse("2026-10-13T00:00:00Z");
  for (let h = 0; h < 7 * 24; h++) {
    const t = new Date(start + h * 3_600_000);
    const iso = t.toISOString().replace(".000Z", "+00:00");
    const end = new Date(t.getTime() + 3_600_000).toISOString().replace(".000Z", "+00:00");
    const date = iso.slice(0, 10);
    const hour = t.getUTCHours();
    const o = overrides.find((x) => x.date === date && hour >= x.fromHour && hour < x.toHour);
    periods.push({
      startTime: iso,
      endTime: end,
      temperature: 68,
      temperatureUnit: "F",
      windSpeed: o?.wind ?? "8 mph",
      shortForecast: o?.shortForecast ?? "Mostly Sunny",
      probabilityOfPrecipitation: { value: o?.pop ?? 5 },
    });
  }
  return periods;
}

function codeAt(latLon: string): string {
  const [lat, lon] = latLon.split(",").map(Number);
  const a = AIRPORTS.find((x) => Math.abs(x.lat - lat) < 1e-6 && Math.abs(x.lon - lon) < 1e-6);
  if (!a) throw new Error(`fake network: no airport at ${latLon}`);
  return a.code;
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

/** Install the fake network and frozen clock. Returns the fetch spy so tests can assert what was called. */
export function useWorld(world: FakeWorld) {
  clearCache();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  const spy = vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (world.fail?.some((f) => url.includes(f))) return new Response("unavailable", { status: 503, statusText: "Service Unavailable" });

    if (url.includes("nasstatus.faa.gov")) return new Response(world.faa ?? FAA_EMPTY, { status: 200 });

    let m = url.match(/api\.weather\.gov\/points\/([-\d.]+,[-\d.]+)/);
    if (m) {
      const code = codeAt(m[1]);
      return json({ properties: { forecastHourly: `https://api.weather.gov/test-hourly/${code}`, forecast: "", timeZone: "", gridId: "X", gridX: 1, gridY: 1 } });
    }
    m = url.match(/test-hourly\/(\w+)/);
    if (m) return json({ properties: { periods: hourlyPeriods(world.hourly?.[m[1]]) } });

    m = url.match(/alerts\/active\?point=([-\d.]+,[-\d.]+)/);
    if (m) {
      const code = codeAt(m[1]);
      return json({ features: (world.alerts?.[code] ?? []).map((p, i) => ({ id: `alert-${code}-${i}`, properties: p })) });
    }

    m = url.match(/aviationweather\.gov\/api\/data\/taf\?ids=K(\w+)/);
    if (m) return json(world.taf?.[m[1]] ? [world.taf[m[1]]] : []);

    throw new Error(`fake network: unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

export function resetWorld() {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearCache();
}

/**
 * A TAF in the aviationweather.gov JSON shape (modeled on a real KDFW TAF),
 * valid for the next 30 hours, with one optional hazard group.
 */
export function taf(code: string, hazard?: { fromHourUtc: number; toHourUtc: number; wxString?: string; visib?: number; ceiling?: number; gust?: number; change?: string }) {
  const from = Date.parse("2026-10-13T12:00:00Z") / 1000;
  const to = from + 30 * 3600;
  const base = Date.parse("2026-10-13T00:00:00Z") / 1000;
  const fcsts: object[] = [
    { timeFrom: from, timeTo: to, fcstChange: null, probability: null, wspd: 12, wgst: null, visib: "6+", wxString: null, clouds: [{ cover: "SCT", base: 5000, type: null }] },
  ];
  if (hazard) {
    fcsts.push({
      timeFrom: base + hazard.fromHourUtc * 3600,
      timeTo: base + hazard.toHourUtc * 3600,
      fcstChange: hazard.change ?? "TEMPO",
      probability: null,
      wspd: 20,
      wgst: hazard.gust ?? null,
      visib: hazard.visib ?? "6+",
      wxString: hazard.wxString ?? null,
      clouds: hazard.ceiling ? [{ cover: "OVC", base: hazard.ceiling, type: "CB" }] : [],
    });
  }
  return {
    icaoId: `K${code}`,
    rawTAF: `TAF K${code} 131120Z 1312/1418 18012KT P6SM SCT050${hazard ? " TEMPO TSRA" : ""}`,
    issueTime: "2026-10-13T11:20:00.000Z",
    validTimeFrom: from,
    validTimeTo: to,
    fcsts,
  };
}

export function alert(event: string, onset: string, ends: string, severity = "Severe") {
  return { id: `https://api.weather.gov/alerts/urn:test:${event.replace(/\s/g, "")}`, event, severity, certainty: "Likely", urgency: "Expected", headline: `${event} in effect`, description: "", onset, ends, expires: ends, areaDesc: "Test County" };
}
