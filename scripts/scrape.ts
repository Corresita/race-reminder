/**
 * Checks every UTMB World Series race in data/races.json against its
 * official site. UTMB subdomains are Next.js apps that embed event dates
 * and per-distance registration status in the __NEXT_DATA__ JSON blob,
 * so no HTML parsing or headless browser is needed.
 *
 * Usage: npm run scrape
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

type RaceRecord = {
  id: string;
  name: string;
  raceDate: string | null;
  officialUrl: string;
};

type SubRace = {
  name?: string;
  startDate?: string;
  raceStatus?: { status?: string };
};

function findSubRaces(node: unknown): SubRace[] | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findSubRaces(item);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    const races = record.races;
    if (
      Array.isArray(races) &&
      races.length > 0 &&
      typeof races[0] === "object" &&
      races[0] !== null &&
      "raceStatus" in (races[0] as object)
    ) {
      return races as SubRace[];
    }
    for (const value of Object.values(record)) {
      const found = findSubRaces(value);
      if (found) return found;
    }
  }
  return null;
}

async function checkRace(race: RaceRecord) {
  const response = await fetch(race.officialUrl, {
    headers: { "user-agent": "race-reminder/1.0 (+https://github.com/Corresita/race-reminder)" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const match = html.match(/__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error("no __NEXT_DATA__ found (not a utmb.world-style site?)");
  }

  const data = JSON.parse(match[1]) as {
    props?: { pageProps?: { event?: { name?: string; eventDate?: string; begin?: string } } };
  };
  const event = data.props?.pageProps?.event;

  console.log(`\n${race.name} (${race.id})`);
  console.log(`  local:  raceDate=${race.raceDate?.slice(0, 10) ?? "TBA"}`);
  console.log(`  remote: ${event?.eventDate ?? "?"} (begin=${event?.begin?.slice(0, 10) ?? "?"})`);

  for (const sub of findSubRaces(data) ?? []) {
    console.log(`    - ${sub.name}: ${sub.raceStatus?.status ?? "?"} (${sub.startDate ?? "?"})`);
  }
}

async function main() {
  const racesPath = path.join(process.cwd(), "data", "races.json");
  const races = JSON.parse(await readFile(racesPath, "utf-8")) as RaceRecord[];

  const utmbRaces = races.filter((race) => race.officialUrl.includes("utmb.world"));
  console.log(`Checking ${utmbRaces.length} UTMB races against official sites...`);

  for (const race of utmbRaces) {
    try {
      await checkRace(race);
    } catch (error) {
      console.log(`\n${race.name} (${race.id})`);
      console.log(`  FAILED: ${error instanceof Error ? error.message : error}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
