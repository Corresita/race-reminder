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

function factRow(status: DerivedStatus): { label: string; value: string } {
  const d = status.daysUntil;
  switch (status.code) {
    case "REG_OPEN":
    case "REG_CLOSING_SOON":
      return d != null
        ? { label: "Reg closes", value: `${d} days` }
        : { label: "Reg closes", value: "Until full" };
    case "LOTTERY_OPEN":
      return d != null
        ? { label: "Ballot ends", value: `${d} days` }
        : { label: "Ballot", value: "Open" };
    case "REG_OPENS_SOON":
    case "LOTTERY_OPENS_SOON":
      return { label: "Opens in", value: d != null ? `${d} days` : "TBA" };
    case "COMPLETED_NEXT_KNOWN":
      return { label: "Next opens", value: d != null ? `${d} days` : "TBA" };
    case "AWAITING_DRAW":
      return { label: "Draw in", value: d != null ? `${d} days` : "TBA" };
    case "SOLD_OUT":
      return { label: "Result", value: "Sold out" };
    default:
      return { label: "Next cycle", value: "TBA" };
  }
}

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
      return { label: "Set reminder on home", href: "/" };
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
                {closedCount}
              </span>
              closed
            </span>
          </div>
        </div>
        <DotRule />
      </header>

      <div className="border border-zinc-300 bg-white">
        {/* The grid: hairlines between cells via gap-px over the frame color */}
        <ul className="grid grid-cols-1 gap-px bg-zinc-300 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {rows.map(({ race, status }, i) => {
            const p = pill(status);
            const fact = factRow(status);
            const act = action(status, race.officialUrl);
            const seriesTag =
              race.series === "utmb-world-series"
                ? "UTMB World Series"
                : race.series === "world-trail-majors"
                  ? "World Trail Majors"
                  : "Independent";
            const maxDistance =
              race.distancesKm && race.distancesKm.length > 0
                ? `${Math.max(...race.distancesKm)} km`
                : null;
            return (
              <li key={race.id} className="flex flex-col bg-white">
                <div className="flex grow flex-col px-5 pt-5 pb-5">
                  <p className="text-[10px] font-semibold tracking-[0.15em] text-zinc-900 uppercase">
                    Event_{String(i + 1).padStart(2, "0")}
                  </p>
                  <span
                    aria-hidden
                    className="mt-1 block h-[2px] w-4 bg-zinc-900"
                  />
                  <p className="mt-4">
                    <span className="bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-50 uppercase">
                      {seriesTag}
                    </span>
                  </p>
                  <h2 className="mt-2.5 text-xl leading-snug font-medium text-zinc-900">
                    {race.name}
                  </h2>
                  <div className="mt-6 text-xs leading-relaxed text-zinc-600">
                    <p>
                      Loc: {race.country ?? "TBA"} ·{" "}
                      {race.raceDate?.slice(0, 4) ?? "TBA"}
                    </p>
                    {maxDistance ? <p>Dist: {maxDistance}</p> : null}
                  </div>

                  <div className="mt-auto pt-4">
                    <div className="flex items-center justify-between border-t border-zinc-200 py-2.5">
                      <span className="text-[11px] tracking-wide text-zinc-500 uppercase">
                        Status
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] tracking-wide uppercase ${
                          p.kind === "open"
                            ? "bg-zinc-900 text-zinc-50"
                            : p.kind === "waiting"
                              ? "border border-zinc-300 text-zinc-700"
                              : "border border-zinc-200 text-zinc-400"
                        }`}
                      >
                        {p.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-zinc-200 py-2.5">
                      <span className="text-[11px] tracking-wide text-zinc-500 uppercase">
                        {fact.label}
                      </span>
                      <span className="font-mono text-sm font-semibold text-zinc-800">
                        {fact.value}
                      </span>
                    </div>
                    {act.href ? (
                      <a
                        href={act.href}
                        target={act.href === "/" ? undefined : "_blank"}
                        rel={act.href === "/" ? undefined : "noopener"}
                        className="mt-2 block border border-zinc-400 px-4 py-2.5 text-center text-[11px] font-semibold tracking-[0.15em] text-zinc-900 uppercase transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                      >
                        {act.label}
                      </a>
                    ) : (
                      <p className="mt-2 border border-zinc-200 px-4 py-2.5 text-center text-[11px] tracking-[0.15em] text-zinc-400 uppercase select-none">
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
