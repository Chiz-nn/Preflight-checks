"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAirport } from "@/lib/airports";
import { formatDate, WINDOWS } from "@/lib/time";
import type { Assessment, Signal, TimeWindow } from "@/lib/types";
import { ConfidencePill, LEVEL_STYLE, SOURCE_LABEL, VerdictBadge } from "./Badges";

interface Props {
  origin: string;
  dest: string;
  via?: string;
  date: string;
  window: string;
  traveler?: string;
}

export default function TripReport(p: Props) {
  const [a, setA] = useState<Assessment | null>(null);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<string | null>(null);

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
  const windowLabel = WINDOWS[(p.window as TimeWindow) in WINDOWS ? (p.window as TimeWindow) : "any"].label;

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← All trips
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {p.traveler && <div className="text-sm text-muted">{p.traveler}</div>}
          <h1 className="font-mono text-3xl tracking-wide">
            {stops.map((c, i) => (
              <span key={c}>
                {i > 0 && <span className="text-muted"> → </span>}
                {c}
              </span>
            ))}
          </h1>
          <div className="text-sm text-muted mt-1">
            {stops.map((c) => getAirport(c)?.city.split(",")[0]).join(" to ")} · {p.date ? formatDate(p.date) : ""} · {windowLabel}
            {a ? ` · ${a.daysOut === 0 ? "today" : a.daysOut === 1 ? "tomorrow" : `${a.daysOut} days out`}` : ""}
          </div>
        </div>
      </header>

      {error && <div className="rounded-lg border border-rebook/30 bg-rebook-bg p-4 text-sm text-rebook">{error}</div>}
      {!a && !error && <Loading />}

      {a && (
        <>
          <Briefing a={a} onFocus={setFocus} />
          <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
            <Evidence a={a} stops={stops} focus={focus} />
            <aside className="space-y-6">
              <Baselines a={a} />
              <Alternates a={a} />
              <Checks a={a} />
            </aside>
          </div>
          <p className="text-xs text-muted">
            The verdict and confidence come from fixed rules over the evidence above (see <code>lib/assess.ts</code>). The AI only writes the briefing and can only cite evidence
            that exists. Generated {new Date(a.generatedAt).toLocaleString()}.
          </p>
        </>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="rounded-lg border border-line bg-panel p-6 space-y-3">
      <div className="text-sm text-muted">Checking FAA programs, NWS forecasts and alerts, aviation forecasts, and route history, then writing the briefing...</div>
      {[80, 60, 70].map((w) => (
        <div key={w} className="loading-bar h-3 rounded bg-line" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function Briefing({ a, onFocus }: { a: Assessment; onFocus: (id: string | null) => void }) {
  const e = a.explanation;
  const tone = a.verdict === "rebook" ? "border-rebook/40" : a.verdict === "watch" ? "border-watch/40" : "border-go/40";
  return (
    <section className={`rounded-lg border-2 ${tone} bg-panel p-6`}>
      <div className="flex flex-wrap items-center gap-3">
        <VerdictBadge verdict={a.verdict} size="lg" />
        <span className="text-sm text-muted">Confidence</span>
        <ConfidencePill confidence={a.confidence} />
      </div>
      {e && (
        <>
          <h2 className="mt-4 text-xl font-semibold leading-snug">{e.headline}</h2>
          <p className="mt-2 text-[15px] leading-relaxed max-w-3xl">{e.summary}</p>
          <p className="mt-3 text-sm text-muted max-w-3xl">
            <b className="text-ink font-medium">Why {a.confidence} confidence: </b>
            {e.confidenceExplanation}
          </p>
          <div className="mt-5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Recommended actions</h3>
            <ol className="mt-2 space-y-2">
              {e.actions.map((act, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="font-mono text-muted">{i + 1}.</span>
                  <span>
                    {act.text}{" "}
                    {act.signalIds.map((id) => (
                      <a
                        key={id}
                        href={`#${id}`}
                        onMouseEnter={() => onFocus(id)}
                        onMouseLeave={() => onFocus(null)}
                        className="ml-1 inline-block rounded bg-info-bg px-1.5 py-0.5 font-mono text-[11px] text-info hover:bg-ink hover:text-paper"
                      >
                        {id}
                      </a>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-5 text-xs text-muted">
            {e.generatedBy === "gemini" ? (
              <>Briefing written by Gemini ({e.model}) from the evidence below. Citations link to the evidence each step relies on.</>
            ) : (
              <>Rule-based briefing. {e.fallbackReason}</>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Evidence({ a, stops, focus }: { a: Assessment; stops: string[]; focus: string | null }) {
  const roles = ["Departure", ...(stops.length === 3 ? ["Connection"] : []), "Arrival"];
  const live = a.signals.filter((s) => s.source !== "bts");
  return (
    <section className="space-y-5">
      <h2 className="font-semibold">Evidence</h2>
      {stops.map((code, i) => {
        const items = live.filter((s) => s.airport === code);
        return (
          <div key={code}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="font-mono font-semibold">{code}</span>
              <span className="text-xs text-muted">
                {roles[i]} · {getAirport(code)?.name}
              </span>
            </div>
            {items.length ? (
              <div className="space-y-2">
                {items.map((s) => (
                  <SignalCard key={s.id} s={s} focused={focus === s.id} />
                ))}
              </div>
            ) : (
              <p className="rounded border border-dashed border-line p-3 text-sm text-muted">
                No live signals for this airport{a.daysOut > 7 ? " (trip is past forecast range)" : ""}.
              </p>
            )}
          </div>
        );
      })}
      {a.signals.some((s) => s.source === "bts") && (
        <div>
          <div className="mb-2 font-semibold text-sm">Route history</div>
          <div className="space-y-2">
            {a.signals
              .filter((s) => s.source === "bts")
              .map((s) => (
                <SignalCard key={s.id} s={s} focused={focus === s.id} />
              ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SignalCard({ s, focused }: { s: Signal; focused: boolean }) {
  const st = LEVEL_STYLE[s.level];
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }) : "");
  return (
    <article id={s.id} className={`relative overflow-hidden rounded border bg-panel pl-4 pr-4 py-3 transition ${focused ? "border-ink shadow-md" : "border-line"}`}>
      <span className={`absolute left-0 top-0 h-full w-1 ${st.bar}`} />
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className={`rounded px-1.5 py-0.5 font-medium ${st.chip}`}>{st.label}</span>
        <span className="text-muted">{SOURCE_LABEL[s.source]}</span>
        <span className="font-mono text-muted/70">{s.id}</span>
      </div>
      <h3 className="mt-1 text-sm font-medium">{s.title}</h3>
      <p className="mt-0.5 text-sm text-muted break-words">{s.detail}</p>
      <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-muted">
        {(s.validFrom || s.validTo) && (
          <span>
            Valid {fmt(s.validFrom)}
            {s.validTo ? ` to ${fmt(s.validTo)}` : ""}
          </span>
        )}
        <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-ink">
          View source ↗
        </a>
      </div>
    </article>
  );
}

function Baselines({ a }: { a: Assessment }) {
  if (!a.baselines.length) return null;
  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <h2 className="text-sm font-semibold">A normal day on this route</h2>
      <p className="text-xs text-muted">Share of flights late 15+ min, cancelled, or diverted in this month.</p>
      <div className="mt-3 space-y-3">
        {a.baselines.map((b) => {
          const max = Math.max(b.disruptedPct, b.nationalDisruptedPct, 1) * 1.15;
          return (
            <div key={b.leg} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-mono">{b.leg}</span>
                <span className="text-muted">{b.flights.toLocaleString()} flights{b.scope === "airport" ? " (airport-wide)" : ""}</span>
              </div>
              {[
                { label: b.scope === "route" ? "This route" : "This airport", v: b.disruptedPct, cls: b.disruptedPct > b.nationalDisruptedPct * 1.25 ? "bg-watch" : "bg-ink" },
                { label: "U.S. average", v: b.nationalDisruptedPct, cls: "bg-line" },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 text-muted">{row.label}</span>
                  <span className="h-2 flex-1 rounded bg-paper">
                    <span className={`block h-2 rounded ${row.cls}`} style={{ width: `${(row.v / max) * 100}%` }} />
                  </span>
                  <span className="w-10 text-right font-mono">{row.v}%</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted">BTS on-time data, {a.baselines[0].period}.</p>
    </section>
  );
}

function Alternates({ a }: { a: Assessment }) {
  if (!a.alternates.length) return null;
  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <h2 className="text-sm font-semibold">Nearby airports right now</h2>
      <p className="text-xs text-muted">FAA status for other airports in the same metro area.</p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {a.alternates.map((alt) => (
          <li key={alt.code} className="flex items-center justify-between gap-2">
            <span>
              <span className="font-mono">{alt.code}</span> <span className="text-xs text-muted">for {alt.forAirport}</span>
            </span>
            <span className={`text-xs ${alt.faaClear ? "text-go" : "text-rebook"}`}>{alt.faaClear ? "no FAA programs" : "FAA program active"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Checks({ a }: { a: Assessment }) {
  const dot = { ok: "bg-go", error: "bg-rebook", skipped: "bg-line" } as const;
  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <h2 className="text-sm font-semibold">Data checks</h2>
      <p className="text-xs text-muted">What ran, what didn&apos;t, and why.</p>
      <ul className="mt-3 space-y-2 text-xs">
        {a.checks.map((c, i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-1 size-2 shrink-0 rounded-full ${dot[c.status]}`} />
            <span>
              <span className="font-medium">{SOURCE_LABEL[c.source]}</span>
              {c.airport && <span className="font-mono"> {c.airport}</span>}
              <span className="text-muted">
                {" "}
                {c.status}
                {c.note ? `: ${c.note}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
