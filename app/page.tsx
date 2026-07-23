import { RaceBrowser, type Race } from "@/app/components/race-browser";
import races from "@/data/races.json";

export const dynamic = "force-dynamic";

// Static import so the data ships inside the serverless bundle; a runtime
// readFile would not be traced into the deployment output.
const raceData = races as unknown as Race[];

export default function Home() {
  return (
    <main className="flex min-h-screen w-full flex-col px-9 py-10 sm:px-15">
      {/* Server components run once per request, so this is a stable
          per-request timestamp; the client reuses it during hydration. */}
      {/* eslint-disable-next-line react-hooks/purity */}
      <RaceBrowser races={raceData} initialNow={Date.now()} />

      <footer className="mt-16 flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-md text-xs text-zinc-500">
          Race data is manually curated. Always confirm dates on the official
          race website before planning.
        </p>
        <p className="font-display text-sm font-semibold tracking-[0.25em] text-zinc-900 uppercase select-none">
          Race_Reminder&trade;
        </p>
      </footer>
    </main>
  );
}
