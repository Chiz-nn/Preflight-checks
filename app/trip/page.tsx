import TripReport from "@/components/TripReport";

export default async function TripPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await searchParams;
  return (
    <TripReport
      origin={p.origin ?? ""}
      dest={p.dest ?? ""}
      via={p.via}
      date={p.date ?? ""}
      window={p.window ?? "any"}
      traveler={p.traveler}
    />
  );
}
