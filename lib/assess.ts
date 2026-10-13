import { getAirport, nearbyAirports, type Airport } from "./airports";
import { errorMessage } from "./http";
import { addDays, daysBetween, formatLocal, todayIn, WINDOWS, zonedToUtc } from "./time";
import { FAA_PUBLIC_PAGE, getFaaFeed, type FaaEvent, type FaaFeed } from "./sources/faa";
import { alertsUrl, forecastPageUrl, getActiveAlerts, getHourlyForecast, maxMph, type HourlyPeriod } from "./sources/nws";
import { ceilingFt, getTaf, tafPageUrl, visibilityMiles, type TafForecast } from "./sources/taf";
import { BTS_PAGE, legBaseline, loadBaseline } from "./sources/bts";
import type { AlternateAirport, Assessment, Baseline, Level, Role, Signal, SourceCheck, TripInput, Verdict } from "./types";

/** Live forecasts are trusted out to this many days. Past it we rely on history. */
export const FORECAST_HORIZON_DAYS = 7;

interface Stop {
  role: Role;
  airport: Airport;
  start: number; // UTC ms
  end: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ROLE_LABEL: Record<Role, string> = { origin: "departure", via: "connection", dest: "arrival" };

export class InputError extends Error {}

export function validateTrip(t: Partial<TripInput>): TripInput {
  const origin = String(t.origin ?? "").toUpperCase();
  const dest = String(t.dest ?? "").toUpperCase();
  const via = t.via ? String(t.via).toUpperCase() : undefined;
  if (!getAirport(origin)) throw new InputError(`Unknown origin airport "${origin}"`);
  if (!getAirport(dest)) throw new InputError(`Unknown destination airport "${dest}"`);
  if (via && !getAirport(via)) throw new InputError(`Unknown connection airport "${via}"`);
  if (origin === dest) throw new InputError("Origin and destination are the same airport");
  if (via && (via === origin || via === dest)) throw new InputError("Connection must differ from origin and destination");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(t.date))) throw new InputError("Date must be YYYY-MM-DD");
  const window = t.window && t.window in WINDOWS ? t.window : "any";
  return { origin, dest, via, date: String(t.date), window };
}

/** "1 hour and 15 minutes" -> 75 */
function parseMinutes(text: string): number | null {
  const h = text.match(/(\d+)\s*hour/i);
  const m = text.match(/(\d+)\s*min/i);
  if (!h && !m) return null;
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

function localHourLabel(iso: string): string {
  const h = Number(iso.slice(11, 13));
  if (h === 0) return "midnight";
  if (h === 12) return "noon";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export async function assess(input: TripInput): Promise<Assessment> {
  const trip = validateTrip(input);
  const origin = getAirport(trip.origin)!;
  const daysOut = daysBetween(todayIn(origin.tz), trip.date);
  if (daysOut < 0) throw new InputError("That date is in the past");
  if (daysOut > 120) throw new InputError("Pick a date within the next 120 days");

  const w = WINDOWS[trip.window];
  const stops: Stop[] = [{ role: "origin" as Role, code: trip.origin, startH: w.start }]
    .concat(trip.via ? [{ role: "via", code: trip.via, startH: w.start }] : [])
    .concat([{ role: "dest", code: trip.dest, startH: w.start }])
    .map(({ role, code, startH }) => {
      const a = getAirport(code)!;
      // Departure uses the chosen window. Connections and arrivals happen later the
      // same day, so for those we look from the window start through midnight.
      const endH = role === "origin" ? w.end : 24;
      return { role: role as Role, airport: a, start: zonedToUtc(trip.date, startH, a.tz), end: zonedToUtc(trip.date, endH, a.tz) };
    });

  if (daysOut === 0) {
    // Same-day trip: only look at hours that haven't happened yet (keep the current hour).
    const from = Date.now() - 3_600_000;
    if (stops[0].end <= Date.now()) throw new InputError("That departure window has already passed today");
    stops.forEach((s) => (s.start = Math.max(s.start, from)));
  }

  const signals: Signal[] = [];
  const checks: SourceCheck[] = [];
  const counter = new Map<string, number>();
  const add = (s: Omit<Signal, "id">) => {
    const key = `${s.source}-${s.airport}`;
    const n = (counter.get(key) ?? 0) + 1;
    counter.set(key, n);
    signals.push({ ...s, id: `${key}-${n}`.toLowerCase() });
  };
  const now = new Date().toISOString();
  const live = daysOut <= FORECAST_HORIZON_DAYS;

  // ---- FAA: same-day airport programs -------------------------------------------------
  let faa: FaaFeed | null = null;
  if (daysOut <= 1) {
    try {
      faa = await getFaaFeed();
      checks.push({ source: "faa", status: "ok", url: FAA_PUBLIC_PAGE, fetchedAt: now, note: `${faa.events.length} active event(s) nationwide` });
      for (const stop of stops) {
        for (const e of faa.events.filter((x) => x.airport === stop.airport.code)) addFaaSignal(add, e, stop, daysOut);
      }
    } catch (e) {
      checks.push({ source: "faa", status: "error", url: FAA_PUBLIC_PAGE, note: errorMessage(e) });
    }
  } else {
    checks.push({ source: "faa", status: "skipped", url: FAA_PUBLIC_PAGE, note: `FAA programs are same-day; not predictive ${daysOut} days out` });
  }

  // ---- NWS alerts, NWS hourly forecast, TAF: per airport, in parallel -------------------
  const forecastCovered: Record<string, boolean> = {};
  const hazardBySource: Record<string, { nws?: boolean; taf?: boolean }> = {};

  await Promise.all(
    stops.map(async (stop) => {
      const a = stop.airport;
      hazardBySource[a.code] = {};
      const tasks: Promise<void>[] = [];

      if (live) {
        tasks.push(
          getActiveAlerts(a)
            .then((alerts) => {
              checks.push({ source: "nws_alerts", airport: a.code, status: "ok", url: alertsUrl(a), fetchedAt: now, note: `${alerts.length} active alert(s)` });
              for (const al of alerts) {
                const from = Date.parse(al.onset ?? "") || Date.now();
                const to = Date.parse(al.ends ?? al.expires ?? "") || from;
                if (to < stop.start || from > stop.end) continue;
                const relevant = /(winter storm|blizzard|ice storm|hurricane|tropical storm|severe thunderstorm|tornado|high wind|extreme wind|wind advisory|snow squall|dense fog|freezing|winter weather|lake effect)/i.test(al.event);
                const level: Level = !relevant ? "info" : /warning/i.test(al.event) ? "rebook" : "watch";
                add({
                  source: "nws_alerts",
                  airport: a.code,
                  level,
                  title: `${al.event} at ${a.code}`,
                  detail: `${al.headline || al.event}. Severity: ${al.severity}, certainty: ${al.certainty}.${relevant ? "" : " Not a flight-impacting alert type."}`,
                  url: al.id?.startsWith("http") ? al.id : alertsUrl(a),
                  validFrom: al.onset ?? undefined,
                  validTo: al.ends ?? al.expires ?? undefined,
                });
              }
            })
            .catch((e) => void checks.push({ source: "nws_alerts", airport: a.code, status: "error", url: alertsUrl(a), note: errorMessage(e) })),
        );

        tasks.push(
          getHourlyForecast(a)
            .then((periods) => {
              const inWindow = periods.filter((p) => {
                const t = Date.parse(p.startTime);
                return t >= stop.start && t < stop.end;
              });
              forecastCovered[a.code] = inWindow.length > 0;
              checks.push({
                source: "nws_forecast",
                airport: a.code,
                status: "ok",
                url: forecastPageUrl(a),
                fetchedAt: now,
                note: inWindow.length ? `${inWindow.length} hourly periods in window` : "trip window is past the end of the hourly forecast",
              });
              if (inWindow.length) hazardBySource[a.code].nws = addForecastSignals(add, inWindow, stop);
            })
            .catch((e) => {
              forecastCovered[a.code] = false;
              checks.push({ source: "nws_forecast", airport: a.code, status: "error", url: forecastPageUrl(a), note: errorMessage(e) });
            }),
        );
      } else {
        forecastCovered[a.code] = false;
        checks.push({ source: "nws_alerts", airport: a.code, status: "skipped", note: `trip is beyond the ${FORECAST_HORIZON_DAYS}-day forecast range` });
        checks.push({ source: "nws_forecast", airport: a.code, status: "skipped", note: `trip is beyond the ${FORECAST_HORIZON_DAYS}-day forecast range` });
      }

      if (daysOut <= 1) {
        tasks.push(
          getTaf(a.code)
            .then((taf) => {
              if (!taf) {
                checks.push({ source: "taf", airport: a.code, status: "ok", url: tafPageUrl(a.code), fetchedAt: now, note: "no TAF currently issued" });
                return;
              }
              const startS = stop.start / 1000;
              const endS = stop.end / 1000;
              if (taf.validTimeTo <= startS) {
                checks.push({ source: "taf", airport: a.code, status: "skipped", url: tafPageUrl(a.code), note: `TAF only runs to ${formatLocal(taf.validTimeTo * 1000, a.tz)}` });
                return;
              }
              checks.push({ source: "taf", airport: a.code, status: "ok", url: tafPageUrl(a.code), fetchedAt: now, note: `issued ${taf.issueTime}` });
              const relevant = taf.fcsts.filter((f) => f.timeTo > startS && f.timeFrom < endS);
              hazardBySource[a.code].taf = addTafSignals(add, relevant, stop, taf.rawTAF);
            })
            .catch((e) => void checks.push({ source: "taf", airport: a.code, status: "error", url: tafPageUrl(a.code), note: errorMessage(e) })),
        );
      } else {
        checks.push({ source: "taf", airport: a.code, status: "skipped", note: "TAFs only cover the next 24 to 30 hours" });
      }

      await Promise.all(tasks);
    }),
  );

  // ---- BTS historical baseline ----------------------------------------------------------
  const month = Number(trip.date.slice(5, 7));
  const legs = trip.via ? [[trip.origin, trip.via], [trip.via, trip.dest]] : [[trip.origin, trip.dest]];
  const baselines: Baseline[] = [];
  if (!loadBaseline()) {
    checks.push({ source: "bts", status: "error", url: BTS_PAGE, note: "data/baseline.json not built yet (run scripts/build_baseline.py)" });
  } else {
    checks.push({ source: "bts", status: "ok", url: BTS_PAGE });
    for (const [from, to] of legs) {
      const b = legBaseline(from, to, month);
      if (!b) continue;
      baselines.push({ leg: `${from}-${to}`, scope: b.scope, month, flights: b.flights, disruptedPct: b.disruptedPct, cancelledPct: b.cancelledPct, nationalDisruptedPct: b.nationalDisruptedPct, period: b.period });
      const rough = b.disruptedPct >= Math.max(b.nationalDisruptedPct * 1.25, b.nationalDisruptedPct + 5);
      const what = b.scope === "route" ? `${from} to ${to} flights` : `departures from ${from}`;
      add({
        source: "bts",
        airport: from,
        // History only drives the verdict when there's no live forecast to go on.
        level: rough && !live ? "watch" : "info",
        title: rough ? `Historically disruption-prone in ${MONTHS[month - 1]}: ${from}-${to}` : `Typical ${MONTHS[month - 1]} history: ${from}-${to}`,
        detail: `${b.disruptedPct}% of ${b.flights.toLocaleString()} ${what} in ${MONTHS[month - 1]} (${b.period}) arrived 15+ min late, were cancelled, or diverted, versus ${b.nationalDisruptedPct}% nationally. Cancellations: ${b.cancelledPct}%.`,
        url: BTS_PAGE,
      });
    }
  }

  // ---- Verdict --------------------------------------------------------------------------
  const verdict: Verdict = signals.some((s) => s.level === "rebook") ? "rebook" : signals.some((s) => s.level === "watch") ? "watch" : "go";

  // ---- Confidence -----------------------------------------------------------------------
  const liveErrors = checks.filter((c) => c.status === "error" && c.source !== "bts");
  const reasons: string[] = [];
  let confidence: Assessment["confidence"];
  const allCovered = stops.every((s) => forecastCovered[s.airport.code]);

  if (!live || !allCovered) {
    confidence = "low";
    reasons.push(
      !live
        ? `The trip is ${daysOut} days out, past the ${FORECAST_HORIZON_DAYS}-day range where forecasts are useful, so this rests on historical patterns only.`
        : "Part of the trip window falls past the end of the hourly forecast, so some of this rests on history.",
    );
  } else if (liveErrors.length >= 2) {
    confidence = "low";
    reasons.push(`${liveErrors.length} live data checks failed, so key evidence is missing.`);
  } else {
    confidence = daysOut <= 2 ? "high" : "medium";
    reasons.push(
      daysOut <= 1
        ? `The trip is ${daysOut === 0 ? "today" : "tomorrow"}: FAA programs, airport forecasts (TAFs), and the hourly forecast all apply.`
        : daysOut === 2
          ? "The trip is 2 days out: hourly forecasts are reliable at this range, though FAA programs and TAFs aren't available yet."
          : `The trip is ${daysOut} days out: forecasts this far ahead often shift, especially the timing of storms.`,
    );
    if (liveErrors.length === 1) {
      confidence = confidence === "high" ? "medium" : "low";
      const c = liveErrors[0];
      reasons.push(`One check failed (${c.source}${c.airport ? ` at ${c.airport}` : ""}: ${c.note}).`);
    }
    for (const [code, h] of Object.entries(hazardBySource)) {
      if (h.nws !== undefined && h.taf !== undefined && h.nws !== h.taf) {
        if (confidence === "high") confidence = "medium";
        reasons.push(`At ${code}, the NWS forecast and the aviation forecast (TAF) disagree about hazards.`);
      }
    }
  }
  if (!loadBaseline()) reasons.push("No historical baseline loaded, so there's no 'normal' to compare against.");

  // ---- Nearby airports (only meaningful while FAA programs apply) -----------------------
  const alternates: AlternateAirport[] = [];
  if (faa) {
    const busy = (code: string) => faa!.events.some((e) => e.airport === code && e.affectsAirlines);
    for (const stop of stops.filter((s) => s.role !== "via")) {
      for (const alt of nearbyAirports(stop.airport.code)) {
        alternates.push({ code: alt.code, name: alt.name, forAirport: stop.airport.code, faaClear: !busy(alt.code) });
      }
    }
  }

  return {
    trip,
    daysOut,
    verdict,
    confidence,
    confidenceReasons: reasons,
    signals: signals.sort((a, b) => rank(b.level) - rank(a.level)),
    checks,
    baselines,
    alternates,
    ruleActions: ruleActions(trip, verdict, signals, stops, alternates, daysOut, confidence),
    generatedAt: now,
  };
}

const rank = (l: Level) => (l === "rebook" ? 2 : l === "watch" ? 1 : 0);

type Add = (s: Omit<Signal, "id">) => void;

function addFaaSignal(add: Add, e: FaaEvent, stop: Stop, daysOut: number) {
  const code = stop.airport.code;
  let level: Level;
  let title: string;
  if (!e.affectsAirlines) {
    level = "info";
    title = `General aviation restriction at ${code}`;
  } else if (e.kind === "ground_stop") {
    level = daysOut === 0 ? "rebook" : "watch";
    title = `Ground stop at ${code}`;
  } else if (e.kind === "ground_delay") {
    const avg = parseMinutes(e.details.match(/average delay: ([^,]+)/)?.[1] ?? "");
    level = daysOut === 0 && (avg ?? 60) >= 60 ? "rebook" : "watch";
    title = `Ground delay program at ${code}`;
  } else if (e.kind === "closure") {
    level = daysOut === 0 ? "rebook" : "watch";
    title = `Airport closure at ${code}`;
  } else {
    level = "watch";
    const dir = e.details.match(/type: (\w+)/i)?.[1];
    title = `${dir ? `${dir} delays` : "Delays"} at ${code}`;
  }
  const tomorrowNote = daysOut === 1 && level !== "info" ? " Active now; FAA programs are same-day, so this only matters if it carries into tomorrow." : "";
  add({
    source: "faa",
    airport: code,
    level,
    title,
    detail: `Reason: ${e.reason}.${e.details ? ` ${e.details[0].toUpperCase()}${e.details.slice(1)}.` : ""}${tomorrowNote}`,
    url: FAA_PUBLIC_PAGE,
  });
}

/** Returns true if any flight-relevant hazard was found. */
function addForecastSignals(add: Add, periods: HourlyPeriod[], stop: Stop): boolean {
  const a = stop.airport;
  const pop = (p: HourlyPeriod) => p.probabilityOfPrecipitation?.value ?? 0;
  const span = (ps: HourlyPeriod[]) => `${localHourLabel(ps[0].startTime)} to ${localHourLabel(ps[ps.length - 1].endTime)}`;
  const hazards: { name: string; match: (p: HourlyPeriod) => boolean; minPop: number }[] = [
    { name: "Thunderstorms", match: (p) => /thunder|t-storm/i.test(p.shortForecast), minPop: 30 },
    { name: "Snow or ice", match: (p) => /snow|sleet|freezing|ice|blizzard|wintry/i.test(p.shortForecast), minPop: 30 },
    { name: "Fog", match: (p) => /fog/i.test(p.shortForecast), minPop: 0 },
    { name: "Strong wind", match: (p) => maxMph(p.windSpeed) >= 30, minPop: 0 },
  ];
  let found = false;
  for (const h of hazards) {
    const hits = periods.filter(h.match);
    if (!hits.length) continue;
    const maxPop = Math.max(...hits.map(pop));
    const significant = maxPop >= h.minPop;
    found ||= significant;
    add({
      source: "nws_forecast",
      airport: a.code,
      level: significant ? "watch" : "info",
      title: `${h.name} forecast at ${a.code} (${ROLE_LABEL[stop.role]})`,
      detail: `${hits.length} of ${periods.length} hours in the window, ${span(hits)} local.${h.minPop ? ` Chance of precipitation up to ${maxPop}%.` : ""} Peak wind ${Math.max(...hits.map((p) => maxMph(p.windSpeed)))} mph. Forecast: "${hits[0].shortForecast}".`,
      url: forecastPageUrl(a),
      validFrom: hits[0].startTime,
      validTo: hits[hits.length - 1].endTime,
    });
  }
  if (!found) {
    const temps = periods.map((p) => p.temperature);
    const counts = new Map<string, number>();
    periods.forEach((p) => counts.set(p.shortForecast, (counts.get(p.shortForecast) ?? 0) + 1));
    const typical = [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0];
    add({
      source: "nws_forecast",
      airport: a.code,
      level: "info",
      title: `No flight-impacting weather forecast at ${a.code} (${ROLE_LABEL[stop.role]})`,
      detail: `Mostly "${typical}", ${Math.min(...temps)} to ${Math.max(...temps)}°${periods[0].temperatureUnit}, peak wind ${Math.max(...periods.map((p) => maxMph(p.windSpeed)))} mph, max precipitation chance ${Math.max(...periods.map(pop))}%.`,
      url: forecastPageUrl(a),
      validFrom: periods[0].startTime,
      validTo: periods[periods.length - 1].endTime,
    });
  }
  return found;
}

function addTafSignals(add: Add, fcsts: TafForecast[], stop: Stop, raw: string): boolean {
  const a = stop.airport;
  const issues: string[] = [];
  for (const f of fcsts) {
    const q = f.fcstChange === "TEMPO" ? " (temporary)" : f.fcstChange === "PROB" ? ` (${f.probability}% chance)` : "";
    const when = `${formatLocal(f.timeFrom * 1000, a.tz)}`;
    const wx = f.wxString ?? "";
    if (/TS/.test(wx)) issues.push(`thunderstorms${q} from ${when}`);
    if (/(SN|PL|FZ|GR)/.test(wx)) issues.push(`snow, ice pellets, or freezing precipitation${q} from ${when}`);
    const vis = visibilityMiles(f.visib);
    const ceil = ceilingFt(f);
    if (vis < 3 || (ceil != null && ceil < 1000)) issues.push(`low ceilings/visibility (vis ${vis} mi${ceil != null ? `, ceiling ${ceil} ft` : ""})${q} from ${when}`);
    if ((f.wgst ?? 0) >= 35) issues.push(`gusts to ${f.wgst} kt${q} from ${when}`);
  }
  const unique = [...new Set(issues)];
  add({
    source: "taf",
    airport: a.code,
    level: unique.length ? "watch" : "info",
    title: unique.length ? `Aviation forecast (TAF) flags hazards at ${a.code}` : `Aviation forecast (TAF) is clear at ${a.code}`,
    detail: unique.length ? `${unique.slice(0, 4).join("; ")}. Raw: ${raw}` : `No thunderstorms, low ceilings, or strong gusts forecast during the window. Raw: ${raw}`,
    url: tafPageUrl(a.code),
  });
  return unique.length > 0;
}

function ruleActions(
  trip: TripInput,
  verdict: Verdict,
  signals: Signal[],
  stops: Stop[],
  alternates: AlternateAirport[],
  daysOut: number,
  confidence: Assessment["confidence"],
): { text: string; signalIds: string[] }[] {
  const actions: { text: string; signalIds: string[] }[] = [];
  const recheck =
    daysOut === 0 ? "2 to 3 hours before departure" : daysOut <= 2 ? "the evening before and the morning of travel" : "once the trip is within 48 hours, when airport-specific forecasts become available";

  const faaRebook = signals.filter((s) => s.source === "faa" && s.level === "rebook");
  for (const s of faaRebook) {
    const clear = alternates.filter((a) => a.forAirport === s.airport && a.faaClear);
    actions.push({
      text: clear.length
        ? `Rebook through ${clear.map((c) => c.code).join(" or ")} instead of ${s.airport}; ${clear.length > 1 ? "they have" : "it has"} no active FAA programs right now.`
        : `Move the trip to a later flight or another day; check whether the airline has posted a travel waiver for ${s.airport}, which allows free changes.`,
      signalIds: [s.id],
    });
  }
  const wxRebook = signals.filter((s) => s.source === "nws_alerts" && s.level === "rebook");
  if (wxRebook.length) {
    actions.push({
      text: `Move the trip to another day. Nearby airports share the same weather, so switching airports won't help. Check the airline for a weather waiver.`,
      signalIds: wxRebook.map((s) => s.id),
    });
  }
  const via = stops.find((s) => s.role === "via");
  const viaIssues = via ? signals.filter((s) => s.airport === via.airport.code && s.level !== "info" && s.source !== "bts") : [];
  if (via && viaIssues.length) {
    actions.push({ text: `Ask for a nonstop or a connection through a different hub than ${via.airport.code}.`, signalIds: viaIssues.map((s) => s.id) });
  }
  const originStorms = signals.filter((s) => s.airport === stops[0].airport.code && s.level === "watch" && /thunder/i.test(s.title + s.detail));
  if (originStorms.length && trip.window !== "morning") {
    actions.push({ text: "Thunderstorms usually build in the afternoon. If the schedule allows, a morning departure lowers the exposure.", signalIds: originStorms.map((s) => s.id) });
  }
  if (verdict === "watch") {
    actions.push({ text: `Keep the booking for now. Turn on the airline's flight alerts and recheck ${recheck}.`, signalIds: signals.filter((s) => s.level === "watch").map((s) => s.id) });
  }
  if (verdict === "go") {
    actions.push({ text: `No action needed. Recheck ${recheck}.`, signalIds: [] });
  }
  if (confidence === "low" && daysOut > FORECAST_HORIZON_DAYS) {
    actions.push({ text: `Run this check again on or after ${addDays(trip.date, -FORECAST_HORIZON_DAYS)}, when real forecasts cover the trip date.`, signalIds: [] });
  }
  return actions;
}
