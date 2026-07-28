import races from "@/data/races.json";
import {
  SITE_URL,
  sendEmail,
  unsubscribeHeaders,
  unsubscribeUrl,
} from "@/lib/email";
import { cancelEmail, confirmEmail } from "@/lib/emails";
import {
  EMAIL_PATTERN,
  addSubscription,
  removeSubscription,
} from "@/lib/subscriptions";

// IANA zone names ("Asia/Hong_Kong", "America/New_York", "UTC").
const TIMEZONE_PATTERN = /^[A-Za-z0-9_+\-/]{1,64}$/;

async function parseBody(request: Request): Promise<{
  email: string;
  raceId: string;
  timezone: string | null;
} | null> {
  try {
    const body = (await request.json()) as {
      email?: unknown;
      raceId?: unknown;
      timezone?: unknown;
    };
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const raceId = typeof body.raceId === "string" ? body.raceId : "";
    const timezone =
      typeof body.timezone === "string" && TIMEZONE_PATTERN.test(body.timezone)
        ? body.timezone
        : null;
    if (!EMAIL_PATTERN.test(email) || !raceId) return null;
    return { email, raceId, timezone };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await parseBody(request);
  if (!body) {
    return Response.json(
      { error: "A valid email and raceId are required" },
      { status: 400 },
    );
  }
  const race = races.find((r) => r.id === body.raceId);
  if (!race) {
    return Response.json({ error: "Unknown race" }, { status: 404 });
  }

  const created = await addSubscription(body.email, body.raceId, body.timezone);

  if (created) {
    // Confirmation is best-effort: a failed email must not fail the subscribe.
    const unsubscribe = unsubscribeUrl(body.email, race.id);
    try {
      await sendEmail(
        body.email,
        confirmEmail(race, unsubscribe),
        unsubscribeHeaders(unsubscribe),
      );
    } catch (error) {
      console.error("confirmation email failed:", error);
    }
  }

  return Response.json({ subscribed: true });
}

export async function DELETE(request: Request) {
  const body = await parseBody(request);
  if (!body) {
    return Response.json(
      { error: "A valid email and raceId are required" },
      { status: 400 },
    );
  }

  const removed = await removeSubscription(body.email, body.raceId);

  // Receipt for a real site-side cancel. Email-link unsubscribes go through
  // /api/unsubscribe and deliberately send nothing.
  const race = races.find((r) => r.id === body.raceId);
  if (removed && race) {
    const unsubAll = unsubscribeUrl(body.email);
    try {
      await sendEmail(
        body.email,
        cancelEmail(race, SITE_URL, unsubAll),
        unsubscribeHeaders(unsubAll),
      );
    } catch (error) {
      console.error("cancellation email failed:", error);
    }
  }

  return Response.json({ subscribed: false });
}
