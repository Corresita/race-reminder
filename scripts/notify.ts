/**
 * CLI/Actions wrapper around lib/notifyCore — see runNotify for the engine.
 *
 * Without RESEND_API_KEY this is a dry run that only prints what it would
 * send. NOTIFY_NOW=<iso date> time-travels the run for testing (dry runs
 * only — never with a real API key).
 *
 * Usage: npm run notify   (scheduled via GitHub Actions as the fallback
 * trigger; the punctual primary trigger is QStash → /api/notify)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runNotify, type RaceRecord } from "../lib/notifyCore";

async function main() {
  const racesPath = path.join(process.cwd(), "data", "races.json");
  const races = JSON.parse(await readFile(racesPath, "utf-8")) as RaceRecord[];

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

  await runNotify(races, { now });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
