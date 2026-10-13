import { XMLParser } from "fast-xml-parser";
import { fetchCached } from "../http";

/**
 * FAA National Airspace System status feed. Lists every airport with an active
 * ground stop, ground delay program, general delay, or closure right now.
 * Public, no key. Refreshed by the FAA every minute or two.
 */
export const FAA_URL = "https://nasstatus.faa.gov/api/airport-status-information";
export const FAA_PUBLIC_PAGE = "https://nasstatus.faa.gov/";

export type FaaKind = "ground_stop" | "ground_delay" | "delay" | "closure" | "other";

export interface FaaEvent {
  airport: string;
  kind: FaaKind;
  typeName: string;
  reason: string;
  details: string;
  /** Closures that only restrict general aviation / oversized aircraft don't affect airline passengers. */
  affectsAirlines: boolean;
}

export interface FaaFeed {
  updated: string;
  events: FaaEvent[];
}

function kindFor(typeName: string): FaaKind {
  const n = typeName.toLowerCase();
  if (n.includes("ground stop")) return "ground_stop";
  if (n.includes("ground delay")) return "ground_delay";
  if (n.includes("closure")) return "closure";
  if (n.includes("delay")) return "delay";
  return "other";
}

const FIELD_LABELS: Record<string, string> = {
  Avg: "average delay",
  Max: "max delay",
  Min: "min delay",
  Trend: "trend",
  End_Time: "expected end",
  Start: "start",
  Reopen: "reopens",
  "@_Type": "type",
};

/** Flatten every leaf field except ARPT/Reason into "label: value" text. */
function describe(node: unknown, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node !== "object") return out;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "ARPT" || k === "Reason") continue;
    if (v != null && typeof v === "object") describe(v, out);
    else if (v !== "" && v != null) out.push(`${FIELD_LABELS[k] ?? k.replace(/_/g, " ").toLowerCase()}: ${v}`);
  }
  return out;
}

/** Walk the tree collecting any object that has an ARPT field. */
function collect(node: unknown, typeName: string, out: FaaEvent[]) {
  if (Array.isArray(node)) {
    node.forEach((n) => collect(n, typeName, out));
    return;
  }
  if (node == null || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.ARPT === "string" || typeof obj.ARPT === "number") {
    const reason = String(obj.Reason ?? "").trim();
    const details = describe(obj).join(", ");
    const kind = kindFor(typeName);
    const text = `${reason} ${details}`.toLowerCase();
    const gaOnly =
      kind === "closure" &&
      /(general aviation|transient|non[- ]?sked|non[- ]?scheduled|wingspan|tail height|\bppr\b|prior permission|\bga\b)/.test(text);
    out.push({
      airport: String(obj.ARPT).toUpperCase(),
      kind,
      typeName,
      reason: reason || "not stated",
      details,
      affectsAirlines: !gaOnly,
    });
    return;
  }
  for (const v of Object.values(obj)) collect(v, typeName, out);
}

export async function getFaaFeed(): Promise<FaaFeed> {
  const xml = await fetchCached<string>(FAA_URL, { ttlMs: 2 * 60_000, parse: "text", headers: { Accept: "application/xml" } });
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
  const doc = parser.parse(xml);
  const root = doc?.AIRPORT_STATUS_INFORMATION;
  if (!root) throw new Error("FAA feed returned an unexpected document");

  const events: FaaEvent[] = [];
  const types = Array.isArray(root.Delay_type) ? root.Delay_type : root.Delay_type ? [root.Delay_type] : [];
  for (const t of types) {
    const typeName = String(t?.Name ?? "Unknown");
    collect(t, typeName, events);
  }
  return { updated: String(root.Update_Time ?? ""), events };
}
