import fs from "node:fs";
import path from "node:path";

/**
 * Historical baseline from the Bureau of Transportation Statistics on-time
 * performance data. scripts/build_baseline.py downloads the monthly BTS files
 * once and writes data/baseline.json; this module only reads that file.
 */
export const BTS_PAGE = "https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FGJ";

type Counts = [flights: number, disrupted: number, cancelled: number];

export interface BaselineFile {
  generatedAt: string;
  period: string;
  national: Record<string, Counts>;
  routes: Record<string, Record<string, Counts>>;
  airports: Record<string, Record<string, Counts>>;
}

let loaded: BaselineFile | null | undefined;

export function loadBaseline(): BaselineFile | null {
  if (loaded !== undefined) return loaded;
  try {
    const p = path.join(process.cwd(), "data", "baseline.json");
    loaded = JSON.parse(fs.readFileSync(p, "utf8")) as BaselineFile;
  } catch {
    loaded = null;
  }
  return loaded;
}

export interface LegBaseline {
  scope: "route" | "airport";
  flights: number;
  disruptedPct: number;
  cancelledPct: number;
  nationalDisruptedPct: number;
  period: string;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

/** Route-level history for the month, falling back to the origin airport if the route is too thin. */
export function legBaseline(from: string, to: string, month: number): LegBaseline | null {
  const b = loadBaseline();
  if (!b) return null;
  const m = String(month);
  const nat = b.national[m];
  if (!nat) return null;
  const national = pct(nat[1], nat[0]);

  const route = b.routes[`${from}-${to}`]?.[m];
  if (route && route[0] >= 30) {
    return { scope: "route", flights: route[0], disruptedPct: pct(route[1], route[0]), cancelledPct: pct(route[2], route[0]), nationalDisruptedPct: national, period: b.period };
  }
  const ap = b.airports[from]?.[m];
  if (ap && ap[0] >= 30) {
    return { scope: "airport", flights: ap[0], disruptedPct: pct(ap[1], ap[0]), cancelledPct: pct(ap[2], ap[0]), nationalDisruptedPct: national, period: b.period };
  }
  return null;
}
