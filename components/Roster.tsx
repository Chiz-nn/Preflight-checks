"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ROSTER } from "@/data/roster";
import { getAirport } from "@/lib/airports";
import { addDays, formatDate, todayIn, WINDOWS } from "@/lib/time";
import type { Assessment } from "@/lib/types";
import { ConfidencePill, VerdictBadge } from "./Badges";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "done"; a: Assessment };

export default function Roster() {
  const trips = useMemo(
    () =>
      ROSTER.map((t) => ({
        ...t,
        date: addDays(todayIn(getAirport(t.origin)!.tz), t.dayOffset),
      })),
    [],
  );
  const [results, setResults] = useState<Record<string, State>>({});

  useEffect(() => {
    let cancelled = false;
    const queue = [...trips];
    // Three at a time keeps us polite to the public APIs.
    const worker = async () => {
      while (queue.length && !cancelled) {
        const t = queue.shift()!;
        setResults((r) => ({ ...r, [t.id]: { status: "loading" } }));
        const q = new URLSearchParams({ origin: t.origin, dest: t.dest, date: t.date, window: t.window, explain: "0" });
        if (t.via) q.set("via", t.via);
        try {
          const res = await fetch(`/api/assess?${q}`);
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? res.statusText);
          if (!cancelled) setResults((r) => ({ ...r, [t.id]: { status: "done", a: body } }));
        } catch (e) {
          if (!cancelled) setResults((r) => ({ ...r, [t.id]: { status: "error", message: e instanceof Error ? e.message : String(e) } }));
        }
      }
    };
    Promise.all([worker(), worker(), worker()]);
    return () => {
      cancelled = true;
    };
  }, [trips]);

  const done = Object.values(results).filter((r) => r.status === "done") as { a: Assessment }[];
  const counts = { rebook: 0, watch: 0, go: 0 };
  done.forEach(({ a }) => counts[a.verdict]++);

  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-5">
        <div>
          <h2 className="font-semibold">Upcoming trips</h2>
          <p className="text-sm text-muted">Checked live against FAA, NWS, and aviation forecasts. Open a trip for the evidence and AI briefing.</p>
        </div>
        <div className="flex gap-4 font-mono text-sm">
          <span className="text-rebook">{counts.rebook} rebook</span>
          <span className="text-watch">{counts.watch} watch</span>
          <span className="text-go">{counts.go} go</span>
        </div>
      </div>
      <ul className="divide-y divide-line">
        {trips.map((t) => {
          const r = results[t.id];
          const q = new URLSearchParams({ origin: t.origin, dest: t.dest, date: t.date, window: t.window, traveler: t.traveler });
          if (t.via) q.set("via", t.via);
          const top = r?.status === "done" ? r.a.signals.find((s) => s.level !== "info") : undefined;
          return (
            <li key={t.id}>
              <Link href={`/trip?${q}`} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1.2fr_1.3fr_1fr_auto] gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-paper/70">
                <div>
                  <div className="font-medium text-sm">{t.traveler}</div>
                  <div className="text-xs text-muted">
                    {t.team} · {t.purpose}
                  </div>
                </div>
                <div className="order-3 sm:order-none col-span-2 sm:col-span-1">
                  <div className="font-mono text-sm tracking-wide">
                    {t.origin} <span className="text-muted">→</span> {t.via ? <>{t.via} <span className="text-muted">→</span> </> : null}
                    {t.dest}
                  </div>
                  <div className="text-xs text-muted truncate" title={top?.title}>
                    {r?.status === "done" ? top?.title ?? "No flight-impacting signals" : r?.status === "error" ? r.message : " "}
                  </div>
                </div>
                <div className="hidden sm:block">
                  <div className="text-sm">{formatDate(t.date)}</div>
                  <div className="text-xs text-muted">
                    {t.dayOffset === 0 ? "today" : t.dayOffset === 1 ? "tomorrow" : `in ${t.dayOffset} days`} · {WINDOWS[t.window].label.split(" (")[0].toLowerCase()}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 justify-center">
                  {!r || r.status === "loading" ? (
                    <span className="loading-bar h-5 w-16 rounded bg-line" />
                  ) : r.status === "error" ? (
                    <span className="text-xs text-rebook">failed</span>
                  ) : (
                    <>
                      <VerdictBadge verdict={r.a.verdict} />
                      <ConfidencePill confidence={r.a.confidence} />
                    </>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
