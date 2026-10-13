import type { Metadata } from "next";
import Link from "next/link";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Preflight Checks",
  description: "Travel disruption risk for operations teams: FAA, NWS, aviation forecasts, and BTS history in one view.",
};

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 17c5-9 13-9 18 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="3" cy="17" r="2" fill="currentColor" />
      <circle cx="21" cy="17" r="2" fill="currentColor" />
      <circle cx="12" cy="10.3" r="1.6" fill="#a9c6ee" />
    </svg>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body className="min-h-screen">
        <header className="absolute inset-x-0 top-0 z-20">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 text-white sm:px-6">
            <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
              <Mark />
              Preflight Checks
            </Link>
            <span className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 ring-1 ring-white/15 backdrop-blur sm:flex">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-300" />
              </span>
              Live data from FAA, NWS and NOAA
            </span>
          </div>
        </header>
        {children}
        <footer className="mx-auto max-w-6xl px-4 pb-12 pt-4 text-xs text-ink-3 sm:px-6">
          Sources: FAA NAS Status, National Weather Service, NOAA AviationWeather.gov, Bureau of Transportation Statistics. Briefings written by Google Gemini.
        </footer>
      </body>
    </html>
  );
}
