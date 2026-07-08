import { RaceBrowser, type Race } from "@/app/components/race-browser";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

async function getRaceData() {
  const racesPath = path.join(process.cwd(), "data", "races.json");
  const racesRaw = await readFile(racesPath, "utf-8");
  const races = JSON.parse(racesRaw) as Race[];

  return races.sort(
    (a, b) => new Date(a.raceDate).getTime() - new Date(b.raceDate).getTime(),
  );
}

export default async function Home() {
  const raceData = await getRaceData();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-16 sm:px-10">
      <header className="mb-12 border-b border-zinc-200 pb-8">
        <p className="text-xs font-medium tracking-[0.2em] text-zinc-500 uppercase">
          Race Radar
        </p>
        <h1 className="mt-3 text-3xl font-light tracking-tight text-zinc-900 sm:text-4xl">
          Trail and Ultra Calendar
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-600 sm:text-base">
          Track UTMB World Series and World Trail Majors races, registration
          windows, and never miss an opening.
        </p>
      </header>

      <RaceBrowser races={raceData} />

      <footer className="mt-6 text-xs text-zinc-500">
        Race data is community-maintained. Always confirm dates on the official
        race website before planning.
      </footer>
    </main>
  );
}
