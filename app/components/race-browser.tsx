"use client";

import { useEffect, useMemo, useState } from "react";
import {
  compareStatus,
  deriveStatus,
  type DerivedStatus,
  type Race as RaceFacts,
  type Urgency,
} from "@/lib/deriveStatus";

export type Series = "utmb-world-series" | "world-trail-majors" | "independent";

export type Race = RaceFacts & {
  series: Series;
  organizer: string | null;
  country: string | null;
  entryRequirement: string | null;
  entryNotes?: string | null;
  distances: string[];
  officialUrl: string;
};

type RaceBrowserProps = {
  races: Race[];
  /** Server render time (ms). Reused as the client's initial clock so the
   *  hydrated DOM matches the server HTML exactly. */
  initialNow: number;
};

const seriesTabs: { slug: Series; label: string }[] = [
  { slug: "utmb-world-series", label: "UTMB World Series" },
  { slug: "world-trail-majors", label: "World Trail Majors" },
  { slug: "independent", label: "Independent" },
];

const seriesLabels = Object.fromEntries(
  seriesTabs.map((tab) => [tab.slug, tab.label]),
) as Record<Series, string>;

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

const EMAIL_STORAGE_KEY = "race-reminder-email";
const SUBSCRIPTIONS_STORAGE_KEY = "race-reminder-subscriptions";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function RaceBrowser({ races, initialNow }: RaceBrowserProps) {
  const [activeSeries, setActiveSeries] = useState<Series>("utmb-world-series");
  const [activeDistance, setActiveDistance] = useState<string | null>(null);
  const [now] = useState(() => new Date(initialNow));
  const trailDistanceFilters = ["20K", "50K", "100K", "100M"];

  // Subscription state lives in localStorage; loaded after mount so the
  // server-rendered HTML and the first client render agree.
  const [email, setEmail] = useState<string | null>(null);
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [emailFormRaceId, setEmailFormRaceId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [busyRaceId, setBusyRaceId] = useState<string | null>(null);
  const [subscribeError, setSubscribeError] = useState<{
    raceId: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    setEmail(localStorage.getItem(EMAIL_STORAGE_KEY));
    try {
      const raw = localStorage.getItem(SUBSCRIPTIONS_STORAGE_KEY);
      if (raw) setSubscribedIds(new Set(JSON.parse(raw) as string[]));
    } catch {
      // Corrupt storage — start fresh.
    }
  }, []);

  async function updateSubscription(
    raceId: string,
    subscriberEmail: string,
    subscribe: boolean,
  ) {
    setBusyRaceId(raceId);
    setSubscribeError(null);
    try {
      const response = await fetch("/api/subscribe", {
        method: subscribe ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: subscriberEmail, raceId }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      setSubscribedIds((current) => {
        const next = new Set(current);
        if (subscribe) next.add(raceId);
        else next.delete(raceId);
        localStorage.setItem(
          SUBSCRIPTIONS_STORAGE_KEY,
          JSON.stringify([...next]),
        );
        return next;
      });
      setEmailFormRaceId(null);
    } catch {
      setSubscribeError({
        raceId,
        message: "Could not save — please try again.",
      });
    } finally {
      setBusyRaceId(null);
    }
  }

  function onSubscribeClick(raceId: string) {
    if (subscribedIds.has(raceId) && email) {
      void updateSubscription(raceId, email, false);
      return;
    }
    if (email) {
      void updateSubscription(raceId, email, true);
      return;
    }
    setEmailDraft("");
    setSubscribeError(null);
    setEmailFormRaceId((current) => (current === raceId ? null : raceId));
  }

  function onEmailSubmit(raceId: string) {
    const candidate = emailDraft.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(candidate)) {
      setSubscribeError({ raceId, message: "Please enter a valid email." });
      return;
    }
    localStorage.setItem(EMAIL_STORAGE_KEY, candidate);
    setEmail(candidate);
    void updateSubscription(raceId, candidate, true);
  }

  const { mainRaces, tbaRaces } = useMemo(() => {
    const mainRaces: { race: Race; status: DerivedStatus }[] = [];
    const tbaRaces: { race: Race; status: DerivedStatus }[] = [];

    for (const race of races) {
      if (race.series !== activeSeries) continue;
      if (activeDistance && !race.distances.includes(activeDistance)) continue;
      const status = deriveStatus(race, now);
      (status.code === "DATES_TBA" ? tbaRaces : mainRaces).push({ race, status });
    }
    mainRaces.sort((a, b) => compareStatus(a.status, b.status));

    return { mainRaces, tbaRaces };
  }, [races, activeSeries, activeDistance, now]);

  function renderRace({ race, status }: { race: Race; status: DerivedStatus }) {
    // Only a live window's dates are worth showing; completed editions and
    // closed/drawn/sold-out races would display stale ones.
    const showWindow = status.actionable && !status.completed;
    const opensLabel = showWindow ? formatDate(race.registrationOpens) : null;
    const closesLabel = showWindow ? formatDate(race.registrationCloses) : null;

    return (
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
                  {race.organizer ?? seriesLabels[race.series]}
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
                {race.entryNotes ? (
                  <p className="mt-1 text-xs text-zinc-400">{race.entryNotes}</p>
                ) : null}
              </div>

              <div>
                <p className="text-xs tracking-wide text-zinc-500 uppercase">Registration</p>
                <span
                  className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${urgencyStyles[status.urgency]}`}
                >
                  {status.label}
                </span>
                {opensLabel ? (
                  <p className="mt-1 text-xs text-zinc-500">Opens {opensLabel}</p>
                ) : null}
                {closesLabel ? (
                  <p className="mt-1 text-xs text-zinc-500">Closes {closesLabel}</p>
                ) : null}

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => onSubscribeClick(race.id)}
                    disabled={busyRaceId === race.id}
                    title="Email me when registration opens"
                    className={`rounded-full border px-3 py-1 text-[11px] tracking-wide uppercase transition-colors disabled:opacity-50 ${
                      subscribedIds.has(race.id)
                        ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 hover:border-emerald-600"
                        : "border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
                    }`}
                  >
                    {subscribedIds.has(race.id) ? "Subscribed ✓" : "Subscribe"}
                  </button>

                  {emailFormRaceId === race.id ? (
                    <form
                      className="mt-2 flex flex-wrap gap-1.5"
                      onSubmit={(event) => {
                        event.preventDefault();
                        onEmailSubmit(race.id);
                      }}
                    >
                      <input
                        type="email"
                        autoFocus
                        required
                        value={emailDraft}
                        onChange={(event) => setEmailDraft(event.target.value)}
                        placeholder="you@example.com"
                        className="w-40 rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={busyRaceId === race.id}
                        className="rounded-full border border-zinc-900 bg-zinc-900 px-3 py-1 text-[11px] tracking-wide text-zinc-50 uppercase disabled:opacity-50"
                      >
                        OK
                      </button>
                    </form>
                  ) : null}

                  {subscribeError?.raceId === race.id ? (
                    <p className="mt-1 text-xs text-red-600">
                      {subscribeError.message}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
    );
  }

  return (
    <>
      <section className="mb-4 flex flex-wrap gap-2">
        {seriesTabs.map((tab) => (
          <button
            key={tab.slug}
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

      {mainRaces.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white">
          <ul className="divide-y divide-zinc-200">{mainRaces.map(renderRace)}</ul>
        </section>
      ) : null}

      {mainRaces.length === 0 && tbaRaces.length === 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white">
          <p className="px-5 py-8 text-sm text-zinc-500 sm:px-7">
            No races match the current filters.
          </p>
        </section>
      ) : null}

      {tbaRaces.length > 0 ? (
        <details className="mt-4 rounded-2xl border border-zinc-200 bg-white">
          <summary className="cursor-pointer px-5 py-4 text-sm text-zinc-600 select-none hover:text-zinc-900 sm:px-7">
            Awaiting dates ({tbaRaces.length}) — announced races without a
            registration window yet
          </summary>
          <ul className="divide-y divide-zinc-200 border-t border-zinc-200">
            {tbaRaces.map(renderRace)}
          </ul>
        </details>
      ) : null}
    </>
  );

}
