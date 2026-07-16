import { RaceBrowser, type Race } from "@/app/components/race-browser";
import races from "@/data/races.json";

export const dynamic = "force-dynamic";

// Static import so the data ships inside the serverless bundle; a runtime
// readFile would not be traced into the deployment output.
const raceData = races as unknown as Race[];

export default function Home() {

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-16 sm:px-10">
      <header className="mb-12 border-b border-zinc-200 pb-8">
        <p className="text-xs font-medium tracking-[0.2em] text-zinc-500 uppercase">
          Race Reminder
        </p>
        <h1 className="mt-3 text-3xl font-light tracking-tight text-zinc-900 sm:text-4xl">
          Never miss a trail ultra registration.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-600 sm:text-base">
          Opening dates, deadlines, and lottery draws — sorted by what needs
          action next.
        </p>
      </header>

      {/* Server components run once per request, so this is a stable
          per-request timestamp; the client reuses it during hydration. */}
      {/* eslint-disable-next-line react-hooks/purity */}
      <RaceBrowser races={raceData} initialNow={Date.now()} />

      <footer className="mt-6 text-xs text-zinc-500">
        Race data is manually curated. Always confirm dates on the official
        race website before planning.
      </footer>
    </main>
  );
}
