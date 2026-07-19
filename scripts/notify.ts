/**
 * Emails every subscriber whose race currently has an open registration
 * window (first-come-first-served or lottery). Each subscriber is notified
 * at most once per race edition — sent notifications are recorded via
 * lib/subscriptions (Upstash in production, data/notified.json locally),
 * keyed by race + edition date + email.
 *
 * Without RESEND_API_KEY this is a dry run that only prints what it would
 * send. Set EMAIL_FROM to use a verified sender instead of Resend's default.
 *
 * Usage: npm run notify   (intended to run on a schedule, e.g. GitHub Actions)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  deriveStatus,
  type DerivedStatus,
  type Race,
} from "../lib/deriveStatus";
import { sendEmail } from "../lib/email";
import { listNotified, listSubscriptions, markNotified } from "../lib/subscriptions";

type RaceRecord = Race & {
  name: string;
  officialUrl: string;
};

const OPEN_CODES = new Set(["REG_OPEN", "REG_CLOSING_SOON", "LOTTERY_OPEN"]);

async function notifySubscriber(to: string, subject: string, text: string) {
  const sent = await sendEmail(to, subject, text);
  if (sent) console.log(`  emailed ${to}: ${subject}`);
  else console.log(`  [dry run] would email ${to}: ${subject}`);
}

function buildEmail(race: RaceRecord, status: DerivedStatus) {
  // A completed race's stored window belongs to the past edition — don't
  // present its close date as the next edition's deadline.
  const closes =
    !status.completed && race.registrationCloses
      ? new Date(race.registrationCloses).toDateString()
      : "not announced";
  return {
    subject: `Registration is open: ${race.name}`,
    text: [
      `${race.name} — ${status.label}`,
      ``,
      `Registration closes: ${closes}`,
      `Register here: ${race.officialUrl}`,
      ``,
      `You subscribed to this race on Race Reminder.`,
    ].join("\n"),
  };
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
    if (!OPEN_CODES.has(status.code)) continue;

    console.log(`${race.name} — ${status.label}`);
    const { subject, text } = buildEmail(race, status);

    for (const sub of subscribers) {
      const key = `${race.id}|${race.raceDate ?? "tba"}|${sub.email}`;
      if (notified.has(key)) continue;
      // One undeliverable address (e.g. Resend's test sender can only reach
      // the account owner until a domain is verified) must not block the
      // other subscribers. Unmarked failures retry on the next run.
      try {
        await notifySubscriber(sub.email, subject, text);
        sentKeys.push(key);
      } catch (error) {
        failedSends += 1;
        console.log(
          `  FAILED ${sub.email}: ${error instanceof Error ? error.message : error}`,
        );
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
