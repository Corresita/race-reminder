/**
 * notifyCore.ts — Race Reminder
 *
 * The notification engine, shared by two triggers:
 *   - scripts/notify.ts   (GitHub Actions cron — best-effort timing, fallback)
 *   - /api/notify         (QStash schedule — minute-punctual, primary)
 *
 * Three events per race edition — "opens-soon", "open", "closing" — plus
 * one "milestone" per dated milestone (lottery results, second draw…).
 * Each subscriber gets each at most once ever (dedupe markers in storage),
 * so both triggers can fire on the same day without double-sending.
 */
import { type Milestone, type Race, deriveStatus } from "./deriveStatus";
import {
  type EmailContent,
  sendEmail,
  unsubscribeHeaders,
  unsubscribeUrl,
} from "./email";
import {
  closingEmail,
  milestoneEmail,
  openEmail,
  opensSoonEmail,
} from "./emails";
import { personalNote } from "./personalNotes";
import { listNotified, listSubscriptions, markNotified } from "./subscriptions";

export type RaceRecord = Race & {
  name: string;
  officialUrl: string;
};

export type EventType = "opens-soon" | "open" | "closing" | "milestone";

export type DueEvent =
  | { type: "opens-soon"; key: string }
  | { type: "open"; key: string }
  | { type: "closing"; key: string }
  | { type: "milestone"; key: string; milestone: Milestone };

const OPEN_CODES = new Set(["REG_OPEN", "REG_CLOSING_SOON", "LOTTERY_OPEN"]);
// States whose daysUntil counts down to a KNOWN opening date.
const OPENS_SOON_CODES = new Set([
  "REG_OPENS_SOON",
  "LOTTERY_OPENS_SOON",
  "COMPLETED_NEXT_KNOWN",
]);
const CLOSING_LEAD_DAYS = 3;
const OPENS_LEAD_DAYS = 3;
// A milestone email is due from its moment until this long after — enough
// for a missed run (or a same-week subscriber) to still get it, without
// greeting a new subscriber with last month's news.
const MILESTONE_GRACE_MS = 3 * 86_400_000;

/** Milestones whose moment has arrived (and not long passed). */
function dueMilestones(race: RaceRecord, now: Date): DueEvent[] {
  return (race.milestones ?? [])
    .filter((m) => {
      const at = new Date(m.date).getTime();
      return (
        !isNaN(at) &&
        at <= now.getTime() &&
        now.getTime() - at < MILESTONE_GRACE_MS
      );
    })
    .map((milestone) => ({
      type: "milestone" as const,
      key: `milestone:${milestone.date}`,
      milestone,
    }));
}

/**
 * Which events are due for this race right now. "opens-soon" when a known
 * opening date enters its lead window; "open" whenever it's in an open
 * state; "closing" when the deadline is within its lead window. If open and
 * closing are due together (it opened straight into the closing window),
 * only "closing" is sent — its email already says it's open. Milestones are
 * independent of status: each is due on its own day, whatever the state.
 */
export function dueEvents(
  race: RaceRecord,
  status: ReturnType<typeof deriveStatus>,
  now: Date = new Date(),
): DueEvent[] {
  const milestones = dueMilestones(race, now);
  if (OPENS_SOON_CODES.has(status.code)) {
    const soon =
      status.daysUntil != null && status.daysUntil <= OPENS_LEAD_DAYS;
    return soon
      ? [{ type: "opens-soon", key: "opens-soon" }, ...milestones]
      : milestones;
  }
  if (!OPEN_CODES.has(status.code)) return milestones;
  const closingSoon =
    !status.completed &&
    status.daysUntil != null &&
    status.daysUntil <= CLOSING_LEAD_DAYS &&
    !!race.registrationCloses;
  const primary: DueEvent = closingSoon
    ? { type: "closing", key: "closing" }
    : { type: "open", key: "open" };
  return [primary, ...milestones];
}

async function notifySubscriber(
  to: string,
  content: EmailContent,
  headers: Record<string, string>,
  log: (line: string) => void,
) {
  const sent = await sendEmail(to, content, headers);
  if (sent) log(`  emailed ${to}: ${content.subject}`);
  else log(`  [dry run] would email ${to}: ${content.subject}`);
}

/** Run one notification sweep. Returns counts; narrates via `log`. */
export async function runNotify(
  races: RaceRecord[],
  options: { now?: Date; log?: (line: string) => void } = {},
): Promise<{ sent: number; failed: number }> {
  const log = options.log ?? console.log;
  const now = options.now ?? new Date();

  const subscriptions = await listSubscriptions();
  const notified = await listNotified();

  if (subscriptions.length === 0) {
    log("No subscriptions yet — nothing to do.");
    return { sent: 0, failed: 0 };
  }

  const sentKeys: string[] = [];
  let failedSends = 0;

  for (const race of races) {
    const subscribers = subscriptions.filter((sub) => sub.raceId === race.id);
    if (subscribers.length === 0) continue;

    const status = deriveStatus(race, now);
    const events = dueEvents(race, status, now);
    if (events.length === 0) continue;

    log(
      `${race.name} — ${status.label} [${events.map((e) => e.key).join(", ")}]`,
    );

    for (const sub of subscribers) {
      for (const event of events) {
        const key = `${race.id}|${race.raceDate ?? "tba"}|${sub.email}|${event.key}`;
        if (notified.has(key)) continue;

        const unsubscribe = unsubscribeUrl(sub.email, race.id);
        const content =
          event.type === "opens-soon"
            ? opensSoonEmail(race, status.daysUntil ?? 0, unsubscribe)
            : event.type === "open"
              ? openEmail(
                  race,
                  unsubscribe,
                  personalNote(event.type, race.id, sub.email),
                )
              : event.type === "closing"
                ? closingEmail(race, status.daysUntil ?? 0, unsubscribe)
                : milestoneEmail(race, event.milestone, unsubscribe);

        // One undeliverable address must not block the other subscribers.
        // Unmarked failures retry on the next run.
        try {
          await notifySubscriber(
            sub.email,
            content,
            unsubscribeHeaders(unsubscribe),
            log,
          );
          sentKeys.push(key);
        } catch (error) {
          failedSends += 1;
          log(
            `  FAILED ${sub.email}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    }
  }

  await markNotified(sentKeys);
  log(
    `\nDone — ${sentKeys.length} notification(s) ${process.env.RESEND_API_KEY ? "sent" : "in dry run"}${failedSends > 0 ? `, ${failedSends} failed (will retry next run)` : ""}.`,
  );
  return { sent: sentKeys.length, failed: failedSends };
}
