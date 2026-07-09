"use client";

import { useMemo, useState } from "react";
import {
  deriveStatus,
  type Race as RaceFacts,
  type Urgency,
} from "@/lib/deriveStatus";

export type Race = RaceFacts & {
  series: string;
  country: string | null;
  entryRequirement: string | null;
  distances: string[];
  officialUrl: string;
};

type RaceBrowserProps = {
  races: Race[];
};

const seriesTabs = ["UTMB World Series", "World Trail Majors"] as const;

const urgencyStyles: Record<Urgency, string> = {
  critical: "border-red-500/40 text-red-700 bg-red-50",
  warning: "border-amber-500/40 text-amber-700 bg-amber-50",
  normal: "border-emerald-500/40 text-emerald-700 bg-emerald-50",
  none: "border-zinc-300 text-zinc-600 bg-zinc-100",
};

const registrationTypeLabels: Record<string, string> = {
  lottery: "Lottery",
  fcfs: "First come, first served",
  qualification: "Qualification",
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function RaceBrowser({ races }: RaceBrowserProps) {
  const [activeSeries, setActiveSeries] =
    useState<(typeof seriesTabs)[number]>("UTMB World Series");
  const [activeDistance, setActiveDistance] = useState<string | null>(null);
  // Frozen at first render so server and client agree during hydration.
  const [now] = useState(() => new Date());
  const trailDistanceFilters = ["20K", "50K", "100K", "100M"];

  const visibleRaces = useMemo(() => {
    return races
      .filter((race) => {
        if (race.series !== activeSeries) return false;
        if (activeDistance && !race.distances.includes(activeDistance)) return false;
        return true;
      })
      .map((race) => ({ race, status: deriveStatus(race, now) }))
      .sort((a, b) => a.status.sortKey - b.status.sortKey);
  }, [races, activeSeries, activeDistance, now]);

  return (
    <>
      <section className="mb-4 flex flex-wrap gap-2">
        {seriesTabs.map((series) => (
          <button
            key={series}
            type="button"
            onClick={() => {
              setActiveSeries(series);
              setActiveDistance(null);
            }}
            className={`rounded-full border px-4 py-1.5 text-xs tracking-wide uppercase transition-colors ${
              activeSeries === series
                ? "border-zinc-900 bg-zinc-900 text-zinc-50"
                : "border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
            }`}
          >
            {series}
          </button>
        ))}
      </section>

      <section className="mb-8 flex flex-wrap gap-2">
        {trailDistanceFilters.map((distance) => (
          <button
            key={distance}
            type="button"
            onClick={() =>
              setActiveDistance((currentDistance) =>
                currentDistance === distance ? null : distance,
              )
            }
            className={`rounded-full border px-4 py-1.5 text-xs tracking-wide uppercase transition-colors ${
              activeDistance === distance
                ? "border-zinc-900 bg-zinc-900 text-zinc-50"
                : "border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
            }`}
          >
            {distance}
          </button>
        ))}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white">
        <ul className="divide-y divide-zinc-200">
          {visibleRaces.map(({ race, status }) => (
            <li
              key={race.id}
              className="grid gap-3 px-5 py-5 sm:grid-cols-[1.35fr_1fr_1fr] sm:gap-4 sm:px-7"
            >
              <div>
                <p className="text-lg font-medium tracking-tight text-zinc-900">
                  {race.name}
                </p>
                <a
                  className="mt-1 inline-flex text-sm text-zinc-600 transition-colors hover:text-zinc-900"
                  href={race.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Official site
                </a>
                <p className="mt-1 text-[11px] tracking-[0.12em] text-zinc-500 uppercase">
                  {race.series}
                  {race.country ? ` · ${race.country}` : null}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {race.distances.map((distance) => (
                    <span
                      key={`${race.id}-${distance}`}
                      className="rounded-full border border-zinc-300 px-2 py-0.5 text-[10px] tracking-wide text-zinc-700 uppercase"
                    >
                      {distance}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs tracking-wide text-zinc-500 uppercase">Race Date</p>
                <p className="mt-1 text-sm font-medium text-zinc-800">
                  {formatDate(race.raceDate) ?? "TBA"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Entry: {registrationTypeLabels[race.registrationType]}
                </p>
                {race.entryRequirement ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Requires: {race.entryRequirement}
                  </p>
                ) : null}
              </div>

              <div>
                <p className="text-xs tracking-wide text-zinc-500 uppercase">Registration</p>
                <span
                  className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${urgencyStyles[status.urgency]}`}
                >
                  {status.label}
                </span>
                {formatDate(race.registrationOpens) ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Opens {formatDate(race.registrationOpens)}
                  </p>
                ) : null}
                {formatDate(race.registrationCloses) ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Closes {formatDate(race.registrationCloses)}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {visibleRaces.length === 0 ? (
          <p className="px-5 py-8 text-sm text-zinc-500 sm:px-7">
            No races match the current filters.
          </p>
        ) : null}
      </section>
    </>
  );
}
