# Decisions

Each choice below, why I made it, and what I gave up. These are the calls I'd expect to defend.

## Scope

**The user is an ops coordinator, not the traveler.** The brief says the Operations team wants one place to look. So the home screen is a roster of everyone's upcoming trips, not a single search box. Checking one trip is still there, on the side.

**Flights only.** Driving needs a different data set (road conditions, routing) and would split a three-hour build in half. It's the obvious next step.

**43 airports.** The busiest U.S. airports plus their metro neighbors (LGA and EWR next to JFK, MDW next to ORD, and so on). That covers almost every business route and lets me hardcode metro groupings for the nearby-airport check.

**No login.** The roster is seeded data and the header says "Operations Admin". Real auth and role-based access are a day of work that doesn't change what this prototype is trying to show.

## Data

**Each source only speaks when it's actually informative for that date.**

| Source | Horizon | Why |
|---|---|---|
| FAA NAS status | today, tomorrow | Ground stops and delay programs are same-day decisions. A ground delay at BOS right now says nothing about next Thursday. |
| TAF | ~30 hours | That's how far out TAFs are issued. |
| NWS hourly forecast + alerts | 7 days | Past a week, forecasts aren't specific enough to act on. |
| BTS history | always | It's the only thing that exists 2 weeks out. |

The UI shows which checks ran and which were skipped, with the reason, so "no signal" never gets confused with "didn't look."

**History is context, not evidence, once a forecast exists.** If a route is historically bad in December, that drives a Watch only when the trip is past the forecast range. Inside 7 days the live data decides, and history appears as "worse or better than a normal day on this route." Otherwise routes like EWR to ORD would be on permanent Watch and people would stop reading the badge.

**BTS is preprocessed once, not queried live.** BTS has no API, just monthly files of ~600k flights each. A Python script reduces a month to route-level counts (flights, disrupted, cancelled) for the airports I support, and the app reads the JSON. "Disrupted" means arrived 15+ minutes late, cancelled, or diverted, which matches the BTS on-time definition.

**The departure window narrows the forecast.** Morning, afternoon, evening, or any. Afternoon thunderstorms are a real pattern at DFW, ATL, and in Florida, so a 7am flight and a 4pm flight on the same day can get different calls. Connections and arrivals use the window start through midnight, since I don't know the exact arrival time.

**Closures that only restrict general aviation are ignored.** The FAA feed lists NOTAMs like "closed to non-scheduled transient GA aircraft" that don't affect airline passengers. Those show as context, not risk.

## Rules and AI

**The verdict is the worst signal, not a weighted score.** One active ground stop is enough to rebook, no matter how sunny the other airports are. A weighted score would need weights I'd have to make up, and it's harder to explain why a trip scored 62.

The rules, in short:

- **Rebook**: ground stop or airport closure today; ground delay program today averaging an hour or more; an NWS *warning* that matters for flying (winter storm, hurricane, severe thunderstorm, high wind, and similar) overlapping the trip.
- **Watch**: forecast thunderstorms, snow/ice, fog, or strong wind in the window; a TAF showing storms, low ceilings, low visibility, or strong gusts; an NWS advisory or watch; any FAA program for tomorrow (it may carry over); historically rough route when there's no forecast.
- **Go**: none of the above.

**A forecast alone can't make a trip Rebook.** Only FAA programs and official NWS warnings can. Forecasts are probabilistic, and telling someone to rebook on a 50% chance of storms costs money and trust.

**Confidence is computed, not generated.** LLM confidence numbers aren't calibrated, and asking twice gets two answers. Confidence comes from three things:

- **High**: trip within 2 days, all live checks succeeded, sources agree.
- **Medium**: 3 to 7 days out, or one check failed, or the NWS forecast and TAF disagree about hazards at the same airport.
- **Low**: past 7 days (history only), part of the window is beyond the forecast, or two or more checks failed.

**Gemini explains; it doesn't decide.** It gets the trip, the verdict, the confidence reasons, and every signal with an ID. It writes a headline, a short summary, a plain-language confidence explanation, and up to four actions that must cite signal IDs. Guardrails in code:

- The headline must start with the verdict word, or it gets prefixed.
- Citations to IDs that don't exist are dropped.
- Temperature 0.2 and JSON output mode.
- If every model in the list fails, the page shows a rule-based briefing and says so. The demo can't break on a rate limit.

The roster skips the AI call (`explain=0`). Ten trips times one LLM call each would hit the free tier's per-minute limit, and a badge doesn't need prose.

**Why Gemini.** The brief says don't pay for anything. Gemini's free tier through Google AI Studio needs no card. The tradeoff is that Google can use free-tier prompts to improve its models. That's fine for public weather data; it would not be fine with real employee names and itineraries (see below).

## Engineering

- **Next.js + TypeScript**, one repo, API routes for the server side. Nothing to deploy separately.
- **In-memory cache with TTLs** per source (FAA 2 min, alerts 5 min, TAF 10 min, hourly forecast 15 min, NWS grid lookup 24 h) so the roster doesn't hit the same endpoint ten times.
- **Every fetch has a timeout**, and one failed source degrades confidence instead of failing the whole check.
- **`/api/health`** makes one live call to every source, so I can confirm everything works before a demo.

## What I'd change before real users

1. **Real data in, private data protected.** Pull trips from the booking system (Navan, Concur) instead of a seed file. Move from Gemini's free tier to a paid tier or a provider with a no-training agreement, because prompts would contain employee names and travel plans.
2. **Auth and roles.** SSO, an admin role that sees everyone, travelers who see only their own trips.
3. **Flight-level data.** Right now I check airports, not flights. A paid flight-status API (FlightAware, Cirium) would add the actual flight number, inbound aircraft delays, and the airline's own cancellations.
4. **Push, don't pull.** Run checks on a schedule and alert the coordinator when a trip changes from Go to Watch, instead of waiting for someone to open the page.
5. **Validate the rules against outcomes.** Log every verdict, then compare it to what actually happened (BTS publishes it a couple of months later). That tells me whether "Watch" trips really get disrupted more often, and lets me tune thresholds with evidence instead of judgment.
6. **Shared cache.** The in-memory cache resets on every deploy and isn't shared between server instances. Redis or similar.
7. **Tests around the rules.** The rules engine is pure enough to unit test with recorded API responses. That's the first thing I'd add.
8. **Driving.** Road weather and closures for trips under ~300 miles.
