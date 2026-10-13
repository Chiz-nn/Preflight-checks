import { afterEach, describe, expect, it, vi } from "vitest";
import { explain } from "@/lib/explain";
import type { Assessment } from "@/lib/types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function assessment(id: string): Assessment {
  return {
    trip: { origin: "SFO", dest: "IAD", via: "ORD", date: "2026-10-14", window: "afternoon" },
    daysOut: 1,
    verdict: "watch",
    confidence: "medium",
    confidenceReasons: ["The trip is tomorrow."],
    signals: [{ id, source: "nws_forecast", airport: "ORD", level: "watch", title: "Thunderstorms forecast at ORD (connection)", detail: "Up to 70%.", url: "https://forecast.weather.gov" }],
    checks: [],
    baselines: [],
    alternates: [],
    ruleActions: [{ text: "Keep the booking for now.", signalIds: [id] }],
    generatedAt: "2026-10-13T15:00:00Z",
  };
}

function gemini(payload: object | null, status = 200) {
  const spy = vi.fn(async () =>
    payload
      ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status })
      : new Response("overloaded", { status }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("AI briefing guardrails", () => {
  it("falls back to a rule-based briefing when no API key is set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const e = await explain(assessment("nws_forecast-ord-1"));
    expect(e.generatedBy).toBe("rules");
    expect(e.fallbackReason).toMatch(/GEMINI_API_KEY/);
  });

  it("keeps the rules' verdict in the headline and drops citations to evidence that doesn't exist", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    gemini({
      headline: "Storms at the Chicago connection",
      summary: "Storms likely at ORD.",
      confidenceExplanation: "Tomorrow, sources agree.",
      actions: [{ text: "Watch the ORD connection.", signalIds: ["nws_forecast-ord-2", "made-up-id"] }],
    });
    const e = await explain(assessment("nws_forecast-ord-2"));
    expect(e.generatedBy).toBe("gemini");
    expect(e.headline).toBe("Watch: Storms at the Chicago connection");
    expect(e.actions[0].signalIds).toEqual(["nws_forecast-ord-2"]);
  });

  it("tries the next model, then falls back to rules if every model fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const spy = gemini(null, 503);
    const e = await explain(assessment("nws_forecast-ord-3"));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(e.generatedBy).toBe("rules");
    expect(e.actions).toEqual(assessment("nws_forecast-ord-3").ruleActions);
  });
});
