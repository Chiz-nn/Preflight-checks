#!/usr/bin/env python3
"""
Build data/baseline.json from Bureau of Transportation Statistics (BTS)
on-time performance data.

For every route between the airports in data/airports.json, and for every
month, this counts flights and how many were "disrupted": arrived 15+ minutes
late, were cancelled, or were diverted. It also keeps per-airport departure
totals (fallback for thin routes) and a national total per month.

Usage (standard library only, no pip installs):
    python3 scripts/build_baseline.py                  # all 12 months of 2025
    python3 scripts/build_baseline.py --months 10,11,12  # faster: just these months
    python3 scripts/build_baseline.py --year 2024

Each monthly file is a ~25 to 35 MB zip. Downloads are cached in .bts-cache/
so re-runs are fast.
"""
import argparse
import csv
import io
import json
import os
import ssl
import subprocess
import sys
import urllib.request
import zipfile
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".bts-cache")
URL = "https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_{year}_{month}.zip"


def download(year: int, month: int) -> str:
    os.makedirs(CACHE, exist_ok=True)
    dest = os.path.join(CACHE, f"ontime_{year}_{month}.zip")
    if os.path.exists(dest) and zipfile.is_zipfile(dest):
        return dest
    url = URL.format(year=year, month=month)
    print(f"  downloading {url}", flush=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "preflight-checks baseline builder"})
        with urllib.request.urlopen(req, timeout=300, context=ssl.create_default_context()) as r, open(dest, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
    except Exception as e:  # macOS Python often lacks CA certs; curl uses the system store
        print(f"  urllib failed ({e}); retrying with curl", flush=True)
        subprocess.run(["curl", "-fL", "--retry", "3", "-o", dest, url], check=True)
    if not zipfile.is_zipfile(dest):
        os.remove(dest)
        raise RuntimeError(f"{url} did not return a zip file")
    return dest


def flag(v: str) -> bool:
    try:
        return float(v or 0) >= 1
    except ValueError:
        return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2025)
    ap.add_argument("--months", default="1,2,3,4,5,6,7,8,9,10,11,12")
    args = ap.parse_args()
    months = [int(m) for m in args.months.split(",") if m.strip()]

    with open(os.path.join(ROOT, "data", "airports.json")) as f:
        codes = {a["code"] for a in json.load(f)["airports"]}

    national: dict = {}
    routes: dict = {}
    airports: dict = {}

    def bump(table: dict, key: str, month: str, disrupted: bool, cancelled: bool) -> None:
        c = table.setdefault(key, {}).setdefault(month, [0, 0, 0])
        c[0] += 1
        c[1] += int(disrupted)
        c[2] += int(cancelled)

    for month in months:
        print(f"Month {args.year}-{month:02d}", flush=True)
        path = download(args.year, month)
        with zipfile.ZipFile(path) as z:
            name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
            with z.open(name) as raw:
                reader = csv.DictReader(io.TextIOWrapper(raw, encoding="latin-1", newline=""))
                m = str(month)
                n = 0
                for row in reader:
                    cancelled = flag(row.get("Cancelled", ""))
                    disrupted = cancelled or flag(row.get("Diverted", "")) or flag(row.get("ArrDel15", ""))
                    nat = national.setdefault(m, [0, 0, 0])
                    nat[0] += 1
                    nat[1] += int(disrupted)
                    nat[2] += int(cancelled)
                    o, d = row.get("Origin", ""), row.get("Dest", "")
                    if o in codes:
                        bump(airports, o, m, disrupted, cancelled)
                        if d in codes:
                            bump(routes, f"{o}-{d}", m, disrupted, cancelled)
                    n += 1
                print(f"  {n:,} flights", flush=True)

    out = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "period": f"{args.year} ({len(months)} month{'s' if len(months) != 1 else ''})",
        "source": "BTS Reporting Carrier On-Time Performance",
        "national": national,
        "routes": routes,
        "airports": airports,
    }
    dest = os.path.join(ROOT, "data", "baseline.json")
    with open(dest, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"Wrote {dest} ({os.path.getsize(dest) / 1024:.0f} KB, {len(routes)} routes)")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
