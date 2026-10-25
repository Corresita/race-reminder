/**
 * reminderAffordance.ts — Race Reminder
 *
 * THE RULE: the button must not promise what the notifier can't deliver.
 * (Since the "announced" event, even a dateless race is a promise we keep:
 * the day its dates enter the data, subscribers hear about it.)
 *
 * Adapted to our status-driven engine. A reminder actually fires when
 * deriveStatus enters an open state — which happens either because a real
 * date window arrives, OR because the 2-hourly scraper flips a monitored
 * race's observed status to "registration_open". So "can we remind?" is
 * broader than "does it have dates": a dateless UTMB race is still
 * remindable because the scraper watches it.
 *
 * Maps a race + its derived status → the one honest button to show.
 */
import type { DerivedStatus } from "./deriveStatus";

/** `label` is the button before subscribing; `watching` is what the same
 *  button says once subscribed — the very promise it made, now kept. */
export type Affordance = { label: string; watching: string } & (
  | { kind: "REMIND_OPEN" } // future open we can fire on
  | { kind: "REMIND_CLOSE" } // open now + real close date
  | { kind: "REGISTER_NOW" } // open now, no deadline — act now
  | { kind: "REMIND_DATES" } // no dates yet — fire when they land
);

const OPEN_NOW = new Set<DerivedStatus["code"]>([
  "REG_OPEN",
  "REG_CLOSING_SOON",
  "LOTTERY_OPEN",
]);
const FUTURE_OPEN = new Set<DerivedStatus["code"]>([
  "REG_OPENS_SOON",
  "LOTTERY_OPENS_SOON",
  "COMPLETED_NEXT_KNOWN",
  "REG_NOT_OPEN",
]);

export function reminderAffordance(
  race: {
    raceDate: string | null;
    registrationCloses: string | null;
    officialUrl: string;
    milestones?: { date: string; label: string }[] | null;
    nextEdition?: { raceDate?: string | null } | null;
  },
  status: DerivedStatus,
  now: Date = new Date(),
): Affordance {
  // The next dated step (lottery results, second draw): the notifier
  // emails on that day.
  const milestone = (race.milestones ?? [])
    .filter((m) => new Date(m.date).getTime() > now.getTime())
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const milestoneLabel = milestone?.label.toLowerCase();

  // Open right now: remind before it closes if we know the deadline,
  // otherwise there's nothing to wait for — push them to register.
  if (OPEN_NOW.has(status.code)) {
    return race.registrationCloses
      ? {
          kind: "REMIND_CLOSE",
          label: "Remind me before it closes",
          watching: "✓ Reminding before close",
        }
      : // The status pill already says "Open now" — the button is pure verb.
        {
          kind: "REGISTER_NOW",
          label: "Register",
          watching: milestoneLabel
            ? `✓ Reminding: ${milestoneLabel}`
            : "✓ Reminder set",
        };
  }

  // A future opening we can fire on (date known, or next edition announced).
  if (FUTURE_OPEN.has(status.code)) {
    return {
      kind: "REMIND_OPEN",
      label: "Remind me when it opens",
      watching: "✓ Reminding when it opens",
    };
  }

  // Closed, but a dated step is still ahead: promise exactly that.
  if (milestoneLabel) {
    return {
      kind: "REMIND_OPEN",
      label: `Remind me: ${milestoneLabel}`,
      watching: `✓ Reminding: ${milestoneLabel}`,
    };
  }

  // No date yet, but the scraper watches this race — when its official site
  // flips to open, the notifier catches it. Still an honest reminder.
  if (race.officialUrl.includes("utmb.world")) {
    return {
      kind: "REMIND_OPEN",
      label: "Remind me when it opens",
      watching: "✓ Reminding when it opens",
    };
  }

  // No date and no scraper: nothing fires until someone adds the dates —
  // and the "announced" event fires the moment they land. Still honest.
  const year = watchedEditionYear(race, status);
  return {
    kind: "REMIND_DATES",
    label: "Remind me when dates are announced",
    watching: year ? `✓ Watching for ${year} dates` : "✓ Watching for dates",
  };
}

/** The edition whose dates we're waiting on: this one while its dates are
 *  still TBA, otherwise (closed, drawn, run) the next one. */
function watchedEditionYear(
  race: {
    raceDate: string | null;
    nextEdition?: { raceDate?: string | null } | null;
  },
  status: DerivedStatus,
): number | null {
  const thisYear = race.raceDate ? Number(race.raceDate.slice(0, 4)) : null;
  if (status.code === "DATES_TBA") return thisYear;
  const nextDate = race.nextEdition?.raceDate;
  if (nextDate) return Number(nextDate.slice(0, 4));
  return thisYear ? thisYear + 1 : null;
}
