/**
 * notifyCore.ts — Race Reminder
 *
 * The notification engine, shared by two triggers:
 *   - scripts/notify.ts   (GitHub Actions cron — best-effort timing, fallback)
 *   - /api/notify         (QStash schedule — minute-punctual, primary)
 *
 * Three events per race edition — "opens-soon", "open", "closing" — each
 * subscriber gets each at most once ever (dedupe markers in storage), so
 * both triggers can fire on the same day without double-sending.
 */
import { type Race, deriveStatus } from "./deriveStatus";
import {
  type EmailContent,
  sendEmail,
  unsubscribeHeaders,
  unsubscribeUrl,
} from "./email";
import { closingEmail, openEmail, opensSoonEmail } from "./emails";
import { personalNote } from "./personalNotes";
import { listNotified, listSubscriptions, markNotified } from "./subscriptions";

export type RaceRecord = Race & {
  name: string;
  officialUrl: string;
};

export type EventType = "opens-soon" | "open" | "closing";

const OPEN_CODES = new Set(["REG_OPEN", "REG_CLOSING_SOON", "LOTTERY_OPEN"]);
// States whose daysUntil counts down to a KNOWN opening date.
const OPENS_SOON_CODES = new Set([
  "REG_OPENS_SOON",
  "LOTTERY_OPENS_SOON",
  "COMPLETED_NEXT_KNOWN",
]);
const CLOSING_LEAD_DAYS = 3;
const OPENS_LEAD_DAYS = 3;

/**
 * Which events are due for this race right now. "opens-soon" when a known
 * opening date enters its lead window; "open" whenever it's in an open
 * state; "closing" when the deadline is within its lead window. If open and
 * closing are due together (it opened straight into the closing window),
 * only "closing" is sent — its email already says it's open.
 */
export function dueEvents(
  race: RaceRecord,
  status: ReturnType<typeof deriveStatus>,
): EventType[] {
  if (OPENS_SOON_CODES.has(status.code)) {
    return status.daysUntil != null && status.daysUntil <= OPENS_LEAD_DAYS
      ? ["opens-soon"]
      : [];
  }
  if (!OPEN_CODES.has(status.code)) return [];
  const closingSoon =
    !status.completed &&
    status.daysUntil != null &&
    status.daysUntil <= CLOSING_LEAD_DAYS &&
    !!race.registrationCloses;
  return closingSoon ? ["closing"] : ["open"];
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
    const events = dueEvents(race, status);
    if (events.length === 0) continue;

    log(`${race.name} — ${status.label} [${events.join(", ")}]`);

    for (const sub of subscribers) {
      for (const event of events) {
        const key = `${race.id}|${race.raceDate ?? "tba"}|${sub.email}|${event}`;
        if (notified.has(key)) continue;

        const unsubscribe = unsubscribeUrl(sub.email, race.id);
        const content =
          event === "opens-soon"
            ? opensSoonEmail(race, status.daysUntil ?? 0, unsubscribe)
            : event === "open"
              ? openEmail(
                  race,
                  unsubscribe,
                  personalNote(event, race.id, sub.email),
                )
              : closingEmail(race, status.daysUntil ?? 0, unsubscribe);

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
