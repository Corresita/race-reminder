"use client";

import { useEffect, useMemo, useState } from "react";
import {
  compareStatus,
  deriveStatus,
  type DerivedStatus,
  type Race as RaceFacts,
  type Urgency,
} from "@/lib/deriveStatus";
import { reminderAffordance } from "@/lib/reminderAffordance";

export type Series = "utmb-world-series" | "world-trail-majors" | "independent";

export type Race = RaceFacts & {
  series: Series;
  organizer: string | null;
  country: string | null;
  entryRequirement: string | null;
  entryNotes?: string | null;
  /** Real course distances in km, per the organizer. */
  distancesKm: number[];
  officialUrl: string;
};

type RaceBrowserProps = {
  races: Race[];
  /** Server render time (ms). Reused as the client's initial clock so the
   *  hydrated DOM matches the server HTML exactly. */
  initialNow: number;
};

const seriesTabs: { slug: Series | null; label: string }[] = [
  { slug: null, label: "All Events" },
  { slug: "utmb-world-series", label: "UTMB" },
  { slug: "world-trail-majors", label: "World Majors" },
  { slug: "independent", label: "Independent" },
];

const seriesLabels: Record<Series, string> = {
  "utmb-world-series": "UTMB World Series",
  "world-trail-majors": "World Trail Majors",
  independent: "Independent",
};

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

// Status groups behind the clickable header counts.
const STATUS_GROUPS: Record<"open" | "closed", Set<DerivedStatus["code"]>> = {
  open: new Set(["REG_OPEN", "REG_CLOSING_SOON", "LOTTERY_OPEN"]),
  closed: new Set([
    "REG_CLOSED",
    "SOLD_OUT",
    "LOTTERY_DRAWN",
    "AWAITING_DRAW",
    "COMPLETED_NEXT_KNOWN",
    "COMPLETED_NEXT_TBA",
  ]),
};

const shortStatusLabels: Record<DerivedStatus["code"], string> = {
  REG_OPENS_SOON: "Not yet open",
  LOTTERY_OPENS_SOON: "Not yet open",
  REG_OPEN: "Open now",
  REG_CLOSING_SOON: "Closing soon",
  LOTTERY_OPEN: "Ballot open",
  AWAITING_DRAW: "Awaiting draw",
  LOTTERY_DRAWN: "Ballot drawn",
  REG_CLOSED: "Closed",
  SOLD_OUT: "Sold out",
  COMPLETED_NEXT_KNOWN: "Completed",
  COMPLETED_NEXT_TBA: "Completed",
  REG_NOT_OPEN: "Not open yet",
  DATES_TBA: "Dates TBA",
};

/** The card's big number: what to count down to (or the terminal state). */
function countdownRow(status: DerivedStatus): { label: string; value: string } {
  const days = status.daysUntil != null ? `${status.daysUntil}d` : null;
  switch (status.code) {
    case "REG_OPENS_SOON":
    case "LOTTERY_OPENS_SOON":
      return { label: "Opens in", value: days ?? "TBA" };
    case "COMPLETED_NEXT_KNOWN":
      return { label: "Next edition opens in", value: days ?? "TBA" };
    case "REG_OPEN":
    case "REG_CLOSING_SOON":
      // Open with no announced deadline — a truthful mechanism, not a blank.
      return days
        ? { label: "Closes in", value: days }
        : { label: "Status", value: "Open until full" };
    case "LOTTERY_OPEN":
      return days
        ? { label: "Ballot ends in", value: days }
        : { label: "Ballot", value: "Open" };
    case "AWAITING_DRAW":
      return { label: "Draw in", value: days ?? "TBA" };
    case "LOTTERY_DRAWN":
      return { label: "Ballot", value: "Drawn" };
    case "SOLD_OUT":
      return { label: "Status", value: "Sold out" };
    case "REG_CLOSED":
    case "COMPLETED_NEXT_TBA":
      return { label: "Next cycle", value: "TBA" };
    case "REG_NOT_OPEN":
      return { label: "Registration", value: "Opens later" };
    default:
      return { label: "Dates", value: "TBA" };
  }
}

// Distance-range buckets over real km, so a 70K race is findable as
// 50–100K instead of hiding behind an official "50K" category tag.
const distanceFilters: { id: string; label: string; match: (km: number) => boolean }[] = [
  { id: "sub50", label: "≤50K", match: (km) => km <= 50 },
  { id: "50-100", label: "50–100K", match: (km) => km > 50 && km < 85 },
  { id: "100K", label: "100K", match: (km) => km >= 85 && km < 130 },
  { id: "100M", label: "100M", match: (km) => km >= 130 },
];

const EMAIL_STORAGE_KEY = "race-reminder-email";
const SUBSCRIPTIONS_STORAGE_KEY = "race-reminder-subscriptions";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  // The offset in the ISO string is the race's own timezone, so the
  // authored calendar date (the part before "T") is the intended day.
  // Render that fixed date in UTC so it never shifts with the viewer's
  // timezone — e.g. "2026-07-30T00:00+08:00" always reads Jul 30.
  const parsed = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function RaceBrowser({ races, initialNow }: RaceBrowserProps) {
  const [activeSeries, setActiveSeries] = useState<Series | null>(null);
  const [activeDistance, setActiveDistance] = useState<string | null>(null);
  const [activeStatusGroup, setActiveStatusGroup] = useState<
    "open" | "closed" | null
  >(null);
  const [now] = useState(() => new Date(initialNow));

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

  // Global counts for the header, independent of any active filter.
  const counts = useMemo(() => {
    const statuses = races.map((race) => deriveStatus(race, now));
    return {
      total: races.length,
      open: statuses.filter((s) => STATUS_GROUPS.open.has(s.code)).length,
      closed: statuses.filter((s) => STATUS_GROUPS.closed.has(s.code)).length,
    };
  }, [races, now]);

  const { actionableRaces, sunkRaces, tbaRaces } = useMemo(() => {
    const actionableRaces: { race: Race; status: DerivedStatus }[] = [];
    const sunkRaces: { race: Race; status: DerivedStatus }[] = [];
    const tbaRaces: { race: Race; status: DerivedStatus }[] = [];

    const activeFilter = distanceFilters.find((f) => f.id === activeDistance);
    const statusGroup = activeStatusGroup
      ? STATUS_GROUPS[activeStatusGroup]
      : null;
    for (const race of races) {
      if (activeSeries && race.series !== activeSeries) continue;
      if (activeFilter && !race.distancesKm.some(activeFilter.match)) continue;
      const status = deriveStatus(race, now);
      if (statusGroup && !statusGroup.has(status.code)) continue;
      // "Awaiting dates" fold: no registration window yet — unknown dates, or
      // a known date whose registration hasn't opened.
      if (status.code === "DATES_TBA" || status.code === "REG_NOT_OPEN") {
        tbaRaces.push({ race, status });
      } else if (status.actionable) {
        actionableRaces.push({ race, status });
      } else {
        sunkRaces.push({ race, status });
      }
    }
    actionableRaces.sort((a, b) => compareStatus(a.status, b.status));
    sunkRaces.sort((a, b) => compareStatus(a.status, b.status));

    return { actionableRaces, sunkRaces, tbaRaces };
  }, [races, activeSeries, activeDistance, activeStatusGroup, now]);

  function renderRace(
    { race, status }: { race: Race; status: DerivedStatus },
    index: number,
  ) {
    // Only a live window's dates are worth showing; completed editions and
    // closed/drawn/sold-out races would display stale ones.
    const showWindow = status.actionable && !status.completed;
    const opensLabel = showWindow ? formatDate(race.registrationOpens) : null;
    const closesLabel = showWindow ? formatDate(race.registrationCloses) : null;
    const countdown = countdownRow(status);
    const year = race.raceDate ? race.raceDate.slice(0, 4) : null;
    const affordance = reminderAffordance(race, status);
    const subscribed = subscribedIds.has(race.id);

    return (
      <li
        key={race.id}
        className={`grid gap-3 rounded-2xl bg-white px-5 py-5 sm:grid-cols-[1.35fr_1fr_1fr] sm:gap-4 sm:px-7 ${
          status.actionable ||
          status.code === "DATES_TBA" ||
          status.code === "REG_NOT_OPEN"
            ? ""
            : "opacity-60"
        }`}
      >
              <div>
                <p className="font-mono text-[11px] tracking-wide text-zinc-400">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <a
                  href={race.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg font-medium tracking-tight text-zinc-900 transition-colors hover:text-zinc-500"
                >
                  {race.name}
                </a>
                <p className="mt-1 text-[11px] tracking-[0.12em] text-zinc-500 uppercase">
                  {race.organizer ?? seriesLabels[race.series]}
                  {race.country ? ` · ${race.country}` : null}
                  {year ? ` · ${year}` : null}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {race.distancesKm.map((km) => (
                    <span
                      key={`${race.id}-${km}`}
                      className="rounded-full border border-zinc-300 px-2 py-0.5 text-[10px] tracking-wide text-zinc-700 uppercase"
                    >
                      {km}K
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
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs tracking-wide text-zinc-500 uppercase">
                    Registration
                  </p>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${urgencyStyles[status.urgency]}`}
                  >
                    {shortStatusLabels[status.code]}
                  </span>
                </div>
                <p className="mt-2 text-[11px] tracking-[0.12em] text-zinc-500 uppercase">
                  {countdown.label}
                </p>
                <p className="font-mono text-2xl leading-tight font-semibold tracking-tight text-zinc-900">
                  {countdown.value}
                </p>
                {opensLabel ? (
                  <p className="mt-1 text-xs text-zinc-500">Opens {opensLabel}</p>
                ) : null}
                {closesLabel ? (
                  <p className="mt-1 text-xs text-zinc-500">Closes {closesLabel}</p>
                ) : null}

                <div className="mt-3">
                  {subscribed || affordance.kind === "REMIND_OPEN" || affordance.kind === "REMIND_CLOSE" ? (
                    <button
                      type="button"
                      onClick={() => onSubscribeClick(race.id)}
                      disabled={busyRaceId === race.id}
                      title="Email me when there's something to act on"
                      className={`rounded-full border px-3 py-1 text-[11px] tracking-wide uppercase transition-colors disabled:opacity-50 ${
                        subscribed
                          ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 hover:border-emerald-600"
                          : "border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
                      }`}
                    >
                      {subscribed ? "Reminder set ✓" : affordance.label}
                    </button>
                  ) : affordance.kind === "REGISTER_NOW" ? (
                    <a
                      href={race.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-full border border-zinc-900 bg-zinc-900 px-3 py-1 text-[11px] tracking-wide text-zinc-50 uppercase transition-colors hover:bg-zinc-700"
                    >
                      {affordance.label} ↗
                    </a>
                  ) : (
                    <p className="text-[11px] tracking-wide text-zinc-400 uppercase">
                      {affordance.label}
                    </p>
                  )}

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
      <header className="mb-10">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-300 pb-5">
          <div>
            <p className="font-display text-sm font-semibold tracking-[0.25em] text-zinc-900 uppercase">
              Race Reminder™
            </p>
            <h1 className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600">
              Know the day registration opens. Every lottery draw, every
              deadline that matters — for the trail ultras you&rsquo;re chasing.
            </h1>
          </div>
          <div className="flex gap-6 text-xs tracking-wide uppercase">
            <button
              type="button"
              onClick={() => setActiveStatusGroup(null)}
              className={`cursor-pointer transition-colors ${
                activeStatusGroup === null
                  ? "text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              <span className="mr-1.5 font-semibold text-zinc-900">
                {counts.total}
              </span>
              races
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveStatusGroup((c) => (c === "open" ? null : "open"))
              }
              className={`cursor-pointer transition-colors ${
                activeStatusGroup === "open"
                  ? "text-zinc-900 underline underline-offset-4"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              <span className="mr-1.5 font-semibold text-zinc-900">
                {counts.open}
              </span>
              open
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveStatusGroup((c) => (c === "closed" ? null : "closed"))
              }
              className={`cursor-pointer transition-colors ${
                activeStatusGroup === "closed"
                  ? "text-zinc-900 underline underline-offset-4"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              <span className="mr-1.5 font-semibold text-zinc-900">
                {counts.closed}
              </span>
              closed
            </button>
          </div>
        </div>

      </header>

      <section className="mb-4 flex flex-wrap gap-2">
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
      </section>

      <section className="mb-8 flex flex-wrap gap-2">
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
      </section>

      {actionableRaces.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {actionableRaces.map(renderRace)}
        </ul>
      ) : null}

      {sunkRaces.length > 0 ? (
        <section className={actionableRaces.length > 0 ? "mt-8" : undefined}>
          <p className="mb-3 text-[11px] tracking-[0.12em] text-zinc-500 uppercase">
            Nothing to act on — closed, sold out, or completed (
            {sunkRaces.length})
          </p>
          <ul className="flex flex-col gap-3">
            {sunkRaces.map((entry, i) =>
              renderRace(entry, actionableRaces.length + i),
            )}
          </ul>
        </section>
      ) : null}

      {actionableRaces.length === 0 && sunkRaces.length === 0 && tbaRaces.length === 0 ? (
        <section className="rounded-2xl bg-white">
          <p className="px-5 py-8 text-sm text-zinc-500 sm:px-7">
            No races match the current filters.
          </p>
        </section>
      ) : null}

      {tbaRaces.length > 0 ? (
        <details className="mt-8">
          <summary className="cursor-pointer text-[11px] tracking-[0.12em] text-zinc-500 uppercase select-none hover:text-zinc-900">
            Awaiting dates ({tbaRaces.length}) — announced races without a
            registration window yet
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {tbaRaces.map((entry, i) =>
              renderRace(entry, actionableRaces.length + sunkRaces.length + i),
            )}
          </ul>
        </details>
      ) : null}
    </>
  );

}
