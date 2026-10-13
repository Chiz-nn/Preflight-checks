import Roster from "@/components/Roster";
import TripForm from "@/components/TripForm";

export default function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Who&apos;s flying, and what could go wrong</h1>
        <p className="mt-1 text-sm text-muted max-w-2xl">
          Each trip gets one call: <b className="text-go">Go</b>, <b className="text-watch">Watch</b>, or <b className="text-rebook">Rebook</b>, with a confidence level and the
          evidence behind it.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
        <Roster />
        <TripForm />
      </div>
    </div>
  );
}
