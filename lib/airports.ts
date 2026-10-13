import data from "@/data/airports.json";

export interface Airport {
  code: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  tz: string;
  metro?: string;
}

export const AIRPORTS: Airport[] = [...(data.airports as Airport[])].sort((a, b) =>
  a.city.localeCompare(b.city),
);

const BY_CODE = new Map(AIRPORTS.map((a) => [a.code, a]));

export function getAirport(code: string): Airport | undefined {
  return BY_CODE.get(code.toUpperCase());
}

export function metroName(airport: Airport): string | undefined {
  if (!airport.metro) return undefined;
  return (data.metros as Record<string, { name: string }>)[airport.metro]?.name;
}

/** Other airports serving the same metro area (e.g. LGA and EWR for JFK). */
export function nearbyAirports(code: string): Airport[] {
  const a = getAirport(code);
  if (!a?.metro) return [];
  const metro = (data.metros as Record<string, { airports: string[] }>)[a.metro];
  return (metro?.airports ?? [])
    .filter((c) => c !== a.code)
    .map((c) => BY_CODE.get(c))
    .filter((x): x is Airport => Boolean(x));
}

export function airportLabel(a: Airport): string {
  return `${a.city.split(",")[0]} (${a.code})`;
}
