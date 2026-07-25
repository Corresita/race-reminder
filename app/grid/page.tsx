import type { Metadata } from "next";
import Link from "next/link";
import { DotRule } from "@/app/components/dot-rule";
import { type Race } from "@/app/components/race-browser";
import races from "@/data/races.json";
import {
  compareStatus,
  deriveStatus,
  type DerivedStatus,
} from "@/lib/deriveStatus";

/**
 * /grid — LAYOUT EXPERIMENT, not linked from anywhere.
 *
 * A gallery-grid take on the race list (one big framed board, every race a
 * boxed cell), modeled on the REG-CHECK mockup. Read-only: same data and
 * status derivation as the home page, but no filters and no subscribe
 * actions. The home page is untouched; delete this folder to remove the
 * experiment.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Race Reminder — grid layout test",
  robots: { index: false },
};

const raceData = races as unknown as Race[];

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
  if (status.daysUntil != null) {
    return `${status.daysUntil} ${status.daysUntil === 1 ? "DAY" : "DAYS"}`;
  }
  switch (status.code) {
    case "REG_OPEN":
    case "REG_CLOSING_SOON":
      return "UNTIL FULL";
    case "LOTTERY_OPEN":
      return "OPEN";
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

export default function GridTest() {
  const now = new Date();
  const rows = raceData
    .map((race) => ({ race, status: deriveStatus(race, now) }))
    .sort((a, b) => compareStatus(a.status, b.status));

  // Same grouping as the home page's STATUS_GROUPS (kept local so the
  // experiment touches no shared files).
  const openGroup = new Set(["REG_OPEN", "REG_CLOSING_SOON", "LOTTERY_OPEN"]);
  const upcomingGroup = new Set([
    "REG_OPENS_SOON",
    "LOTTERY_OPENS_SOON",
    "COMPLETED_NEXT_KNOWN",
    "REG_NOT_OPEN",
    "DATES_TBA",
  ]);
  const counts = {
    total: rows.length,
    open: rows.filter((r) => openGroup.has(r.status.code)).length,
    upcoming: rows.filter((r) => upcomingGroup.has(r.status.code)).length,
  };
  const closedCount = counts.total - counts.open - counts.upcoming;

  return (
    <main className="flex min-h-screen w-full flex-col px-9 py-10 sm:px-15">
      <p className="mb-4 text-xs text-zinc-500">
        Layout experiment — the{" "}
        <Link href="/" className="underline underline-offset-2">
          live site
        </Link>{" "}
        is unchanged.
      </p>

      {/* One framed board, mockup-style: header bar + hero + grid inside */}
      <div className="border border-zinc-300 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-300 px-6 py-4 sm:px-8">
          <p className="font-display text-base font-semibold tracking-[0.2em] text-zinc-900 uppercase">
            Race Reminder™
          </p>
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
                {closedCount}
              </span>
              closed
            </span>
          </div>
        </div>
        <div className="border-b border-zinc-300 px-6 py-8 sm:px-8">
          <h1 className="max-w-2xl text-sm leading-relaxed text-zinc-600">
            Know the day registration opens. Every lottery draw, every deadline
            that matters{" "}
            <span className="inline-block">
              — for the trail ultras you&rsquo;re chasing.
            </span>
          </h1>
        </div>

        {/* The grid: hairlines between cells via gap-px over the frame color */}
        <ul className="grid grid-cols-1 gap-px bg-zinc-300 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {rows.map(({ race, status }, i) => {
            const p = pill(status);
            const act = action(status, race.officialUrl);
            const date = dateRow(race, status, now);
            const code = race.country
              ? (COUNTRY_CODES[race.country] ?? race.country.toUpperCase())
              : "TBA";
            const year = race.raceDate?.slice(0, 4) ?? "TBA";
            return (
              <li key={race.id} className="flex flex-col bg-white">
                <div className="flex grow flex-col px-6 pt-6 pb-6">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-3xl leading-none font-bold text-zinc-300">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`max-w-24 text-right text-[11px] leading-tight font-bold tracking-wide uppercase ${
                        p.kind === "open"
                          ? "text-zinc-900"
                          : p.kind === "waiting"
                            ? "text-zinc-500"
                            : "text-zinc-400"
                      }`}
                    >
                      {p.label}
                    </span>
                  </div>

                  <h2 className="mt-8 text-[1.35rem] leading-[1.1] font-extrabold tracking-tight text-zinc-900 uppercase">
                    {race.name}
                    <br />
                    <span className="text-zinc-400">
                      {code}_{year}
                    </span>
                  </h2>

                  <div className="mt-auto pt-8">
                    <div className="border-t border-zinc-200 pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <p>
                          <span className="block text-[10px] font-semibold tracking-[0.12em] text-zinc-500 uppercase">
                            {date.label}
                          </span>
                          <span className="text-[1.0125rem] font-bold text-zinc-900">
                            {date.value}
                          </span>
                        </p>
                        <p className="text-right">
                          <span className="block text-[10px] font-semibold tracking-[0.12em] text-zinc-500 uppercase">
                            Type
                          </span>
                          <span className="text-[1.0125rem] font-bold text-zinc-900 uppercase">
                            {race.registrationType === "lottery"
                              ? "Lottery"
                              : "FCFS"}
                          </span>
                        </p>
                      </div>
                      <p className="mt-3">
                        <span className="block text-[10px] font-semibold tracking-[0.12em] text-zinc-500 uppercase">
                          Countdown
                        </span>
                        <span className="text-[1.6875rem] leading-none font-extrabold tracking-tight text-zinc-900">
                          {countdownValue(status)}
                        </span>
                      </p>
                    </div>
                    {act.href ? (
                      <a
                        href={act.href}
                        target={act.href === "/" ? undefined : "_blank"}
                        rel={act.href === "/" ? undefined : "noopener"}
                        className="mt-5 block border border-zinc-400 px-4 py-3 text-center text-[11px] font-bold tracking-[0.15em] text-zinc-900 uppercase transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                      >
                        {act.label}
                      </a>
                    ) : (
                      <p className="mt-5 border border-zinc-200 px-4 py-3 text-center text-[11px] tracking-[0.15em] text-zinc-400 uppercase select-none">
                        {act.label}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
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
