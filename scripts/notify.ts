/**
 * Emails subscribers when their race hits a notifiable EVENT. Two events:
 *   - "open"    — registration is open (date window or scraped observed status)
 *   - "closing" — an open window closes within CLOSING_LEAD_DAYS
 * Each subscriber gets each (race edition, event) at most once, ever — the
 * dedupe marker keys on the event so a user gets both the open email and,
 * later, the closing nudge (never the same one twice).
 *
 * Data flow: races.json (facts) + deriveStatus → lib/subscriptions (Upstash
 * in production, data/*.json locally) → Resend.
 *
 * Without RESEND_API_KEY this is a dry run that only prints what it would
 * send. Set EMAIL_FROM to use a verified sender instead of Resend's default.
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
import { closingEmail, openEmail } from "../lib/emails";
import { listNotified, listSubscriptions, markNotified } from "../lib/subscriptions";

type RaceRecord = Race & {
  name: string;
  officialUrl: string;
};

type EventType = "open" | "closing";

const OPEN_CODES = new Set(["REG_OPEN", "REG_CLOSING_SOON", "LOTTERY_OPEN"]);
const CLOSING_LEAD_DAYS = 3;

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
 * Which events are due for this race right now. "open" whenever it's in an
 * open state; "closing" additionally when the deadline is within the lead
 * window. If both are due (it opened straight into the closing window), only
 * "closing" is sent — its email already says it's open.
 */
function dueEvents(race: RaceRecord, status: ReturnType<typeof deriveStatus>): EventType[] {
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

  const now = new Date();
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
          event === "open"
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
