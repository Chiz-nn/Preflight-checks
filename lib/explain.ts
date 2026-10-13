import { getAirport } from "./airports";
import { errorMessage } from "./http";
import { formatDate, WINDOWS } from "./time";
import type { Assessment, Explanation } from "./types";

/**
 * The LLM's job is narrow on purpose: turn the evidence the rules engine already
 * gathered into a plain-English briefing. It never sets the verdict or the
 * confidence; it explains them. Every action it writes must cite signal IDs
 * that exist, or the citation is dropped. If Gemini is unavailable, a
 * template-based explanation is used so the demo never breaks.
 */

const MODELS = (process.env.GEMINI_MODEL ?? "gemini-flash-latest,gemini-2.5-flash,gemini-flash-lite-latest")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const cache = new Map<string, { expires: number; value: Explanation }>();

function routeText(a: Assessment): string {
  const { trip } = a;
  const name = (c: string) => `${getAirport(c)?.city.split(",")[0]} (${c})`;
  return `${name(trip.origin)} to ${name(trip.dest)}${trip.via ? ` via ${name(trip.via)}` : ""}`;
}

export function ruleExplanation(a: Assessment, fallbackReason?: string): Explanation {
  const drivers = a.signals.filter((s) => s.level === a.verdict || (a.verdict === "go" && s.level === "info"));
  const headline =
    a.verdict === "rebook"
      ? `Rebook: ${drivers[0]?.title ?? "serious disruption expected"}`
      : a.verdict === "watch"
        ? `Watch: ${drivers.slice(0, 2).map((s) => s.title).join("; ")}`
        : "Go: nothing in the data points to a disruption";
  const counts = (["rebook", "watch", "info"] as const).map((l) => `${a.signals.filter((s) => s.level === l).length} ${l}`).join(", ");
  return {
    headline,
    summary: `${routeText(a)} on ${formatDate(a.trip.date)}, ${WINDOWS[a.trip.window].label.toLowerCase()}. The rules engine found ${counts} signal(s) across FAA, NWS, aviation forecasts, and BTS history. ${drivers
      .filter((s) => s.level !== "info")
      .slice(0, 3)
      .map((s) => s.detail)
      .join(" ")}`.trim(),
    confidenceExplanation: a.confidenceReasons.join(" "),
    actions: a.ruleActions,
    generatedBy: "rules",
    fallbackReason,
  };
}

function buildPrompt(a: Assessment): string {
  const evidence = a.signals.map((s) => ({ id: s.id, source: s.source, airport: s.airport, level: s.level, title: s.title, detail: s.detail, validFrom: s.validFrom, validTo: s.validTo }));
  const failed = a.checks.filter((c) => c.status !== "ok").map((c) => `${c.source}${c.airport ? `@${c.airport}` : ""}: ${c.status} (${c.note})`);
  return `You are a travel-risk analyst writing for a corporate operations coordinator who manages employee trips. Be concrete and brief. No hype, no filler.

TRIP: ${routeText(a)} on ${a.trip.date} (${a.daysOut} day(s) from today), departure window: ${WINDOWS[a.trip.window].label}.

DECIDED BY RULES (do not change these): verdict = ${a.verdict.toUpperCase()}, confidence = ${a.confidence.toUpperCase()}.
Why the confidence is ${a.confidence}: ${a.confidenceReasons.join(" ")}

EVIDENCE (each item has an id you must cite):
${JSON.stringify(evidence, null, 1)}

HISTORICAL BASELINE: ${JSON.stringify(a.baselines)}
NEARBY AIRPORTS (FAA status right now): ${JSON.stringify(a.alternates)}
CHECKS THAT DID NOT RUN OR FAILED: ${failed.length ? failed.join("; ") : "none"}
RULE-SUGGESTED ACTIONS: ${JSON.stringify(a.ruleActions)}

Write JSON with exactly these keys:
- "headline": one sentence, under 15 words, that leads with the verdict word (Go, Watch, or Rebook) and names the main risk or says there is none.
- "summary": 2 to 4 sentences. Say what the risk is, where (which airport and leg), and when. Compare to the historical baseline when one exists (is this trip worse or better than a typical day on this route?). Mention any missing data that matters.
- "confidenceExplanation": 1 to 2 sentences in plain language explaining why confidence is ${a.confidence}, using the reasons given. Do not invent a percentage.
- "actions": 1 to 4 objects {"text": string, "signalIds": string[]}. Specific steps the coordinator can take. Start from the rule-suggested actions; you may merge, reorder, or sharpen them, but don't add advice the evidence doesn't support. signalIds must come from the evidence ids above.

Only use facts from the evidence. If the evidence is thin, say so.`;
}

async function callGemini(model: string, prompt: string, key: string): Promise<Omit<Explanation, "generatedBy" | "model">> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${model}: HTTP ${res.status} ${body.slice(0, 160)}`);
  }
  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (!text) throw new Error(`${model}: empty response`);
  const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  if (typeof parsed.headline !== "string" || typeof parsed.summary !== "string") throw new Error(`${model}: response missing fields`);
  return {
    headline: parsed.headline,
    summary: parsed.summary,
    confidenceExplanation: String(parsed.confidenceExplanation ?? ""),
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
  };
}

export async function explain(a: Assessment): Promise<Explanation> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return ruleExplanation(a, "GEMINI_API_KEY is not set");

  const cacheKey = JSON.stringify([a.trip, a.verdict, a.confidence, a.signals.map((s) => s.id + s.detail)]);
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;

  const prompt = buildPrompt(a);
  const validIds = new Set(a.signals.map((s) => s.id));
  const errors: string[] = [];
  for (const model of MODELS) {
    try {
      const out = await callGemini(model, prompt, key);
      // Guardrails: keep the verdict word honest and drop citations to evidence that doesn't exist.
      const verdictWord = { go: "Go", watch: "Watch", rebook: "Rebook" }[a.verdict];
      const headline = out.headline.toLowerCase().startsWith(verdictWord.toLowerCase())
        ? verdictWord + out.headline.slice(verdictWord.length)
        : `${verdictWord}: ${out.headline}`;
      const actions = out.actions
        .filter((x) => x && typeof x.text === "string")
        .slice(0, 4)
        .map((x) => ({ text: x.text, signalIds: (Array.isArray(x.signalIds) ? x.signalIds : []).filter((id: string) => validIds.has(id)) }));
      const value: Explanation = {
        headline,
        summary: out.summary,
        confidenceExplanation: out.confidenceExplanation || a.confidenceReasons.join(" "),
        actions: actions.length ? actions : a.ruleActions,
        generatedBy: "gemini",
        model,
      };
      cache.set(cacheKey, { expires: Date.now() + 10 * 60_000, value });
      return value;
    } catch (e) {
      errors.push(errorMessage(e));
    }
  }
  console.warn("[explain] Gemini unavailable, using rules:", errors.join(" | "));
  return ruleExplanation(a, `Gemini unavailable (${errors[0] ?? "unknown error"})`);
}
