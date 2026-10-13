import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Preflight Checks",
  description: "Travel disruption risk for operations teams: FAA, NWS, aviation forecasts, and BTS history in one view.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <header className="bg-ink text-paper">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between">
            <Link href="/" className="font-mono text-sm tracking-[0.2em] uppercase">
              Preflight<span className="text-[#f5b84a]">/</span>Checks
            </Link>
            <span className="text-xs text-paper/60 hidden sm:block">Ops travel desk · signed in as Operations Admin</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 sm:px-6 pb-10 text-xs text-muted">
          Data: FAA NAS Status, National Weather Service, NOAA AviationWeather.gov TAFs, Bureau of Transportation Statistics. Explanations by Google Gemini.
        </footer>
      </body>
    </html>
  );
}
