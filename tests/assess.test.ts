import { afterEach, describe, expect, it } from "vitest";
import { assess, InputError, validateTrip } from "@/lib/assess";
import { alert, faaXml, resetWorld, taf, TODAY, TOMORROW, useWorld } from "./helpers";

afterEach(resetWorld);

const GROUND_STOP_JFK = `<Delay_type><Name>Ground Stop Programs</Name><Ground_Stop_List><Program><ARPT>JFK</ARPT><Reason>thunderstorms</Reason><End_Time>4:00 pm EDT</End_Time></Program></Ground_Stop_List></Delay_type>`;
const gdp = (code: string, avg: string) =>
  `<Delay_type><Name>Ground Delay Programs</Name><Ground_Delay_List><Ground_Delay><ARPT>${code}</ARPT><Reason>low ceilings</Reason><Avg>${avg}</Avg><Max>3 hours and 2 minutes</Max></Ground_Delay></Ground_Delay_List></Delay_type>`;
const GA_CLOSURE_SFO = `<Delay_type><Name>Airport Closures</Name><Airport_Closure_List><Airport><ARPT>SFO</ARPT><Reason>!SFO 10/001 SFO AD AP CLSD TO NON SKED TRANSIENT GA ACFT EXC PPR</Reason><Start>Oct 01 at 00:00 UTC.</Start><Reopen>Jan 01 at 08:00 UTC.</Reopen></Airport></Airport_Closure_List></Delay_type>`;

describe("FAA airport programs", () => {
  it("a ground stop at the departure airport today means Rebook, and suggests a clear nearby airport", async () => {
    useWorld({ faa: faaXml(GROUND_STOP_JFK) });
    const a = await assess({ origin: "JFK", dest: "SFO", date: TODAY, window: "any" });
    expect(a.verdict).toBe("rebook");
    expect(a.signals[0]).toMatchObject({ source: "faa", airport: "JFK", level: "rebook", title: "Ground stop at JFK" });
    expect(a.alternates.filter((x) => x.forAirport === "JFK" && x.faaClear).map((x) => x.code)).toEqual(["LGA", "EWR"]);
    expect(a.ruleActions[0].text).toMatch(/Rebook through LGA or EWR/);
  });

  it("a long ground delay program is only Watch when the trip is tomorrow (it may not carry over)", async () => {
    useWorld({ faa: faaXml(gdp("JFK", "1 hour and 15 minutes")) });
    const a = await assess({ origin: "JFK", dest: "SFO", date: TOMORROW, window: "morning" });
    expect(a.verdict).toBe("watch");
    expect(a.signals.find((s) => s.source === "faa")?.detail).toMatch(/only matters if it carries into tomorrow/);
  });

  it("a short ground delay program today is Watch, not Rebook", async () => {
    useWorld({ faa: faaXml(gdp("JFK", "30 minutes")) });
    const a = await assess({ origin: "JFK", dest: "SFO", date: TODAY, window: "any" });
    expect(a.verdict).toBe("watch");
  });

  it("ignores closures that only restrict general aviation", async () => {
    useWorld({ faa: faaXml(GA_CLOSURE_SFO) });
    const a = await assess({ origin: "JFK", dest: "SFO", date: TODAY, window: "any" });
    expect(a.verdict).toBe("go");
    expect(a.signals.find((s) => s.source === "faa")).toMatchObject({ airport: "SFO", level: "info", title: "General aviation restriction at SFO" });
  });
});

describe("NWS forecast and alerts", () => {
  // JFK is UTC-4 in October: afternoon (noon to 5pm local) is 16:00 to 21:00 UTC.
  const afternoonStorms = { JFK: [{ date: "2026-10-15", fromHour: 17, toHour: 20, shortForecast: "Showers And Thunderstorms Likely", pop: 60 }] };

  it("thunderstorms forecast during the departure window means Watch", async () => {
    useWorld({ hourly: afternoonStorms });
    const a = await assess({ origin: "JFK", dest: "SFO", date: "2026-10-15", window: "afternoon" });
    expect(a.verdict).toBe("watch");
    expect(a.signals[0]).toMatchObject({ source: "nws_forecast", airport: "JFK", level: "watch" });
    expect(a.ruleActions.map((x) => x.text).join(" ")).toMatch(/morning departure lowers the exposure/);
  });

  it("the same storms don't count against a morning departure", async () => {
    useWorld({ hourly: afternoonStorms });
    const a = await assess({ origin: "JFK", dest: "SFO", date: "2026-10-15", window: "morning" });
    expect(a.verdict).toBe("go");
  });

  it("a slight chance of storms (under 30%) is context, not a risk", async () => {
    useWorld({ hourly: { JFK: [{ date: "2026-10-15", fromHour: 17, toHour: 20, shortForecast: "Slight Chance Thunderstorms", pop: 20 }] } });
    const a = await assess({ origin: "JFK", dest: "SFO", date: "2026-10-15", window: "afternoon" });
    expect(a.verdict).toBe("go");
  });

  it("a flight-impacting NWS warning during the trip means Rebook, and says switching airports won't help", async () => {
    useWorld({ alerts: { ORD: [alert("Winter Storm Warning", "2026-10-15T06:00:00Z", "2026-10-16T00:00:00Z")] } });
    const a = await assess({ origin: "ORD", dest: "DEN", date: "2026-10-15", window: "any" });
    expect(a.verdict).toBe("rebook");
    expect(a.ruleActions.map((x) => x.text).join(" ")).toMatch(/Nearby airports share the same weather/);
  });

  it("alerts that don't affect flying (a heat advisory) are context only", async () => {
    useWorld({ alerts: { ORD: [alert("Heat Advisory", "2026-10-15T06:00:00Z", "2026-10-16T00:00:00Z", "Moderate")] } });
    const a = await assess({ origin: "ORD", dest: "DEN", date: "2026-10-15", window: "any" });
    expect(a.verdict).toBe("go");
  });

  it("storms at the connecting hub suggest a nonstop or a different hub", async () => {
    // ORD is UTC-5: a connection after an afternoon departure is checked 17:00 to 05:00 UTC.
    useWorld({ hourly: { ORD: [{ date: "2026-10-15", fromHour: 20, toHour: 23, shortForecast: "Thunderstorms Likely", pop: 70 }] } });
    const a = await assess({ origin: "SFO", dest: "IAD", via: "ORD", date: "2026-10-15", window: "afternoon" });
    expect(a.verdict).toBe("watch");
    expect(a.ruleActions[0].text).toMatch(/different hub than ORD/);
  });
});

describe("Confidence", () => {
  it("is low past the 7-day forecast range, and no live sources are called", async () => {
    const fetchSpy = useWorld({});
    const a = await assess({ origin: "JFK", dest: "SFO", date: "2026-10-23", window: "any" });
    expect(a.confidence).toBe("low");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(a.checks.filter((c) => c.source !== "bts").every((c) => c.status === "skipped")).toBe(true);
    expect(a.signals.some((s) => s.source === "bts")).toBe(true);
  });

  it("is high for tomorrow when every source answers and agrees", async () => {
    useWorld({ taf: { JFK: taf("JFK"), SFO: taf("SFO") } });
    const a = await assess({ origin: "JFK", dest: "SFO", date: TOMORROW, window: "morning" });
    expect(a.verdict).toBe("go");
    expect(a.confidence).toBe("high");
  });

  it("drops a level when one source fails, but still gives a verdict", async () => {
    useWorld({ taf: { JFK: taf("JFK") }, fail: ["ids=KSFO"] });
    const a = await assess({ origin: "JFK", dest: "SFO", date: TOMORROW, window: "morning" });
    expect(a.confidence).toBe("medium");
    expect(a.checks.find((c) => c.source === "taf" && c.airport === "SFO")?.status).toBe("error");
    expect(a.verdict).toBe("go");
  });

  it("drops to medium when the aviation forecast and the NWS forecast disagree", async () => {
    // ORD afternoon tomorrow is 17:00 to 22:00 UTC on Oct 14, i.e. hours 41 to 46 after Oct 13 00:00 UTC.
    useWorld({ taf: { ORD: taf("ORD", { fromHourUtc: 41, toHourUtc: 44, wxString: "TSRA", ceiling: 900 }) } });
    const a = await assess({ origin: "ORD", dest: "DEN", date: TOMORROW, window: "afternoon" });
    expect(a.verdict).toBe("watch");
    expect(a.confidence).toBe("medium");
    expect(a.confidenceReasons.join(" ")).toMatch(/At ORD, the NWS forecast and the aviation forecast \(TAF\) disagree/);
  });
});

describe("Input validation", () => {
  it("rejects bad routes and dates", () => {
    expect(() => validateTrip({ origin: "JFK", dest: "JFK", date: TOMORROW })).toThrow(InputError);
    expect(() => validateTrip({ origin: "XXX", dest: "SFO", date: TOMORROW })).toThrow(/Unknown origin/);
    expect(() => validateTrip({ origin: "JFK", dest: "SFO", via: "SFO", date: TOMORROW })).toThrow(/Connection must differ/);
  });

  it("rejects dates in the past", async () => {
    useWorld({});
    await expect(assess({ origin: "JFK", dest: "SFO", date: "2026-10-10", window: "any" })).rejects.toThrow(/past/);
  });
});
