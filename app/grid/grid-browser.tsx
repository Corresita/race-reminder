"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DotRule } from "@/app/components/dot-rule";
import { type Race, type Series } from "@/app/components/race-browser";
import {
  compareStatus,
  deriveStatus,
  type DerivedStatus,
} from "@/lib/deriveStatus";

/**
 * Client half of the /grid layout experiment: the framed board with the
 * home page's filter controls (series tabs, distance buckets, search) over
 * the index-card grid. Mirrors race-browser's filtering behavior; kept
 * fully separate so the experiment touches no shared files.
 */

const seriesTabs: { slug: Series | null; label: string }[] = [
  { slug: null, label: "All events" },
  { slug: "utmb-world-series", label: "UTMB" },
  { slug: "world-trail-majors", label: "World Majors" },
  { slug: "independent", label: "Independent" },
];

// Same buckets as the home page.
const distanceFilters: {
  id: string;
  label: string;
  match: (km: number) => boolean;
}[] = [
  { id: "sub50", label: "≤50K", match: (km) => km <= 50 },
  { id: "50-100", label: "50–100K", match: (km) => km > 50 && km < 85 },
  { id: "100K", label: "100K", match: (km) => km >= 85 && km < 130 },
  { id: "100M", label: "100M", match: (km) => km >= 130 },
];

type Pill = { label: string; kind: "open" | "waiting" | "closed" };

function pill(status: DerivedStatus): Pill {
  switch (status.code) {
    case "REG_OPEN":
    case "REG_CLOSING_SOON":
    case "LOTTERY_OPEN":
      return { label: "Open now", kind: "open" };
    case "REG_OPENS_SOON":
    case "LOTTERY_OPENS_SOON":
    case "COMPLETED_NEXT_KNOWN":
    case "REG_NOT_OPEN":
      return { label: "Not yet open", kind: "waiting" };
    case "SOLD_OUT":
      return { label: "Sold out", kind: "closed" };
    case "AWAITING_DRAW":
      return { label: "Awaiting draw", kind: "waiting" };
    case "LOTTERY_DRAWN":
      return { label: "Drawn", kind: "closed" };
    case "DATES_TBA":
      return { label: "Dates TBA", kind: "waiting" };
    default:
      return { label: "Closed", kind: "closed" };
  }
}

/** "05 DEC"-style day + month, on the date's own calendar day. */
function fmtShort(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return d
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    })
    .toUpperCase();
}

/** The card's key date row: the next date that matters, mockup-style. */
function dateRow(
  race: Race,
  status: DerivedStatus,
  now: Date,
): { label: string; value: string } {
  const future = (iso: string | null | undefined) =>
    iso && new Date(iso).getTime() > now.getTime() ? iso : null;
  const opens =
    future(race.registrationOpens) ??
    future(race.nextEdition?.registrationOpens);
  const closes = future(race.registrationCloses);
  if (status.code === "AWAITING_DRAW" || status.code === "LOTTERY_DRAWN") {
    const draw = future(race.lotteryDrawDate);
    if (draw) return { label: "Draw", value: fmtShort(draw) };
  }
  if (opens) return { label: "Opens", value: fmtShort(opens) };
  if (closes) return { label: "Closes", value: fmtShort(closes) };
  const raceDay = future(race.raceDate);
  if (raceDay) return { label: "Race day", value: fmtShort(raceDay) };
  return { label: "Dates", value: "TBA" };
}

function countdownValue(status: DerivedStatus): string {
  if (status.daysUntil != null) return `${status.daysUntil}d`;
  switch (status.code) {
    case "REG_OPEN":
    case "REG_CLOSING_SOON":
      return "Open until full";
    case "LOTTERY_OPEN":
      return "Open";
    default:
      return "TBA";
  }
}

const COUNTRY_CODES: Record<string, string> = {
  Andorra: "AND",
  Argentina: "ARG",
  Australia: "AUS",
  Austria: "AUT",
  Brazil: "BRA",
  Canada: "CAN",
  Chile: "CHI",
  China: "CHN",
  "Chinese Taipei": "TPE",
  Croatia: "CRO",
  Ecuador: "ECU",
  France: "FRA",
  Germany: "GER",
  "Hong Kong": "HKG",
  Indonesia: "INA",
  Italy: "ITA",
  Japan: "JPN",
  Latvia: "LAT",
  Malaysia: "MAS",
  Mexico: "MEX",
  "New Zealand": "NZL",
  Oman: "OMA",
  Portugal: "POR",
  Romania: "ROU",
  Slovenia: "SLO",
  "South Africa": "RSA",
  "South Korea": "KOR",
  Spain: "ESP",
  Sweden: "SWE",
  Switzerland: "SUI",
  Thailand: "THA",
  Türkiye: "TUR",
  "United Kingdom": "GBR",
  "United States": "USA",
  Vietnam: "VIE",
};

function action(
  status: DerivedStatus,
  officialUrl: string,
): { label: string; href: string | null } {
  switch (status.code) {
    case "REG_OPEN":
    case "REG_CLOSING_SOON":
      return { label: "Go to register", href: officialUrl };
    case "LOTTERY_OPEN":
      return { label: "Enter ballot", href: officialUrl };
    case "REG_OPENS_SOON":
    case "LOTTERY_OPENS_SOON":
    case "COMPLETED_NEXT_KNOWN":
    case "REG_NOT_OPEN":
      return { label: "Set reminder", href: "/" };
    default:
      return { label: "Closed", href: null };
  }
}

export function GridBrowser({
  races,
  initialNow,
}: {
  races: Race[];
  initialNow: number;
}) {
  const [activeSeries, setActiveSeries] = useState<Series | null>(null);
  const [activeDistance, setActiveDistance] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const now = useMemo(() => new Date(initialNow), [initialNow]);

  // Header counts cover ALL races, like the home page brand bar.
  const counts = useMemo(() => {
    const openGroup = new Set(["REG_OPEN", "REG_CLOSING_SOON", "LOTTERY_OPEN"]);
    const upcomingGroup = new Set([
      "REG_OPENS_SOON",
      "LOTTERY_OPENS_SOON",
      "COMPLETED_NEXT_KNOWN",
      "REG_NOT_OPEN",
      "DATES_TBA",
    ]);
    const statuses = races.map((race) => deriveStatus(race, now));
    const open = statuses.filter((s) => openGroup.has(s.code)).length;
    const upcoming = statuses.filter((s) => upcomingGroup.has(s.code)).length;
    return {
      total: races.length,
      open,
      upcoming,
      closed: races.length - open - upcoming,
    };
  }, [races, now]);

  const rows = useMemo(() => {
    const activeFilter = distanceFilters.find((f) => f.id === activeDistance);
    const query = searchQuery.trim().toLowerCase();
    const result: { race: Race; status: DerivedStatus }[] = [];
    for (const race of races) {
      if (activeSeries && race.series !== activeSeries) continue;
      if (activeFilter && !race.distancesKm.some(activeFilter.match)) continue;
      if (
        query &&
        !`${race.name} ${race.country ?? ""}`.toLowerCase().includes(query)
      )
        continue;
      result.push({ race, status: deriveStatus(race, now) });
    }
    result.sort((a, b) => compareStatus(a.status, b.status));
    return result;
  }, [races, activeSeries, activeDistance, searchQuery, now]);

  return (
    <main className="flex min-h-screen w-full flex-col px-9 py-10 sm:px-15">
      <p className="mb-4 text-xs text-zinc-500">
        Layout experiment — the{" "}
        <Link href="/" className="underline underline-offset-2">
          live site
        </Link>{" "}
        is unchanged.
      </p>

      {/* Site header, as on the home page */}
      <header className="mb-10">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5">
          <div>
            <p className="font-display text-base font-semibold tracking-[0.2em] text-zinc-900 uppercase">
              Race Reminder™
            </p>
            <h1 className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600">
              Know the day registration opens. Every lottery draw, every
              deadline that matters{" "}
              <span className="inline-block">
                — for the trail ultras you&rsquo;re chasing.
              </span>
            </h1>
          </div>
          <div className="flex gap-6 text-xs tracking-wide uppercase">
            <span className="text-zinc-500">
              <span className="mr-1.5 font-semibold text-zinc-900">
                {counts.total}
              </span>
              races
            </span>
            <span className="text-zinc-500">
              <span className="mr-1.5 font-semibold text-zinc-900">
                {counts.open}
              </span>
              open
            </span>
            <span className="text-zinc-500">
              <span className="mr-1.5 font-semibold text-zinc-900">
                {counts.upcoming}
              </span>
              upcoming
            </span>
            <span className="text-zinc-500">
              <span className="mr-1.5 font-semibold text-zinc-900">
                {counts.closed}
              </span>
              closed
            </span>
          </div>
        </div>
        <DotRule />
      </header>

      {/* Controls row: series tabs · distance buckets · search */}
      <section className="mb-8 flex flex-wrap items-center gap-2">
        {seriesTabs.map((tab) => (
          <button
            key={tab.slug ?? "all"}
            type="button"
            onClick={() => {
              setActiveSeries(tab.slug);
              setActiveDistance(null);
            }}
            className={`rounded-full border px-4 py-1.5 text-xs tracking-wide uppercase transition-colors ${
              activeSeries === tab.slug
                ? "border-zinc-900 bg-zinc-900 text-zinc-50"
                : "border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
            }`}
          >
            {tab.label}
          </button>
        ))}

        <span
          aria-hidden
          className="mx-1 hidden h-5 w-px bg-zinc-300 sm:block"
        />

        {distanceFilters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() =>
              setActiveDistance((current) =>
                current === filter.id ? null : filter.id,
              )
            }
            className={`rounded-full border px-4 py-1.5 text-xs tracking-wide uppercase transition-colors ${
              activeDistance === filter.id
                ? "border-zinc-900 bg-zinc-900 text-zinc-50"
                : "border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
            }`}
          >
            {filter.label}
          </button>
        ))}

        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search races…"
          aria-label="Search races by name or country"
          className="ml-auto w-full min-w-40 rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none sm:w-56"
        />
      </section>

      {/* The framed board holds ONLY the races. rounded-2xl + overflow-hidden
          rounds the outer corners of the first and last rows; every interior
          hairline stays straight. Hairlines are painted as per-cell borders
          (not a bg showing through gaps) so the leftover space in a partial
          last row shows the page background, never the line color; the -1px
          margins tuck the outer edge borders under the frame's own border. */}
      <div className="overflow-hidden rounded-2xl border border-zinc-300 bg-white">
        {rows.length > 0 ? (
          <ul className="bg-background -mr-px -mb-px grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rows.map(({ race, status }, i) => {
              const p = pill(status);
              const act = action(status, race.officialUrl);
              const date = dateRow(race, status, now);
              const code = race.country
                ? (COUNTRY_CODES[race.country] ?? race.country.toUpperCase())
                : "TBA";
              const year = race.raceDate?.slice(0, 4) ?? "TBA";
              return (
                <li
                  key={race.id}
                  className="flex flex-col border-r border-b border-zinc-300 bg-white"
                >
                  <div className="flex grow flex-col px-6 pt-5 pb-6">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-mono text-[11px] tracking-wide text-zinc-400">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          p.kind === "open"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : p.kind === "waiting"
                              ? "border-zinc-300 text-zinc-600"
                              : "border-zinc-200 text-zinc-400"
                        }`}
                      >
                        {p.label}
                      </span>
                    </div>

                    <h2 className="mt-2 text-lg leading-snug font-medium tracking-tight text-zinc-900">
                      {race.name}
                    </h2>
                    <p className="mt-1 text-[11px] tracking-[0.12em] text-zinc-500 uppercase">
                      {code}_{year}
                    </p>

                    <div className="mt-auto pt-6">
                      <div className="border-t border-zinc-200 pt-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <p>
                            <span className="block text-xs tracking-wide text-zinc-500 uppercase">
                              {date.label}
                            </span>
                            <span className="mt-1 block text-sm font-medium text-zinc-800">
                              {date.value}
                            </span>
                          </p>
                          <p className="text-right">
                            <span className="block text-xs tracking-wide text-zinc-500 uppercase">
                              Type
                            </span>
                            <span className="mt-1 block text-sm font-medium text-zinc-800 uppercase">
                              {race.registrationType === "lottery"
                                ? "Lottery"
                                : "FCFS"}
                            </span>
                          </p>
                        </div>
                        <p className="mt-3">
                          <span className="block text-[11px] tracking-[0.12em] text-zinc-500 uppercase">
                            Countdown
                          </span>
                          <span className="mt-2 block font-mono text-lg leading-none font-semibold tracking-tight text-zinc-800">
                            {countdownValue(status)}
                          </span>
                        </p>
                      </div>
                      {act.href ? (
                        <a
                          href={act.href}
                          target={act.href === "/" ? undefined : "_blank"}
                          rel={act.href === "/" ? undefined : "noopener"}
                          className="mt-5 block border border-zinc-400 px-4 py-2.5 text-center text-[11px] font-semibold tracking-[0.15em] text-zinc-900 uppercase transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                        >
                          {act.label}
                        </a>
                      ) : (
                        <p className="mt-5 border border-zinc-200 px-4 py-2.5 text-center text-[11px] tracking-[0.15em] text-zinc-400 uppercase select-none">
                          {act.label}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-6 py-10 text-sm text-zinc-500 sm:px-8">
            No races match the current filters.
          </p>
        )}
      </div>

      {/* Site footer, as on the home page */}
      <footer className="mt-16">
        <DotRule />
        <div className="flex flex-wrap items-end justify-between gap-4 pt-5">
          <p className="max-w-md text-xs text-zinc-500">
            Race data is manually curated. Always confirm dates on the official
            race website before planning.
          </p>
          <p className="font-display text-base text-zinc-900 uppercase select-none">
            <span className="tracking-[0.1em]">&copy;2026</span>{" "}
            <span className="font-semibold tracking-[0.2em]">
              Race&nbsp;Reminder
            </span>
          </p>
        </div>
      </footer>
    </main>
  );
}
