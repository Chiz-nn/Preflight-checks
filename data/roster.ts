import type { TimeWindow } from "@/lib/types";

/**
 * Seeded traveler roster. In production this would come from the company's
 * travel booking system (Navan, Concur, etc.). Dates are relative to today so
 * the demo always shows a spread: same-day, near-term, and beyond forecast range.
 */
export interface RosterTrip {
  id: string;
  traveler: string;
  team: string;
  origin: string;
  dest: string;
  via?: string;
  dayOffset: number;
  window: TimeWindow;
  purpose: string;
}

export const ROSTER: RosterTrip[] = [
  { id: "t1", traveler: "Daniel Okafor", team: "Engineering", origin: "DFW", dest: "ORD", dayOffset: 0, window: "evening", purpose: "Platform offsite" },
  { id: "t2", traveler: "Maya Chen", team: "Sales", origin: "JFK", dest: "SFO", dayOffset: 1, window: "morning", purpose: "Customer QBR" },
  { id: "t3", traveler: "James Liu", team: "Product", origin: "SFO", dest: "IAD", via: "ORD", dayOffset: 1, window: "afternoon", purpose: "Partner workshop" },
  { id: "t4", traveler: "Priya Raman", team: "Finance", origin: "BOS", dest: "ATL", dayOffset: 2, window: "afternoon", purpose: "Audit fieldwork" },
  { id: "t5", traveler: "Marcus Webb", team: "Field Ops", origin: "DEN", dest: "SEA", dayOffset: 3, window: "any", purpose: "Site visit" },
  { id: "t6", traveler: "Grace Kim", team: "Marketing", origin: "PHX", dest: "MSP", dayOffset: 4, window: "afternoon", purpose: "Trade show" },
  { id: "t7", traveler: "Sofia Alvarez", team: "Legal", origin: "MIA", dest: "LGA", dayOffset: 5, window: "morning", purpose: "Deposition" },
  { id: "t8", traveler: "Aisha Bello", team: "Operations", origin: "AUS", dest: "EWR", via: "CLT", dayOffset: 6, window: "evening", purpose: "Vendor review" },
  { id: "t9", traveler: "Tom Becker", team: "Executive", origin: "LAX", dest: "BOS", dayOffset: 10, window: "morning", purpose: "Board meeting" },
  { id: "t10", traveler: "Noah Patel", team: "Sales", origin: "ATL", dest: "DFW", dayOffset: 14, window: "any", purpose: "Regional kickoff" },
];
