"use client";

import { useEffect, useMemo, useState } from "react";
import { DotRule } from "@/app/components/dot-rule";
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

// Status groups behind the clickable header counts. Every StatusCode lands
// in exactly one group, so open + closed + upcoming always sums to the total.
type StatusGroup = "open" | "closed" | "upcoming";
const STATUS_GROUPS: Record<StatusGroup, Set<DerivedStatus["code"]>> = {
  open: new Set(["REG_OPEN", "REG_CLOSING_SOON", "LOTTERY_OPEN"]),
  closed: new Set([
    "REG_CLOSED",
    "SOLD_OUT",
    "LOTTERY_DRAWN",
    "AWAITING_DRAW",
    "COMPLETED_NEXT_TBA",
  ]),
  // Not open yet — a known future open date (incl. an announced next
  // edition), or no dates at all.
  upcoming: new Set([
    "REG_OPENS_SOON",
    "LOTTERY_OPENS_SOON",
    "COMPLETED_NEXT_KNOWN",
    "REG_NOT_OPEN",
    "DATES_TBA",
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

/** "05 DEC"-style day + month, on the date's own calendar day. */
function fmtShort(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`)
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    })
    .toUpperCase();
}

/** The card's key date: the next calendar date that matters. */
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

// Distance-range buckets over real km, so a 70K race is findable as
// 50–100K instead of hiding behind an official "50K" category tag.
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

// Continent buckets, derived from the country fact — no data changes.
// Judgment call: Türkiye files under Europe (Kaçkar is geographically
// Anatolia, but that's where users will look for it).
const REGIONS = [
  "Europe",
  "North America",
  "South America",
  "Asia",
  "Oceania",
  "Africa",
] as const;
type Region = (typeof REGIONS)[number];

const COUNTRY_REGION: Record<string, Region> = {
  Andorra: "Europe",
  Austria: "Europe",
  Croatia: "Europe",
  France: "Europe",
  Germany: "Europe",
  Italy: "Europe",
  Latvia: "Europe",
  Portugal: "Europe",
  Romania: "Europe",
  Slovenia: "Europe",
  Spain: "Europe",
  Sweden: "Europe",
  Switzerland: "Europe",
  Türkiye: "Europe",
  "United Kingdom": "Europe",
  Canada: "North America",
  Mexico: "North America",
  "United States": "North America",
  Argentina: "South America",
  Brazil: "South America",
  Chile: "South America",
  Ecuador: "South America",
  China: "Asia",
  "Chinese Taipei": "Asia",
  "Hong Kong": "Asia",
  Indonesia: "Asia",
  Japan: "Asia",
  Malaysia: "Asia",
  Oman: "Asia",
  "South Korea": "Asia",
  Thailand: "Asia",
  Vietnam: "Asia",
  Australia: "Oceania",
  "New Zealand": "Oceania",
  "South Africa": "Africa",
};

const EMAIL_STORAGE_KEY = "race-reminder-email";
const SUBSCRIPTIONS_STORAGE_KEY = "race-reminder-subscriptions";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RaceBrowser({ races, initialNow }: RaceBrowserProps) {
  const [activeSeries, setActiveSeries] = useState<Series | null>(null);
  const [activeDistance, setActiveDistance] = useState<string | null>(null);
  const [activeRegion, setActiveRegion] = useState<Region | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStatusGroup, setActiveStatusGroup] =
    useState<StatusGroup | null>(null);
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

  // Phones only: the filter row isn't sticky there, so surface a
  // back-to-top button once the user is meaningfully deep in the list.
  const [showBackToTop, setShowBackToTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function updateSubscription(
    raceId: string,
    subscriberEmail: string,
    subscribe: boolean,
  ) {
    setBusyRaceId(raceId);
    setSubscribeError(null);
    try {
      // Silently capture the browser's IANA timezone on subscribe so
      // emails can one day render "your time" — no GeoIP, no form field.
      let timezone: string | null = null;
      try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
      } catch {
        // Older browsers: fine without.
      }
      const response = await fetch("/api/subscribe", {
        method: subscribe ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          subscribe
            ? { email: subscriberEmail, raceId, timezone }
            : { email: subscriberEmail, raceId },
        ),
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

  // The one filtered universe (series / distance / search) that BOTH the
  // header counts and the sections read from. Single source: the numbers
  // in the header and on the section headings cannot drift apart.
  const visible = useMemo(() => {
    const activeFilter = distanceFilters.find((f) => f.id === activeDistance);
    const query = searchQuery.trim().toLowerCase();
    const result: { race: Race; status: DerivedStatus }[] = [];
    for (const race of races) {
      if (activeSeries && race.series !== activeSeries) continue;
      if (activeFilter && !race.distancesKm.some(activeFilter.match)) continue;
      if (
        activeRegion &&
        (!race.country || COUNTRY_REGION[race.country] !== activeRegion)
      )
        continue;
      if (
        query &&
        !`${race.name} ${race.country ?? ""}`.toLowerCase().includes(query)
      )
        continue;
      result.push({ race, status: deriveStatus(race, now) });
    }
    return result;
  }, [races, activeSeries, activeDistance, activeRegion, searchQuery, now]);

  // Header counts follow the active series/distance/search filters (an
  // active status-group filter doesn't shrink them — the counts ARE that
  // filter's own control).
  const counts = useMemo(
    () => ({
      total: visible.length,
      open: visible.filter(({ status }) => STATUS_GROUPS.open.has(status.code))
        .length,
      closed: visible.filter(({ status }) =>
        STATUS_GROUPS.closed.has(status.code),
      ).length,
      upcoming: visible.filter(({ status }) =>
        STATUS_GROUPS.upcoming.has(status.code),
      ).length,
    }),
    [visible],
  );

  // One taxonomy everywhere: the page sections mirror the header counts
  // (open / upcoming / closed) exactly. Within "upcoming", races with no
  // window at all fold into the awaiting-dates <details>.
  const { openRaces, upcomingRaces, tbaRaces, closedRaces } = useMemo(() => {
    const openRaces: { race: Race; status: DerivedStatus }[] = [];
    const upcomingRaces: { race: Race; status: DerivedStatus }[] = [];
    const tbaRaces: { race: Race; status: DerivedStatus }[] = [];
    const closedRaces: { race: Race; status: DerivedStatus }[] = [];

    const statusGroup = activeStatusGroup
      ? STATUS_GROUPS[activeStatusGroup]
      : null;
    for (const entry of visible) {
      const { status } = entry;
      if (statusGroup && !statusGroup.has(status.code)) continue;
      if (STATUS_GROUPS.open.has(status.code)) {
        openRaces.push(entry);
      } else if (STATUS_GROUPS.upcoming.has(status.code)) {
        // No window at all → the awaiting-dates fold inside "upcoming".
        if (status.code === "DATES_TBA" || status.code === "REG_NOT_OPEN") {
          tbaRaces.push(entry);
        } else {
          upcomingRaces.push(entry);
        }
      } else {
        closedRaces.push(entry);
      }
    }
    openRaces.sort((a, b) => compareStatus(a.status, b.status));
    upcomingRaces.sort((a, b) => compareStatus(a.status, b.status));
    closedRaces.sort((a, b) => compareStatus(a.status, b.status));

    return { openRaces, upcomingRaces, tbaRaces, closedRaces };
  }, [visible, activeStatusGroup]);

  function renderRace(
    { race, status }: { race: Race; status: DerivedStatus },
    index: number,
  ) {
    const countdown = countdownRow(status);
    const date = dateRow(race, status, now);
    // A completed edition's card is about the NEXT cycle — show its year
    // once the organizer has announced it. Facts only: no announced next
    // race date, no +1 guessing; the completed year stays (honest next to
    // the "Completed" pill).
    const year =
      status.completed && race.nextEdition?.raceDate
        ? race.nextEdition.raceDate.slice(0, 4)
        : race.raceDate
          ? race.raceDate.slice(0, 4)
          : null;
    const affordance = reminderAffordance(race, status);
    const subscribed = subscribedIds.has(race.id);

    return (
      <li
        key={race.id}
        className={`flex flex-col rounded-2xl border border-zinc-200 bg-white ${
          status.actionable ||
          status.code === "DATES_TBA" ||
          status.code === "REG_NOT_OPEN"
            ? ""
            : "opacity-60"
        }`}
      >
        <div className="flex grow flex-col px-6 pt-5 pb-6">
          <div className="flex items-start justify-between gap-3">
            <p className="font-mono text-[11px] tracking-wide text-zinc-400">
              {String(index + 1).padStart(2, "0")}
            </p>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${urgencyStyles[status.urgency]}`}
            >
              {shortStatusLabels[status.code]}
            </span>
          </div>

          <a
            href={race.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 text-lg leading-snug font-medium tracking-tight text-zinc-900 transition-colors hover:text-zinc-500"
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
                    Entry
                  </span>
                  <span className="mt-1 block text-sm font-medium text-zinc-800 uppercase">
                    {race.registrationType === "fcfs"
                      ? "First come"
                      : registrationTypeLabels[race.registrationType]}
                  </span>
                </p>
              </div>
              {race.entryRequirement ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Requires: {race.entryRequirement}
                </p>
              ) : null}
              {race.entryNotes ? (
                <p className="mt-1 text-xs text-zinc-400">{race.entryNotes}</p>
              ) : null}
              <p className="mt-3">
                <span className="block text-[11px] tracking-[0.12em] text-zinc-500 uppercase">
                  {countdown.label}
                </span>
                <span className="mt-2 block font-mono text-lg leading-none font-semibold tracking-tight text-zinc-800">
                  {countdown.value}
                </span>
              </p>
            </div>

            <div className="mt-5">
              {subscribed ||
              affordance.kind === "REMIND_OPEN" ||
              affordance.kind === "REMIND_CLOSE" ? (
                <button
                  type="button"
                  onClick={() => onSubscribeClick(race.id)}
                  disabled={busyRaceId === race.id}
                  title={
                    subscribed
                      ? "Cancel this reminder"
                      : "Email me when there's something to act on"
                  }
                  className={`group block w-full rounded-full border px-4 py-2.5 text-center text-[11px] font-semibold tracking-[0.15em] uppercase transition-colors disabled:opacity-50 ${
                    subscribed
                      ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 hover:border-red-400 hover:bg-red-50 hover:text-red-700"
                      : "border-zinc-400 text-zinc-900 hover:border-zinc-900 hover:bg-zinc-900 hover:text-zinc-50"
                  }`}
                >
                  {subscribed ? (
                    <>
                      <span className="group-hover:hidden">Reminder set ✓</span>
                      <span className="hidden group-hover:inline">
                        Cancel reminder
                      </span>
                    </>
                  ) : (
                    affordance.label
                  )}
                </button>
              ) : affordance.kind === "REGISTER_NOW" ? (
                <a
                  href={race.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-full border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-center text-[11px] font-semibold tracking-[0.15em] text-zinc-50 uppercase transition-colors hover:border-zinc-700 hover:bg-zinc-700"
                >
                  {affordance.label} ↗
                </a>
              ) : (
                <p className="rounded-full border border-zinc-200 px-4 py-2.5 text-center text-[11px] tracking-[0.15em] text-zinc-400 uppercase select-none">
                  {affordance.label}
                </p>
              )}

              {emailFormRaceId === race.id ? (
                <form
                  className="mt-2 flex gap-1.5"
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
                    className="w-full min-w-0 flex-1 rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none"
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
        </div>
      </li>
    );
  }

  return (
    <>
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
            <button
              type="button"
              onClick={() => setActiveStatusGroup(null)}
              className={`cursor-pointer transition-colors ${
                activeStatusGroup === null
                  ? "text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              <span className="font-semibold text-zinc-900">
                {counts.total}
              </span>{" "}
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
              <span className="font-semibold text-zinc-900">{counts.open}</span>{" "}
              open
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveStatusGroup((c) =>
                  c === "upcoming" ? null : "upcoming",
                )
              }
              className={`cursor-pointer transition-colors ${
                activeStatusGroup === "upcoming"
                  ? "text-zinc-900 underline underline-offset-4"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              <span className="font-semibold text-zinc-900">
                {counts.upcoming}
              </span>{" "}
              upcoming
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
              <span className="font-semibold text-zinc-900">
                {counts.closed}
              </span>{" "}
              closed
            </button>
          </div>
        </div>
        <DotRule />
      </header>

      {/* The filters are the page's steering wheel. On sm+ the row is
          sticky and rides along while scrolling; on phones sticking it
          would eat ~1/5 of the screen, so it scrolls away and a floating
          back-to-top button (below) covers the trip back instead. */}
      <section className="sm:bg-background/85 mb-8 flex flex-wrap items-center gap-2 sm:sticky sm:top-0 sm:z-20 sm:py-3 sm:backdrop-blur-sm">
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

        {/* On phones the dropdown and search share one row (dropdown left,
            search filling the rest); on sm+ they sit right-aligned. */}
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <span className="relative shrink-0">
            <select
              value={activeRegion ?? ""}
              onChange={(event) =>
                setActiveRegion((event.target.value || null) as Region | null)
              }
              aria-label="Filter races by region"
              className={`cursor-pointer appearance-none rounded-full border py-1.5 pr-[29px] pl-3 text-xs leading-none tracking-wide uppercase transition-colors focus:outline-none ${
                activeRegion
                  ? "border-zinc-900 bg-zinc-900 text-zinc-50"
                  : "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
              }`}
            >
              <option value="">All regions</option>
              {REGIONS.map((region) => (
                <option key={region} value={region}>
                  {/* Short display labels keep the widest option no wider than
                    "All regions", so the icon hugs the text in every state. */}
                  {region === "North America"
                    ? "N. America"
                    : region === "South America"
                      ? "S. America"
                      : region}
                </option>
              ))}
            </select>
            {/* Funnel glyph in place of the native select arrow */}
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3.5}
              strokeLinecap="round"
              className={`pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 ${
                activeRegion ? "text-zinc-50" : "text-zinc-500"
              }`}
            >
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="7" y1="12" x2="17" y2="12" />
              <line x1="10" y1="18" x2="14" y2="18" />
            </svg>
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search races…"
            aria-label="Search races by name or country"
            className="min-w-0 flex-1 rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none sm:w-56 sm:flex-none"
          />
        </div>
      </section>

      {openRaces.length > 0 ? (
        <section>
          <p className="mb-3 text-[11px] tracking-[0.12em] text-zinc-500 uppercase">
            Open now ({openRaces.length})
          </p>
          <ul className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {openRaces.map(renderRace)}
          </ul>
        </section>
      ) : null}

      {upcomingRaces.length + tbaRaces.length > 0 ? (
        <section className={openRaces.length > 0 ? "mt-8" : undefined}>
          <p className="mb-3 text-[11px] tracking-[0.12em] text-zinc-500 uppercase">
            Upcoming — not open yet ({upcomingRaces.length + tbaRaces.length})
          </p>
          {upcomingRaces.length > 0 ? (
            <ul className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {upcomingRaces.map((entry, i) =>
                renderRace(entry, openRaces.length + i),
              )}
            </ul>
          ) : null}
          {tbaRaces.length > 0 ? (
            <details
              // Collapsed only on the unfiltered overview; once the user
              // narrows (series, distance, search, status) they want the
              // complete set, so the fold opens itself.
              open={
                activeSeries !== null ||
                activeDistance !== null ||
                activeRegion !== null ||
                activeStatusGroup !== null ||
                searchQuery.trim() !== ""
              }
              className={upcomingRaces.length > 0 ? "mt-3" : undefined}
            >
              <summary className="cursor-pointer text-[11px] tracking-[0.12em] text-zinc-500 uppercase select-none hover:text-zinc-900">
                Awaiting dates ({tbaRaces.length}) — no registration window
                announced yet
              </summary>
              <ul className="mt-3 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {tbaRaces.map((entry, i) =>
                  renderRace(
                    entry,
                    openRaces.length + upcomingRaces.length + i,
                  ),
                )}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {closedRaces.length > 0 ? (
        <section className="mt-8">
          <p className="mb-3 text-[11px] tracking-[0.12em] text-zinc-500 uppercase">
            Closed — nothing to act on ({closedRaces.length})
          </p>
          <ul className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {closedRaces.map((entry, i) =>
              renderRace(
                entry,
                openRaces.length + upcomingRaces.length + tbaRaces.length + i,
              ),
            )}
          </ul>
        </section>
      ) : null}

      {openRaces.length === 0 &&
      upcomingRaces.length === 0 &&
      tbaRaces.length === 0 &&
      closedRaces.length === 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white">
          <p className="px-5 py-8 text-sm text-zinc-500 sm:px-7">
            No races match the current filters.
          </p>
        </section>
      ) : null}

      {showBackToTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
          className="fixed right-5 bottom-5 z-30 flex size-11 items-center justify-center rounded-full bg-zinc-900 text-zinc-50 shadow-lg sm:hidden"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
          </svg>
        </button>
      ) : null}
    </>
  );
}
