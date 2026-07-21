/**
 * Syncs every UTMB World Series race in data/races.json against its
 * official site. UTMB subdomains are Next.js apps that embed event dates
 * and per-distance registration status in the __NEXT_DATA__ JSON blob,
 * so no HTML parsing or headless browser is needed.
 *
 * What gets written back (facts only, curated data wins):
 *  - raceDate     when the stored date falls outside the event window
 *                 (i.e. a new edition was announced), or was null
 *  - distances    from the World Series categories, when the site has them
 *  - soldOut      true when every sub-race is sold out, cleared otherwise
 *  - observed     the aggregated registration status + timestamp, used by
 *                 deriveStatus only when no registration dates are known
 *
 * Usage: npm run scrape             dry run — print the would-be changes
 *        npm run scrape -- --write  apply changes to data/races.json
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type RaceRecord = {
  id: string;
  name: string;
  raceDate: string | null;
  distancesKm: number[];
  soldOut?: boolean;
  observed?: { status?: string | null; checkedAt?: string | null } | null;
  officialUrl: string;
};

type Stat = { name?: string; value?: unknown };
type SubRace = {
  name?: string;
  startDate?: string;
  raceStatus?: { status?: string };
  details?: { statsUp?: Stat[]; statsDown?: Stat[] };
};

/**
 * True only for ranked World Series races. Kids races and fun runs carry no
 * `categoryWorldSeries` stat, and their status (often "registration_open"
 * year-round) must not skew the event's aggregate — that's what falsely
 * reported Eiger "open" while its real races were sold out.
 */
function isRankedRace(sub: SubRace): boolean {
  return (sub.details?.statsUp ?? []).some(
    (stat) => stat.name === "categoryWorldSeries",
  );
}

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

/** One status for the whole event: open if anything is open, sold out only
 *  if everything is, otherwise whatever the sub-races agree on. */
function aggregateStatus(statuses: string[]): string | null {
  if (statuses.length === 0) return null;
  if (statuses.some((s) => s === "registration_open")) return "registration_open";
  // charity_bibs_available = general entry is full, only charity spots remain.
  if (statuses.every((s) => s.includes("sold_out") || s === "charity_bibs_available"))
    return "registration_sold_out";
  if (statuses.every((s) => s === "registration_closed")) return "registration_closed";
  if (statuses.some((s) => s === "available_soon")) return "available_soon";
  return statuses[0];
}

async function fetchSite(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "race-reminder/1.0 (+https://github.com/Corresita/race-reminder)" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const html = await response.text();
  const match = html.match(/__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("no __NEXT_DATA__ found (not a utmb.world-style site?)");

  const data = JSON.parse(match[1]) as {
    props?: { pageProps?: { event?: { begin?: string; end?: string } } };
  };
  return {
    begin: data.props?.pageProps?.event?.begin ?? null,
    end: data.props?.pageProps?.event?.end ?? null,
    subRaces: findSubRaces(data) ?? [],
  };
}

/** Update one record in place; returns human-readable change descriptions. */
function applySite(
  race: RaceRecord,
  site: { begin: string | null; end: string | null; subRaces: SubRace[] },
  checkedAt: string,
): string[] {
  const changes: string[] = [];

  // raceDate: keep the curated value while it falls inside the event window;
  // replace it when the site announces a different edition.
  const beginDate = site.begin?.slice(0, 10);
  const endDate = site.end?.slice(0, 10) ?? beginDate;
  const storedDate = race.raceDate?.slice(0, 10);
  if (beginDate && (!storedDate || storedDate < beginDate || storedDate > endDate!)) {
    changes.push(`raceDate ${storedDate ?? "null"} -> ${beginDate}`);
    race.raceDate = beginDate;
  }

  // Real distances in km, straight from each sub-race's official stats.
  const distancesKm = [
    ...new Set(
      site.subRaces.flatMap((sub) =>
        (sub.details?.statsDown ?? [])
          .filter((stat) => stat.name === "distance")
          .map((stat) => Math.round(Number(stat.value)))
          .filter((km) => Number.isFinite(km) && km > 0),
      ),
    ),
  ].sort((a, b) => a - b);
  if (distancesKm.length > 0 && distancesKm.join() !== (race.distancesKm ?? []).join()) {
    changes.push(`distancesKm [${race.distancesKm ?? []}] -> [${distancesKm}]`);
    race.distancesKm = distancesKm;
  }

  // Aggregate over ranked races only; fall back to all sub-races when a site
  // exposes none (so we still get a status rather than nothing).
  const ranked = site.subRaces.filter(isRankedRace);
  const forStatus = ranked.length > 0 ? ranked : site.subRaces;
  const statuses = forStatus
    .map((sub) => sub.raceStatus?.status)
    .filter((s): s is string => Boolean(s));
  let status = aggregateStatus(statuses);

  // Between-editions guard: when the announced event date has rolled to a new
  // edition but the listed races are still the finished one (their start year
  // is older than the event year), their sold-out/closed status is last
  // year's — not the upcoming edition's. Treat it as simply not open yet.
  const eventYear = site.begin ? Number(site.begin.slice(0, 10).slice(0, 4)) : null;
  const startYears = forStatus
    .map((sub) => /\b(20\d{2})\b/.exec(sub.startDate ?? "")?.[1])
    .filter((y): y is string => Boolean(y))
    .map(Number);
  const staleEdition =
    eventYear != null &&
    startYears.length > 0 &&
    startYears.every((y) => y < eventYear);
  if (staleEdition && status !== "registration_open") {
    status = "available_soon";
  }

  const soldOut = status === "registration_sold_out";
  if (soldOut !== Boolean(race.soldOut)) {
    changes.push(`soldOut ${Boolean(race.soldOut)} -> ${soldOut}`);
    if (soldOut) race.soldOut = true;
    else delete race.soldOut;
  }

  // Touch `observed` only when the status actually changed, so scheduled
  // runs with nothing new produce no diff (and therefore no commit).
  if (status && status !== race.observed?.status) {
    changes.push(`observed ${race.observed?.status ?? "none"} -> ${status}`);
    race.observed = { status, checkedAt };
  }

  return changes;
}

async function main() {
  const write = process.argv.includes("--write");
  const racesPath = path.join(process.cwd(), "data", "races.json");
  const races = JSON.parse(await readFile(racesPath, "utf-8")) as RaceRecord[];
  const checkedAt = new Date().toISOString();

  const utmbRaces = races.filter((race) => race.officialUrl.includes("utmb.world"));
  console.log(`Checking ${utmbRaces.length} UTMB races against official sites...`);

  let changed = 0;
  let failed = 0;
  for (const race of utmbRaces) {
    try {
      const site = await fetchSite(race.officialUrl);
      const changes = applySite(race, site, checkedAt);
      if (changes.length > 0) {
        changed += 1;
        console.log(`${race.name}:`);
        for (const change of changes) console.log(`  ${change}`);
      }
    } catch (error) {
      failed += 1;
      console.log(`${race.name}: FAILED — ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`\n${changed} race(s) changed, ${failed} failed.`);
  if (write) {
    await writeFile(racesPath, JSON.stringify(races, null, 2) + "\n");
    console.log("data/races.json updated.");
  } else if (changed > 0) {
    console.log("Dry run — pass --write to apply.");
  }

  // Only fail CI when nothing could be checked at all.
  if (failed === utmbRaces.length && utmbRaces.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
