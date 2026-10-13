"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AIRPORTS } from "@/lib/airports";
import { addDays, todayIn, WINDOWS } from "@/lib/time";
import type { TimeWindow } from "@/lib/types";

const field = "w-full rounded-xl border border-line bg-page/60 px-3 py-2.5 text-sm text-ink transition focus:border-sky-2 focus:bg-surface focus:outline-none focus:ring-4 focus:ring-sky-2/15";

function AirportSelect({ value, onChange, placeholder, optional }: { value: string; onChange: (v: string) => void; placeholder: string; optional?: boolean }) {
  return (
    <select className={field} value={value} onChange={(e) => onChange(e.target.value)} required={!optional}>
      <option value="">{placeholder}</option>
      {AIRPORTS.map((a) => (
        <option key={a.code} value={a.code}>
          {a.city.split(",")[0]} ({a.code}), {a.name}
        </option>
      ))}
    </select>
  );
}

export default function TripForm() {
  const router = useRouter();
  const today = useMemo(() => todayIn("America/Chicago"), []);
  const [origin, setOrigin] = useState("JFK");
  const [dest, setDest] = useState("SFO");
  const [via, setVia] = useState("");
  const [date, setDate] = useState(addDays(today, 1));
  const [window, setWindow] = useState<TimeWindow>("any");
  const [traveler, setTraveler] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (origin === dest) return setError("Origin and destination must be different.");
    if (via && (via === origin || via === dest)) return setError("The connection must differ from origin and destination.");
    const q = new URLSearchParams({ origin, dest, date, window });
    if (via) q.set("via", via);
    if (traveler.trim()) q.set("traveler", traveler.trim());
    router.push(`/trip?${q}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-surface p-6 shadow-[0_20px_50px_-30px_rgba(14,26,43,0.35)] ring-1 ring-line">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Check any trip</h2>
        <p className="mt-1 text-sm text-ink-3">Live forecasts cover the next 7 days. Further out, the call rests on route history.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium text-ink-2">From</span>
          <AirportSelect value={origin} onChange={setOrigin} placeholder="Origin airport" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-ink-2">To</span>
          <AirportSelect value={dest} onChange={setDest} placeholder="Destination airport" />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium text-ink-2">Connecting through</span>
          <AirportSelect value={via} onChange={setVia} placeholder="Nonstop" optional />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-ink-2">Date</span>
          <input type="date" className={field} value={date} min={today} max={addDays(today, 120)} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-ink-2">Departure window</span>
          <select className={field} value={window} onChange={(e) => setWindow(e.target.value as TimeWindow)}>
            {Object.entries(WINDOWS).map(([k, w]) => (
              <option key={k} value={k}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium text-ink-2">Traveler</span>
          <input className={field} value={traveler} onChange={(e) => setTraveler(e.target.value)} placeholder="Shown on the report" />
        </label>
      </div>
      {error && <p className="text-sm text-rebook" role="alert">{error}</p>}
      <button type="submit" className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(14,26,43,0.6)] transition hover:-translate-y-px hover:bg-sky-1 active:translate-y-0">
        Run the check
      </button>
    </form>
  );
}
