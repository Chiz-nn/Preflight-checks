import type { Assessment, Level, Verdict } from "@/lib/types";

const VERDICT_STYLE: Record<Verdict, string> = {
  go: "bg-go-bg text-go border-go/30",
  watch: "bg-watch-bg text-watch border-watch/30",
  rebook: "bg-rebook-bg text-rebook border-rebook/30",
};

export function VerdictBadge({ verdict, size = "sm" }: { verdict: Verdict; size?: "sm" | "lg" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border font-mono font-semibold uppercase tracking-wider ${VERDICT_STYLE[verdict]} ${
        size === "lg" ? "px-3 py-1.5 text-lg" : "px-2 py-0.5 text-xs"
      }`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {verdict}
    </span>
  );
}

export function ConfidencePill({ confidence }: { confidence: Assessment["confidence"] }) {
  const bars = confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={`${confidence} confidence`}>
      <span className="inline-flex items-end gap-[2px]">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`w-[3px] rounded-sm ${i <= bars ? "bg-ink" : "bg-line"}`} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      {confidence}
    </span>
  );
}

export const LEVEL_STYLE: Record<Level, { bar: string; chip: string; label: string }> = {
  rebook: { bar: "bg-rebook", chip: "bg-rebook-bg text-rebook", label: "Rebook-level" },
  watch: { bar: "bg-watch", chip: "bg-watch-bg text-watch", label: "Watch" },
  info: { bar: "bg-line", chip: "bg-info-bg text-info", label: "Context" },
};

export const SOURCE_LABEL: Record<string, string> = {
  faa: "FAA NAS Status",
  nws_alerts: "NWS Alerts",
  nws_forecast: "NWS Hourly Forecast",
  taf: "Aviation Forecast (TAF)",
  bts: "BTS On-Time History",
};
