"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AIRPORTS } from "@/lib/airports";
import { addDays, todayIn, WINDOWS } from "@/lib/time";
import type { TimeWindow } from "@/lib/types";

const field = "w-full rounded border border-line bg-panel px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink/20";

function AirportSelect({ value, onChange, placeholder, optional }: { value: string; onChange: (v: string) => void; placeholder: string; optional?: boolean }) {
  return (
    <select className={field} value={value} onChange={(e) => onChange(e.target.value)} required={!optional}>
      <option value="">{placeholder}</option>
      {AIRPORTS.map((a) => (
        <option key={a.code} value={a.code}>
          {a.city.split(",")[0]} ({a.code}) · {a.name}
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
    <form onSubmit={submit} className="rounded-lg border border-line bg-panel p-5 space-y-4">
      <div>
        <h2 className="font-semibold">Check a trip</h2>
        <p className="text-sm text-muted">Any U.S. route on the list, any date. Live data covers the next 7 days.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted uppercase tracking-wide">From</span>
          <AirportSelect value={origin} onChange={setOrigin} placeholder="Origin airport" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted uppercase tracking-wide">To</span>
          <AirportSelect value={dest} onChange={setDest} placeholder="Destination airport" />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-muted uppercase tracking-wide">Connecting through (optional)</span>
          <AirportSelect value={via} onChange={setVia} placeholder="Nonstop" optional />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted uppercase tracking-wide">Date</span>
          <input type="date" className={field} value={date} min={today} max={addDays(today, 120)} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted uppercase tracking-wide">Departure window</span>
          <select className={field} value={window} onChange={(e) => setWindow(e.target.value as TimeWindow)}>
            {Object.entries(WINDOWS).map(([k, w]) => (
              <option key={k} value={k}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-muted uppercase tracking-wide">Traveler (optional)</span>
          <input className={field} value={traveler} onChange={(e) => setTraveler(e.target.value)} placeholder="Name, for the report header" />
        </label>
      </div>
      {error && <p className="text-sm text-rebook">{error}</p>}
      <button type="submit" className="w-full rounded bg-ink px-4 py-2.5 text-sm font-medium text-paper hover:bg-ink/90">
        Run preflight check
      </button>
    </form>
  );
}
