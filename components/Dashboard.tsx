"use client";

import { useMemo } from "react";
import { todayIn } from "@/lib/time";
import Roster, { useRoster } from "./Roster";
import TripForm from "./TripForm";

const SEG = [
  { key: "rebook", label: "Rebook", color: "var(--rebook)" },
  { key: "watch", label: "Watch", color: "#f0a83a" },
  { key: "go", label: "Go", color: "#57c39a" },
] as const;

export default function Dashboard() {
  const roster = useRoster();
  const { counts, settled, trips } = roster;
  const total = trips.length;
  const attention = counts.rebook + counts.watch;
  const done = settled === total;
  const today = useMemo(
    () => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${todayIn("America/Chicago")}T12:00:00Z`)),
    [],
  );

  return (
    <>
      <section className="sky relative overflow-hidden pb-32 pt-28 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="rise text-sm text-white/70">{today}</p>
          <h1 className="rise mt-3 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl" style={{ animationDelay: "80ms" }} aria-live="polite">
            {!done ? (
              <>Checking {total} trips against live flight and weather data</>
            ) : attention === 0 ? (
              <>All {total} trips look clear</>
            ) : (
              <>
                {attention} of {total} trips need a look
              </>
            )}
          </h1>

          <div className="rise mt-10 max-w-xl" style={{ animationDelay: "160ms" }}>
            <div className="flex h-2 overflow-hidden rounded-full bg-white/15" role="img" aria-label={`${counts.rebook} rebook, ${counts.watch} watch, ${counts.go} go`}>
              {SEG.map((s) => (
                <span
                  key={s.key}
                  className="h-full transition-[width] duration-700 ease-out"
                  style={{ width: `${(counts[s.key] / total) * 100}%`, background: s.color }}
                />
              ))}
            </div>
            <div className="mt-3 flex gap-6 text-sm text-white/80 tnum">
              {SEG.map((s) => (
                <span key={s.key} className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  {counts[s.key]} {s.label}
                </span>
              ))}
              {!done && <span className="text-white/50">{total - settled} pending</span>}
            </div>
          </div>
        </div>
      </section>

      <main className="relative z-10 mx-auto -mt-20 grid max-w-6xl items-start gap-6 px-4 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Roster {...roster} />
        <div className="lg:sticky lg:top-6">
          <TripForm />
        </div>
      </main>
    </>
  );
}
