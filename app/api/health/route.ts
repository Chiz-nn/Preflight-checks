import { NextResponse } from "next/server";
import { getAirport } from "@/lib/airports";
import { errorMessage } from "@/lib/http";
import { getFaaFeed } from "@/lib/sources/faa";
import { getActiveAlerts, getHourlyForecast } from "@/lib/sources/nws";
import { getTaf } from "@/lib/sources/taf";
import { loadBaseline } from "@/lib/sources/bts";

export const dynamic = "force-dynamic";

/** GET /api/health: one live call to each source so you can confirm everything works before a demo. */
export async function GET() {
  const dfw = getAirport("DFW")!;
  const probe = async (name: string, fn: () => Promise<string>) => {
    const t = Date.now();
    try {
      return { name, ok: true, detail: await fn(), ms: Date.now() - t };
    } catch (e) {
      return { name, ok: false, detail: errorMessage(e), ms: Date.now() - t };
    }
  };
  const results = await Promise.all([
    probe("FAA NAS status", async () => `${(await getFaaFeed()).events.length} active events`),
    probe("NWS hourly forecast (DFW)", async () => `${(await getHourlyForecast(dfw)).length} hourly periods`),
    probe("NWS alerts (DFW)", async () => `${(await getActiveAlerts(dfw)).length} active alerts`),
    probe("AviationWeather TAF (KDFW)", async () => ((await getTaf("DFW"))?.rawTAF.slice(0, 60) ?? "no TAF") + "..."),
    probe("BTS baseline file", async () => {
      const b = loadBaseline();
      if (!b) throw new Error("data/baseline.json missing; run python3 scripts/build_baseline.py");
      return `${Object.keys(b.routes).length} routes, ${b.period}`;
    }),
    probe("Gemini", async () => {
      if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
      const model = (process.env.GEMINI_MODEL ?? "gemini-flash-latest").split(",")[0].trim();
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with the word ok." }] }] }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`${model}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      return `${model} responded`;
    }),
  ]);
  return NextResponse.json({ ok: results.every((r) => r.ok), results });
}
