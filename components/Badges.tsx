import type { Assessment, Level, Verdict } from "@/lib/types";

export const VERDICT_TEXT: Record<Verdict, string> = { go: "Go", watch: "Watch", rebook: "Rebook" };

const VERDICT_STYLE: Record<Verdict, string> = {
  go: "bg-go-soft text-go",
  watch: "bg-watch-soft text-watch",
  rebook: "bg-rebook-soft text-rebook",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`settle inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${VERDICT_STYLE[verdict]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {VERDICT_TEXT[verdict]}
    </span>
  );
}

export function ConfidenceMeter({ confidence, light = false }: { confidence: Assessment["confidence"]; light?: boolean }) {
  const bars = confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
  const on = light ? "bg-white" : "bg-ink";
  const off = light ? "bg-white/25" : "bg-line";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${light ? "text-white/80" : "text-ink-3"}`} title={`${confidence} confidence`}>
      <span className="inline-flex items-end gap-[2px]" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`w-[3px] rounded-sm ${i <= bars ? on : off}`} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      {confidence[0].toUpperCase() + confidence.slice(1)} confidence
    </span>
  );
}

export const LEVEL_STYLE: Record<Level, { bar: string; chip: string; label: string; dot: string }> = {
  rebook: { bar: "bg-rebook", chip: "bg-rebook-soft text-rebook", label: "Rebook-level", dot: "#d13a30" },
  watch: { bar: "bg-watch", chip: "bg-watch-soft text-watch", label: "Watch", dot: "#c27800" },
  info: { bar: "bg-line", chip: "bg-info-soft text-info", label: "Context", dot: "#13805b" },
};

export const SOURCE_LABEL: Record<string, string> = {
  faa: "FAA NAS Status",
  nws_alerts: "NWS alerts",
  nws_forecast: "NWS hourly forecast",
  taf: "Aviation forecast (TAF)",
  bts: "BTS on-time history",
};
