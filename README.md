# Preflight Checks

A travel disruption desk for operations teams. Pick a trip, get one call (**Go**, **Watch**, or **Rebook**), a confidence level, the evidence behind it, and what to do next.

## The problem

When an employee is flying, an ops coordinator has to check the FAA status page, the weather forecast at three airports, the aviation forecast, and their own sense of whether that route is usually a mess. Nobody does all of that for every trip. This puts it in one place and makes the call.

## What it does

- **Roster view**: every upcoming trip, checked live, with a verdict and confidence badge. Seeded with 10 travelers spread from today to two weeks out.
- **Trip report**: the verdict, an AI-written briefing, recommended actions that cite the evidence they rely on, evidence cards grouped by airport (departure, connection, arrival), a route-history comparison, nearby airport status, and a log of which checks ran, which were skipped, and why.
- **Connections**: add a connecting airport. Hub weather is often the real risk.
- **Nearby airports**: for NYC, DC, Chicago, Dallas, Houston, Bay Area, LA, and South Florida, it checks whether the other airports in the metro are clear of FAA programs.

## Data sources (all free, no keys except Gemini)

| Source | What it gives | Used when |
|---|---|---|
| [FAA NAS Status](https://nasstatus.faa.gov/) | Live ground stops, ground delay programs, delays, closures | Trip is today or tomorrow |
| [NWS API](https://www.weather.gov/documentation/services-web-api) hourly forecast | Thunderstorms, snow/ice, fog, wind for the exact departure window | Trip within 7 days |
| [NWS API](https://www.weather.gov/documentation/services-web-api) active alerts | Warnings, watches, advisories for each airport's location | Trip within 7 days |
| [AviationWeather.gov TAFs](https://aviationweather.gov/data/api/) | Airport forecasts used by pilots and dispatchers (ceilings, visibility, gusts, storms) | Trip within ~30 hours |
| [BTS On-Time Performance](https://www.transtats.bts.gov/) | Share of flights late, cancelled, or diverted, by route and month | Always (the "normal day" baseline) |
| [Google Gemini](https://ai.google.dev/) | Writes the briefing | Trip report only |

## How a verdict is made

1. **Collect** every source that applies to the trip's date. Each finding becomes a *signal* with a level: `rebook`, `watch`, or `info`.
2. **Verdict = the worst signal.** Any rebook-level signal makes the trip Rebook. Any watch-level signal makes it Watch. Otherwise Go.
3. **Confidence** comes from how far out the trip is and whether data is missing or disagrees, never from the AI.
4. **Gemini explains** the verdict in plain English and cites signal IDs. It can't change the verdict or confidence, and citations to signals that don't exist are dropped. If Gemini fails, a rule-based briefing is shown instead.

Rules live in [`lib/assess.ts`](lib/assess.ts). The reasoning behind each choice is in [DECISIONS.md](DECISIONS.md).

## Run it

Requires Node 20+ and Python 3.

```bash
npm install
cp .env.example .env.local        # then paste your Gemini key into .env.local
python3 scripts/build_baseline.py --months 10,11,12   # BTS history, ~2 to 5 min
npm run dev
```

Open http://localhost:3000. To confirm every source is reachable, open http://localhost:3000/api/health.

`build_baseline.py` downloads the monthly BTS files (~30 MB each), keeps only routes between the airports in `data/airports.json`, and writes `data/baseline.json`. Run it without `--months` for the full year.

## Project layout

```
app/                 pages and API routes (/api/assess, /api/health)
components/          roster, trip form, trip report
lib/assess.ts        rules engine: signals, verdict, confidence, actions
lib/explain.ts       Gemini briefing + guardrails + fallback
lib/sources/         one client per data source
data/airports.json   43 airports, metro groupings
data/roster.ts       seeded travelers
scripts/             BTS baseline builder
```

## Before real users

See the last section of [DECISIONS.md](DECISIONS.md).
