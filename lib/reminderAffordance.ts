/**
 * reminderAffordance.ts — Race Reminder
 *
 * THE RULE: the button must not promise what the notifier can't deliver.
 *
 * Adapted to our status-driven engine. A reminder actually fires when
 * deriveStatus enters an open state — which happens either because a real
 * date window arrives, OR because the 6-hourly scraper flips a monitored
 * race's observed status to "registration_open". So "can we remind?" is
 * broader than "does it have dates": a dateless UTMB race is still
 * remindable because the scraper watches it.
 *
 * Maps a race + its derived status → the one honest button to show.
 */
import type { DerivedStatus } from "./deriveStatus";

export type Affordance =
  | { kind: "REMIND_OPEN"; label: string } // future open we can fire on
  | { kind: "REMIND_CLOSE"; label: string } // open now + real close date
  | { kind: "REGISTER_NOW"; label: string } // open now, no deadline — act now
  | { kind: "NO_DATES"; label: string }; // nothing to fire on — say so

const OPEN_NOW = new Set<DerivedStatus["code"]>([
  "REG_OPEN",
  "REG_CLOSING_SOON",
  "LOTTERY_OPEN",
]);
const FUTURE_OPEN = new Set<DerivedStatus["code"]>([
  "REG_OPENS_SOON",
  "LOTTERY_OPENS_SOON",
  "COMPLETED_NEXT_KNOWN",
]);

export function reminderAffordance(
  race: { registrationCloses: string | null; officialUrl: string },
  status: DerivedStatus,
): Affordance {
  // Open right now: remind before it closes if we know the deadline,
  // otherwise there's nothing to wait for — push them to register.
  if (OPEN_NOW.has(status.code)) {
    return race.registrationCloses
      ? { kind: "REMIND_CLOSE", label: "Remind me before it closes" }
      : { kind: "REGISTER_NOW", label: "Open now — register" };
  }

  // A future opening we can fire on (date known, or next edition announced).
  if (FUTURE_OPEN.has(status.code)) {
    return { kind: "REMIND_OPEN", label: "Remind me when it opens" };
  }

  // No date yet, but the scraper watches this race — when its official site
  // flips to open, the notifier catches it. Still an honest reminder.
  if (race.officialUrl.includes("utmb.world")) {
    return { kind: "REMIND_OPEN", label: "Remind me when it opens" };
  }

  // No date, not watched: a reminder would go into a black hole. Be honest.
  return { kind: "NO_DATES", label: "Dates not announced yet" };
}
