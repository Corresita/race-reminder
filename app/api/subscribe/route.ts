import races from "@/data/races.json";
import { deriveStatus, type Race } from "@/lib/deriveStatus";
import {
  sendEmail,
  unsubscribeHeaders,
  unsubscribeUrl,
} from "@/lib/email";
import { confirmEmail } from "@/lib/emails";
import {
  EMAIL_PATTERN,
  addSubscription,
  removeSubscription,
} from "@/lib/subscriptions";

async function parseBody(
  request: Request,
): Promise<{ email: string; raceId: string } | null> {
  try {
    const body = (await request.json()) as { email?: unknown; raceId?: unknown };
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const raceId = typeof body.raceId === "string" ? body.raceId : "";
    if (!EMAIL_PATTERN.test(email) || !raceId) return null;
    return { email, raceId };
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

  const created = await addSubscription(body.email, body.raceId);

  if (created) {
    // Confirmation is best-effort: a failed email must not fail the subscribe.
    const status = deriveStatus(race as unknown as Race);
    const unsubscribe = unsubscribeUrl(body.email, race.id);
    try {
      await sendEmail(
        body.email,
        confirmEmail(race, status.label, unsubscribe),
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

  await removeSubscription(body.email, body.raceId);
  return Response.json({ subscribed: false });
}
