import races from "@/data/races.json";
import { SITE_URL } from "@/lib/email";
import { removeAllSubscriptions, removeSubscription } from "@/lib/subscriptions";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

function page(heading: string, body: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Race Reminder — Unsubscribe</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#f4f4f5;color:#18181b;font:400 15px/1.6 system-ui,-apple-system,sans-serif}
  main{max-width:26rem;padding:2.5rem;text-align:center}
  h1{font-size:.8rem;letter-spacing:.25em;text-transform:uppercase;color:#71717a;margin:0 0 1.25rem}
  p{margin:0 0 1rem}
  strong{color:#18181b}
  a{display:inline-block;margin-top:.5rem;color:#18181b;text-decoration:underline}
</style></head><body><main>
<h1>Race Reminder</h1>
<p>${heading}</p>
<p style="color:#71717a">${body}</p>
<a href="${SITE_URL}">Back to Race Reminder</a>
</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const raceId = url.searchParams.get("race") || "";
  const all = url.searchParams.get("all") === "1";

  if (!email) {
    return page("Something's missing.", "This unsubscribe link is invalid.", 400);
  }

  const safeEmail = escapeHtml(email);

  if (all || !raceId) {
    const removed = await removeAllSubscriptions(email);
    return page(
      "You're unsubscribed.",
      `Removed ${removed} race reminder${removed === 1 ? "" : "s"} for ${safeEmail}. You won't get any more emails from us.`,
    );
  }

  await removeSubscription(email, raceId);
  const race = races.find((r) => r.id === raceId);
  return page(
    "You're unsubscribed.",
    `We'll stop watching <strong>${escapeHtml(race?.name ?? "this race")}</strong> for ${safeEmail}.` +
      ` <a href="${SITE_URL}/api/unsubscribe?email=${encodeURIComponent(email)}&all=1">Unsubscribe from all races</a>`,
  );
}

export async function GET(request: Request) {
  return handle(request);
}

// Gmail/Apple one-click (List-Unsubscribe-Post) sends a POST to the same URL.
export async function POST(request: Request) {
  return handle(request);
}
