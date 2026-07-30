import races from "@/data/races.json";
import { runNotify, type RaceRecord } from "@/lib/notifyCore";

/**
 * POST /api/notify — the punctual notification trigger.
 *
 * Called on a minute-precise schedule by Upstash QStash (GitHub Actions'
 * cron regularly runs 1-2h late; this one fires on the dot, e.g. at
 * 16:00 UTC — midnight UTC+8 — the moment Asian races open). Protected
 * by NOTIFY_SECRET; dedupe markers make it safe to run alongside the
 * Actions fallback.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.NOTIFY_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const lines: string[] = [];
  const result = await runNotify(races as unknown as RaceRecord[], {
    log: (line) => lines.push(line),
  });
  return Response.json({ ...result, log: lines });
}
