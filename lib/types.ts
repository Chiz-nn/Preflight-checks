export type TimeWindow = "morning" | "afternoon" | "evening" | "any";

export interface TripInput {
  origin: string;
  dest: string;
  via?: string;
  date: string; // YYYY-MM-DD, local to the origin airport
  window: TimeWindow;
}

export type SourceId = "faa" | "nws_alerts" | "nws_forecast" | "taf" | "bts";

export type Level = "rebook" | "watch" | "info";

export type Verdict = "go" | "watch" | "rebook";

export type Role = "origin" | "via" | "dest";

export interface Signal {
  id: string;
  source: SourceId;
  airport: string;
  level: Level;
  title: string;
  detail: string;
  url: string;
  validFrom?: string;
  validTo?: string;
}

export interface SourceCheck {
  source: SourceId;
  airport?: string;
  status: "ok" | "error" | "skipped";
  note?: string;
  url?: string;
  fetchedAt?: string;
}

export interface AlternateAirport {
  code: string;
  name: string;
  forAirport: string;
  faaClear: boolean;
}

export interface Baseline {
  leg: string; // "DFW-SFO"
  scope: "route" | "airport";
  month: number;
  flights: number;
  disruptedPct: number; // late 15+ min, cancelled, or diverted
  cancelledPct: number;
  nationalDisruptedPct: number;
  period: string;
}

export interface Explanation {
  headline: string;
  summary: string;
  confidenceExplanation: string;
  actions: { text: string; signalIds: string[] }[];
  generatedBy: "gemini" | "rules";
  model?: string;
  fallbackReason?: string;
}

export interface Assessment {
  trip: TripInput;
  daysOut: number;
  verdict: Verdict;
  confidence: "high" | "medium" | "low";
  confidenceReasons: string[];
  signals: Signal[];
  checks: SourceCheck[];
  baselines: Baseline[];
  alternates: AlternateAirport[];
  ruleActions: { text: string; signalIds: string[] }[];
  explanation?: Explanation;
  generatedAt: string;
}
