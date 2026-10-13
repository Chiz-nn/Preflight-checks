"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAirport } from "@/lib/airports";
import { formatDate, WINDOWS } from "@/lib/time";
import type { Assessment, Level, Signal, TimeWindow } from "@/lib/types";
import { ConfidenceMeter, LEVEL_STYLE, SOURCE_LABEL, VERDICT_TEXT } from "./Badges";
import RouteArc from "./RouteArc";

interface Props {
  origin: string;
  dest: string;
  via?: string;
  date: string;
  window: string;
  traveler?: string;
}

const rank = (l: Level) => (l === "rebook" ? 2 : l === "watch" ? 1 : 0);

const VERDICT_LINE = {
  go: "Nothing in the data points to a disruption.",
  watch: "Keep the booking, but keep an eye on it.",
  rebook: "This trip is likely to be disrupted.",
};

export default function TripReport(p: Props) {
  const [a, setA] = useState<Assessment | null>(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams({ origin: p.origin, dest: p.dest, date: p.date, window: p.window });
    if (p.via) q.set("via", p.via);
    setA(null);
    setError("");
    fetch(`/api/assess?${q}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? r.statusText);
        setA(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [p.origin, p.dest, p.via, p.date, p.window]);

  const stops = [p.origin, p.via, p.dest].filter(Boolean) as string[];
  const windowLabel = WINDOWS[(p.window as TimeWindow) in WINDOWS ? (p.window as TimeWindow) : "any"].label.toLowerCase();

  const levels = a
    ? Object.fromEntries(
        stops.map((c) => {
          const worst = a.signals.filter((s) => s.airport === c && s.source !== "bts").reduce<Level>((m, s) => (rank(s.level) > rank(m) ? s.level : m), "info");
          return [c, worst];
        }),
      )
    : undefined;

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    setTimeout(() => setFlash(null), 1600);
  };

  return (
    <>
      <section className={`sky ${a ? `sky-${a.verdict}` : ""} relative overflow-hidden pb-40 pt-24 text-white transition-colors`}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-full text-sm text-white/70 transition hover:text-white">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            All trips
          </Link>
          <p className="mt-6 text-sm text-white/70">
            {p.traveler ? `${p.traveler}, ` : ""}
            {p.date ? formatDate(p.date) : ""}, {windowLabel}
            {a ? `, ${a.daysOut === 0 ? "today" : a.daysOut === 1 ? "tomorrow" : `${a.daysOut} days out`}` : ""}
          </p>
          <div className="mt-8">
            <RouteArc stops={stops} levels={levels} />
          </div>
        </div>
      </section>

      <main className="relative z-10 mx-auto -mt-24 max-w-6xl space-y-8 px-4 pb-8 sm:px-6">
        {error && (
          <div className="rounded-2xl bg-surface p-6 ring-1 ring-rebook/30" role="alert">
            <p className="font-medium text-rebook">This trip couldn&apos;t be checked</p>
            <p className="mt-1 text-sm text-ink-2">{error}. Go back and adjust the route or date.</p>
          </div>
        )}
        {!a && !error && <Loading />}
        {a && (
          <>
            <Briefing a={a} onCite={jump} />
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Evidence a={a} stops={stops} flash={flash} />
              <aside className="space-y-4 lg:sticky lg:top-6">
                <Baselines a={a} />
                <Alternates a={a} />
                <Checks a={a} />
              </aside>
            </div>
            <p className="max-w-3xl text-sm text-ink-3">
              The verdict and confidence come from fixed rules over this evidence. The AI only writes the briefing and can only cite evidence that exists. Checked{" "}
              {new Date(a.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
            </p>
          </>
        )}
      </main>
    </>
  );
}

const card = "rounded-2xl bg-surface ring-1 ring-line shadow-[0_1px_0_rgba(14,26,43,0.04),0_24px_60px_-34px_rgba(14,26,43,0.45)]";

function Loading() {
  return (
    <div className={`${card} space-y-4 p-8`}>
      <p className="text-ink-2">Checking FAA programs, forecasts, alerts and route history, then writing the briefing.</p>
      {[70, 90, 55].map((w) => (
        <div key={w} className="shimmer h-3 rounded-full" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function Briefing({ a, onCite }: { a: Assessment; onCite: (id: string) => void }) {
  const e = a.explanation;
  const color = { go: "text-go", watch: "text-watch", rebook: "text-rebook" }[a.verdict];
  const headline = e?.headline.replace(/^(go|watch|rebook)\s*[:,.-]?\s*/i, "") || VERDICT_LINE[a.verdict];
  return (
    <section className={`${card} rise overflow-hidden`}>
      <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[200px_minmax(0,1fr)]">
        <div>
          <div className={`text-5xl font-semibold tracking-[-0.04em] sm:text-6xl ${color}`}>{VERDICT_TEXT[a.verdict]}</div>
          <div className="mt-3">
            <ConfidenceMeter confidence={a.confidence} />
          </div>
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-[28px]">{headline}</h1>
          {e && <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-ink-2">{e.summary}</p>}
          {e && (
            <p className="mt-4 max-w-[68ch] rounded-xl bg-page px-4 py-3 text-sm leading-relaxed text-ink-2">
              <span className="font-medium text-ink">Why {a.confidence} confidence. </span>
              {e.confidenceExplanation}
            </p>
          )}
        </div>
      </div>

      {e && (
        <div className="border-t border-line bg-page/50 p-6 sm:p-8">
          <h2 className="font-semibold">What to do</h2>
          <ol className="mt-4 space-y-3">
            {e.actions.map((act, i) => (
              <li key={i} className="flex gap-4">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white tnum">{i + 1}</span>
                <div className="min-w-0 text-[15px] leading-relaxed">
                  {act.text}
                  {act.signalIds.length > 0 && (
                    <span className="ml-2 inline-flex flex-wrap gap-1.5 align-middle">
                      {act.signalIds.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => onCite(id)}
                          className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink-2 ring-1 ring-line transition hover:bg-ink hover:text-white hover:ring-ink"
                          title="Show this evidence"
                        >
                          {citeLabel(a, id)}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 flex items-center gap-2 text-xs text-ink-3">
            <Sparkle />
            {e.generatedBy === "gemini" ? `Briefing written by Gemini (${e.model}) from the evidence below.` : `Rule-based briefing. ${e.fallbackReason ?? ""}`}
          </p>
        </div>
      )}
    </section>
  );
}

function citeLabel(a: Assessment, id: string) {
  const s = a.signals.find((x) => x.id === id);
  if (!s) return id;
  const src = { faa: "FAA", nws_alerts: "NWS alert", nws_forecast: "Forecast", taf: "TAF", bts: "History" }[s.source];
  return `${src}, ${s.airport}`;
}

function Sparkle() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 0c.6 4.2 3.8 7.4 8 8-4.2.6-7.4 3.8-8 8-.6-4.2-3.8-7.4-8-8 4.2-.6 7.4-3.8 8-8Z" fill="currentColor" />
    </svg>
  );
}

function Evidence({ a, stops, flash }: { a: Assessment; stops: string[]; flash: string | null }) {
  const roles = ["Departure", ...(stops.length === 3 ? ["Connection"] : []), "Arrival"];
  const live = a.signals.filter((s) => s.source !== "bts");
  const history = a.signals.filter((s) => s.source === "bts");
  return (
    <section className="space-y-8">
      <h2 className="text-xl font-semibold tracking-tight">Evidence</h2>
      {stops.map((code, i) => {
        const items = live.filter((s) => s.airport === code);
        return (
          <div key={code}>
            <div className="mb-3 flex items-baseline gap-3">
              <span className="text-lg font-semibold tracking-tight">{code}</span>
              <span className="text-sm text-ink-3">
                {roles[i]}, {getAirport(code)?.name}
              </span>
            </div>
            {items.length ? (
              <div className="space-y-3">
                {items.map((s) => (
                  <SignalCard key={s.id} s={s} flash={flash === s.id} />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-ink-3">
                No live signals here{a.daysOut > 7 ? ". The trip is past the 7-day forecast range" : ""}.
              </p>
            )}
          </div>
        );
      })}
      {history.length > 0 && (
        <div>
          <div className="mb-3 text-lg font-semibold tracking-tight">Route history</div>
          <div className="space-y-3">
            {history.map((s) => (
              <SignalCard key={s.id} s={s} flash={flash === s.id} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SignalCard({ s, flash }: { s: Signal; flash: boolean }) {
  const st = LEVEL_STYLE[s.level];
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }) : "");
  return (
    <article id={s.id} data-flash={flash} className="relative scroll-mt-24 overflow-hidden rounded-2xl bg-surface p-4 pl-5 ring-1 ring-line transition-shadow duration-300">
      <span className={`absolute inset-y-0 left-0 w-1 ${st.bar}`} />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${st.chip}`}>{st.label}</span>
        <span className="text-ink-3">{SOURCE_LABEL[s.source]}</span>
      </div>
      <h3 className="mt-2 font-medium">{s.title}</h3>
      <p className="mt-1 break-words text-sm leading-relaxed text-ink-2">{s.detail}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-ink-3">
        {(s.validFrom || s.validTo) && (
          <span className="tnum">
            Valid {fmt(s.validFrom)}
            {s.validTo ? ` to ${fmt(s.validTo)}` : ""}
          </span>
        )}
        <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-sky-2 underline-offset-2 hover:underline">
          View source
        </a>
      </div>
    </article>
  );
}

const side = "rounded-2xl bg-surface p-5 ring-1 ring-line";

function Baselines({ a }: { a: Assessment }) {
  if (!a.baselines.length) return null;
  return (
    <section className={side}>
      <h2 className="font-semibold">A normal day on this route</h2>
      <p className="mt-1 text-sm text-ink-3">Flights late 15+ minutes, cancelled or diverted in this month.</p>
      <div className="mt-4 space-y-4">
        {a.baselines.map((b) => {
          const max = Math.max(b.disruptedPct, b.nationalDisruptedPct, 1) * 1.15;
          const rough = b.disruptedPct > b.nationalDisruptedPct * 1.25;
          return (
            <div key={b.leg} className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{b.leg.replace("-", " to ")}</span>
                <span className="text-ink-3 tnum">{b.flights.toLocaleString()} flights</span>
              </div>
              {[
                { label: b.scope === "route" ? "This route" : "This airport", v: b.disruptedPct, cls: rough ? "bg-watch" : "bg-sky-2" },
                { label: "U.S. average", v: b.nationalDisruptedPct, cls: "bg-line" },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 text-ink-3">{row.label}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-page">
                    <span className={`block h-1.5 rounded-full ${row.cls} transition-[width] duration-700`} style={{ width: `${(row.v / max) * 100}%` }} />
                  </span>
                  <span className="w-11 text-right font-medium tnum">{row.v}%</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-ink-3">BTS on-time data, {a.baselines[0].period}.</p>
    </section>
  );
}

function Alternates({ a }: { a: Assessment }) {
  if (!a.alternates.length) return null;
  return (
    <section className={side}>
      <h2 className="font-semibold">Nearby airports right now</h2>
      <p className="mt-1 text-sm text-ink-3">FAA status for other airports in the same metro.</p>
      <ul className="mt-3 divide-y divide-line text-sm">
        {a.alternates.map((alt) => (
          <li key={alt.code} className="flex items-center justify-between gap-2 py-2">
            <span>
              <span className="font-medium">{alt.code}</span> <span className="text-ink-3">instead of {alt.forAirport}</span>
            </span>
            <span className={`flex items-center gap-1.5 text-xs ${alt.faaClear ? "text-go" : "text-rebook"}`}>
              <span className="size-1.5 rounded-full bg-current" />
              {alt.faaClear ? "No FAA programs" : "FAA program active"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Checks({ a }: { a: Assessment }) {
  const dot = { ok: "bg-go", error: "bg-rebook", skipped: "bg-line" } as const;
  const ran = a.checks.filter((c) => c.status === "ok").length;
  return (
    <details className={`${side} group`}>
      <summary className="flex cursor-pointer list-none items-center justify-between">
        <span>
          <span className="block font-semibold">Data checks</span>
          <span className="text-sm text-ink-3">
            {ran} of {a.checks.length} ran. Expand for what was skipped and why.
          </span>
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden="true">
          <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </summary>
      <ul className="mt-4 space-y-2.5 text-sm">
        {a.checks.map((c, i) => (
          <li key={i} className="flex gap-2.5">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot[c.status]}`} />
            <span className="min-w-0">
              <span className="font-medium">{SOURCE_LABEL[c.source]}</span>
              {c.airport && <span> at {c.airport}</span>}
              <span className="block text-ink-3">
                {c.status === "ok" ? "Ran" : c.status === "error" ? "Failed" : "Skipped"}
                {c.note ? `: ${c.note}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
