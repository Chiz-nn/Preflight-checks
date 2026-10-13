"use client";

import { useEffect, useState } from "react";
import { getAirport } from "@/lib/airports";
import type { Level } from "@/lib/types";

const NODE_COLOR: Record<Level | "pending", string> = {
  rebook: "#ff7a6e",
  watch: "#ffc062",
  info: "#7fe0b5",
  pending: "rgba(255,255,255,0.45)",
};

const ROLE = ["Departure", "Connection", "Arrival"];

/**
 * The trip drawn as a flight path. Airports are evenly spaced (this is a
 * diagram, not a map); each node takes the color of its worst signal, and a
 * plane traces the route once when the assessment lands.
 */
export default function RouteArc({ stops, levels }: { stops: string[]; levels?: Record<string, Level> }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);

  const W = 1000;
  const H = 150;
  const pad = 70;
  const y = 110;
  const xs = stops.map((_, i) => pad + (i * (W - 2 * pad)) / (stops.length - 1));
  const lift = stops.length === 2 ? 95 : 70;
  const d = xs
    .slice(1)
    .map((x, i) => {
      const x0 = xs[i];
      return `${i === 0 ? `M${x0},${y}` : ""} Q${(x0 + x) / 2},${y - lift * 2} ${x},${y}`;
    })
    .join(" ");
  const ready = Boolean(levels);
  const roleFor = (i: number) => (i === 0 ? ROLE[0] : i === stops.length - 1 ? ROLE[2] : ROLE[1]);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Route ${stops.join(" to ")}`}>
        <path d={d} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />
        {ready && (
          <path key={stops.join("-")} d={d} pathLength={1} className="arc-path" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" strokeLinecap="round" />
        )}
        {ready && !reduced && (
          <g opacity="0">
            <set attributeName="opacity" to="1" begin="0.2s" />
            <animate attributeName="opacity" from="1" to="0" begin="1.7s" dur="0.4s" fill="freeze" />
            <g>
              <path d="M-9,0 L7,0 M2,-6 L5,0 L2,6 M-6,-3 L-4,0 L-6,3" stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <animateMotion dur="1.6s" begin="0.2s" fill="freeze" rotate="auto" path={d} keySplines="0.65 0 0.35 1" keyTimes="0;1" calcMode="spline" />
          </g>
        )}
        {stops.map((c, i) => {
          const level = levels?.[c];
          const color = NODE_COLOR[level ?? "pending"];
          return (
            <g key={c} transform={`translate(${xs[i]},${y})`}>
              {ready && level && level !== "info" && (
                <circle r="18" fill={color} opacity="0.25">
                  {!reduced && <animate attributeName="r" values="12;22;12" dur="2.4s" repeatCount="indefinite" />}
                </circle>
              )}
              <circle r="9" fill={color} className={ready ? "node-pop" : ""} style={{ animationDelay: `${0.3 + i * 0.5}s`, transformOrigin: "center", transformBox: "fill-box" }} />
              <circle r="3.5" fill="#16264a" />
            </g>
          );
        })}
      </svg>
      <div className="mt-2 grid" style={{ gridTemplateColumns: `repeat(${stops.length}, minmax(0, 1fr))` }}>
        {stops.map((c, i) => (
          <div key={c} className={i === 0 ? "text-left" : i === stops.length - 1 ? "text-right" : "text-center"}>
            <div className="text-3xl font-semibold tracking-[-0.02em] sm:text-5xl">{c}</div>
            <div className="mt-1 text-sm text-white/70">
              {roleFor(i)}, {getAirport(c)?.city.split(",")[0]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
