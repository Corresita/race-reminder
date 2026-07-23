/**
 * Sends ONE test email (any template, any race) to a given address, with a
 * [TEST] subject prefix. For previewing template changes without touching
 * subscriptions or notification markers.
 *
 * Driven by env vars (set by the test-email GitHub Actions workflow):
 *   TEMPLATE = confirm | cancel | opens-soon | open | closing
 *   RACE_ID  = a race id from data/races.json
 *   TO       = recipient address
 *
 * Usage: TEMPLATE=opens-soon RACE_ID=hk100 TO=you@x.com npx tsx scripts/test-email.ts
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { deriveStatus, type Race } from "../lib/deriveStatus";
import {
  SITE_URL,
  sendEmail,
  unsubscribeHeaders,
  unsubscribeUrl,
} from "../lib/email";
import {
  cancelEmail,
  closingEmail,
  confirmEmail,
  openEmail,
  opensSoonEmail,
} from "../lib/emails";

type RaceRecord = Race & { name: string; officialUrl: string };

async function main() {
  const template = process.env.TEMPLATE ?? "";
  const raceId = process.env.RACE_ID ?? "";
  const to = process.env.TO ?? "";
  if (!template || !raceId || !to) {
    throw new Error("TEMPLATE, RACE_ID and TO are all required");
  }

  const racesPath = path.join(process.cwd(), "data", "races.json");
  const races = JSON.parse(await readFile(racesPath, "utf-8")) as RaceRecord[];
  const race = races.find((r) => r.id === raceId);
  if (!race) throw new Error(`Unknown race id: ${raceId}`);

  const status = deriveStatus(race);
  const unsubscribe = unsubscribeUrl(to, race.id);
  const days = status.daysUntil ?? 3;

  const content =
    template === "confirm"
      ? confirmEmail(race, unsubscribe)
      : template === "cancel"
        ? cancelEmail(race, SITE_URL, unsubscribeUrl(to))
        : template === "opens-soon"
          ? opensSoonEmail(race, days, unsubscribe)
          : template === "open"
            ? openEmail(race, unsubscribe)
            : template === "closing"
              ? closingEmail(race, days, unsubscribe)
              : null;
  if (!content) throw new Error(`Unknown template: ${template}`);

  const sent = await sendEmail(
    to,
    { ...content, subject: `[TEST] ${content.subject}` },
    unsubscribeHeaders(unsubscribe),
  );
  console.log(
    sent
      ? `Sent "${template}" for ${race.name} to ${to}`
      : `Dry run (no RESEND_API_KEY) — would send "${template}" for ${race.name} to ${to}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
