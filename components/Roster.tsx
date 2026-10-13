"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ROSTER, type RosterTrip } from "@/data/roster";
import { getAirport } from "@/lib/airports";
import { addDays, formatDate, todayIn, WINDOWS } from "@/lib/time";
import type { Assessment, Verdict } from "@/lib/types";
import { ConfidenceMeter, VerdictBadge } from "./Badges";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "done"; a: Assessment };
type Trip = RosterTrip & { date: string };

/** Runs every roster trip through /api/assess (rules only, no AI) three at a time. */
export function useRoster() {
  const trips = useMemo<Trip[]>(() => ROSTER.map((t) => ({ ...t, date: addDays(todayIn(getAirport(t.origin)!.tz), t.dayOffset) })), []);
  const [results, setResults] = useState<Record<string, State>>({});

  useEffect(() => {
    let cancelled = false;
    const queue = [...trips];
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

  const counts: Record<Verdict, number> = { rebook: 0, watch: 0, go: 0 };
  Object.values(results).forEach((r) => r.status === "done" && counts[r.a.verdict]++);
  const settled = Object.values(results).filter((r) => r.status !== "loading").length;
  return { trips, results, counts, settled };
}

function when(t: Trip) {
  const rel = t.dayOffset === 0 ? "Today" : t.dayOffset === 1 ? "Tomorrow" : formatDate(t.date);
  return `${rel}, ${WINDOWS[t.window].label.split(" (")[0].toLowerCase()}`;
}

function RouteLine({ stops }: { stops: string[] }) {
  return (
    <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight tnum">
      {stops.map((c, i) => (
        <span key={c} className="flex items-center gap-2">
          {i > 0 && (
            <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden="true" className="text-ink-3">
              <path d="M1 7 Q14 -2 27 7" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2.5" />
            </svg>
          )}
          {c}
        </span>
      ))}
    </span>
  );
}

export default function Roster({ trips, results }: ReturnType<typeof useRoster>) {
  return (
    <section aria-label="Upcoming trips" className="overflow-hidden rounded-2xl bg-surface shadow-[0_1px_0_rgba(14,26,43,0.04),0_20px_50px_-30px_rgba(14,26,43,0.35)] ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-4 px-6 pb-3 pt-5">
        <h2 className="text-lg font-semibold tracking-tight">Upcoming trips</h2>
        <p className="hidden text-sm text-ink-3 sm:block">Open a trip for the evidence and briefing</p>
      </div>
      <ul>
        {trips.map((t) => {
          const r = results[t.id];
          const q = new URLSearchParams({ origin: t.origin, dest: t.dest, date: t.date, window: t.window, traveler: t.traveler });
          if (t.via) q.set("via", t.via);
          const top = r?.status === "done" ? r.a.signals.find((s) => s.level !== "info") : undefined;
          const stops = [t.origin, t.via, t.dest].filter(Boolean) as string[];
          return (
            <li key={t.id} className="border-t border-line first:border-t-0">
              <Link
                href={`/trip?${q}`}
                className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 px-6 py-4 transition-colors hover:bg-page sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.traveler}</div>
                  <div className="truncate text-sm text-ink-3">
                    {t.purpose}, {t.team}
                  </div>
                </div>
                <div className="order-3 col-span-2 min-w-0 sm:order-none sm:col-span-1">
                  <RouteLine stops={stops} />
                  <div className="mt-0.5 truncate text-sm text-ink-2">
                    {when(t)}
                    {r?.status === "done" && <span className="text-ink-3">. {top ? top.title : "Clear on all live checks"}</span>}
                    {r?.status === "error" && <span className="text-rebook">. Check failed: {r.message}</span>}
                  </div>
                </div>
                <div className="flex min-w-24 flex-col items-end gap-1.5">
                  {!r || r.status === "loading" ? (
                    <>
                      <span className="shimmer h-6 w-16 rounded-full" />
                      <span className="shimmer h-3 w-24 rounded" />
                    </>
                  ) : r.status === "done" ? (
                    <>
                      <VerdictBadge verdict={r.a.verdict} />
                      <ConfidenceMeter confidence={r.a.confidence} />
                    </>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
