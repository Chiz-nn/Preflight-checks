import { NextResponse } from "next/server";
import { assess, InputError } from "@/lib/assess";
import { explain } from "@/lib/explain";
import type { TimeWindow } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/assess?origin=JFK&dest=SFO&date=2026-10-14&window=morning[&via=ORD][&explain=0]
 * explain=0 skips the LLM (used by the roster so a page of trips doesn't burn the free-tier quota).
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  try {
    const assessment = await assess({
      origin: q.get("origin") ?? "",
      dest: q.get("dest") ?? "",
      via: q.get("via") || undefined,
      date: q.get("date") ?? "",
      window: (q.get("window") ?? "any") as TimeWindow,
    });
    if (q.get("explain") !== "0") assessment.explanation = await explain(assessment);
    return NextResponse.json(assessment);
  } catch (e) {
    if (e instanceof InputError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Assessment failed" }, { status: 500 });
  }
}
