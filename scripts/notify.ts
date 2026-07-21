/**
 * Emails subscribers when their race hits a notifiable EVENT. Three events:
 *   - "opens-soon" — a KNOWN opening date is within OPENS_LEAD_DAYS
 *   - "open"       — registration is open (date window or scraped status)
 *   - "closing"    — an open window closes within CLOSING_LEAD_DAYS
 * Each subscriber gets each (race edition, event) at most once, ever — the
 * dedupe marker keys on the event, so the full arc is heads-up → open →
 * closing nudge, one email per beat.
 *
 * Data flow: races.json (facts) + deriveStatus → lib/subscriptions (Upstash
 * in production, data/*.json locally) → Resend.
 *
 * Without RESEND_API_KEY this is a dry run that only prints what it would
 * send. Set EMAIL_FROM to use a verified sender instead of Resend's default.
 * NOTIFY_NOW=<iso date> time-travels the run for testing (dry runs only).
 *
 * Usage: npm run notify   (scheduled via GitHub Actions)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { deriveStatus, type Race } from "../lib/deriveStatus";
import {
  type EmailContent,
  unsubscribeHeaders,
  unsubscribeUrl,
  sendEmail,
} from "../lib/email";
import { closingEmail, openEmail, opensSoonEmail } from "../lib/emails";
import { listNotified, listSubscriptions, markNotified } from "../lib/subscriptions";

type RaceRecord = Race & {
  name: string;
  officialUrl: string;
};

type EventType = "opens-soon" | "open" | "closing";

const OPEN_CODES = new Set(["REG_OPEN", "REG_CLOSING_SOON", "LOTTERY_OPEN"]);
// States whose daysUntil counts down to a KNOWN opening date.
const OPENS_SOON_CODES = new Set([
  "REG_OPENS_SOON",
  "LOTTERY_OPENS_SOON",
  "COMPLETED_NEXT_KNOWN",
]);
const CLOSING_LEAD_DAYS = 3;
const OPENS_LEAD_DAYS = 3;

async function notifySubscriber(
  to: string,
  content: EmailContent,
  headers: Record<string, string>,
) {
  const sent = await sendEmail(to, content, headers);
  if (sent) console.log(`  emailed ${to}: ${content.subject}`);
  else console.log(`  [dry run] would email ${to}: ${content.subject}`);
}

/**
 * Which events are due for this race right now. "opens-soon" when a known
 * opening date enters its lead window; "open" whenever it's in an open
 * state; "closing" when the deadline is within its lead window. If open and
 * closing are due together (it opened straight into the closing window),
 * only "closing" is sent — its email already says it's open.
 */
function dueEvents(race: RaceRecord, status: ReturnType<typeof deriveStatus>): EventType[] {
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

async function main() {
  const racesPath = path.join(process.cwd(), "data", "races.json");
  const races = JSON.parse(await readFile(racesPath, "utf-8")) as RaceRecord[];
  const subscriptions = await listSubscriptions();
  const notified = await listNotified();

  if (subscriptions.length === 0) {
    console.log("No subscriptions yet — nothing to do.");
    return;
  }
  if (!process.env.RESEND_API_KEY) {
    console.log("RESEND_API_KEY not set — dry run, no emails will be sent.\n");
  }

  // NOTIFY_NOW time-travels dry runs for testing; never with a real API key.
  const now =
    process.env.NOTIFY_NOW && !process.env.RESEND_API_KEY
      ? new Date(process.env.NOTIFY_NOW)
      : new Date();
  if (process.env.NOTIFY_NOW && !process.env.RESEND_API_KEY) {
    console.log(`(time-traveled to ${now.toISOString()})\n`);
  }
  const sentKeys: string[] = [];
  let failedSends = 0;

  for (const race of races) {
    const subscribers = subscriptions.filter((sub) => sub.raceId === race.id);
    if (subscribers.length === 0) continue;

    const status = deriveStatus(race, now);
    const events = dueEvents(race, status);
    if (events.length === 0) continue;

    console.log(`${race.name} — ${status.label} [${events.join(", ")}]`);

    for (const sub of subscribers) {
      for (const event of events) {
        const key = `${race.id}|${race.raceDate ?? "tba"}|${sub.email}|${event}`;
        if (notified.has(key)) continue;

        const unsubscribe = unsubscribeUrl(sub.email, race.id);
        const content =
          event === "opens-soon"
            ? opensSoonEmail(race, status.daysUntil ?? 0, unsubscribe)
            : event === "open"
              ? openEmail(race, unsubscribe)
              : closingEmail(race, status.daysUntil ?? 0, unsubscribe);

        // One undeliverable address (e.g. Resend's test sender can only reach
        // the account owner until a domain is verified) must not block the
        // other subscribers. Unmarked failures retry on the next run.
        try {
          await notifySubscriber(sub.email, content, unsubscribeHeaders(unsubscribe));
          sentKeys.push(key);
        } catch (error) {
          failedSends += 1;
          console.log(
            `  FAILED ${sub.email}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    }
  }

  await markNotified(sentKeys);
  console.log(
    `\nDone — ${sentKeys.length} notification(s) ${process.env.RESEND_API_KEY ? "sent" : "in dry run"}${failedSends > 0 ? `, ${failedSends} failed (will retry next run)` : ""}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
