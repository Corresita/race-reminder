/**
 * emails.ts — Race Reminder
 *
 * Three emails: confirm → open → closing.
 *
 * Voice: the SUBJECT is pure information + action (race, status, date) so it
 * groks in one inbox glance. WARMTH lives in the last line of the body — a
 * runner-to-runner aside, earned after the useful part. Every email carries a
 * visible unsubscribe link; letting people leave easily is part of the warmth.
 *
 * Each builder returns { subject, text, html }. Plain text is included for
 * deliverability; HTML is minimal and inline-styled (email clients are hostile
 * to real CSS). Dates render on their authored calendar day, never shifting
 * with the recipient's timezone.
 */

interface RaceLike {
  name: string;
  officialUrl: string;
  registrationOpens: string | null;
  registrationCloses: string | null;
}

/** Month + day + year in the race's authored timezone (no viewer-tz drift). */
function fmt(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

function shell(inner: string, unsubUrl: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#18181b;line-height:1.55;padding:8px;">
  ${inner}
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;">
  <p style="font-size:12px;color:#a1a1aa;">
    You're getting this because you asked Race Reminder to watch this race for you.
    <a href="${unsubUrl}" style="color:#a1a1aa;">Stop watching this one</a>.
  </p>
</div>`;
}

function cta(url: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${esc(url)}" style="background:#18181b;color:#fafafa;padding:12px 22px;text-decoration:none;border-radius:9999px;font-weight:600;display:inline-block;">${label}</a>
  </p>`;
}

// ── 1. CONFIRM — sent the instant they set a reminder ──────────────────────
export function confirmEmail(race: RaceLike, statusLabel: string, unsubUrl: string) {
  const when = race.registrationOpens
    ? `Registration is expected to open around ${fmt(race.registrationOpens)}.`
    : race.registrationCloses
      ? `Registration closes ${fmt(race.registrationCloses)}.`
      : `We're tracking its official site for the moment it opens.`;

  const subject = `We're watching ${race.name} for you.`;
  const text = [
    `Consider it handled.`,
    ``,
    `You asked us to keep an eye on ${race.name}. We will. ${when}`,
    `Current status: ${statusLabel}.`,
    ``,
    `You'll get one email the moment there's something to act on — and nothing in between.`,
    ``,
    `Until then, go run. We've got this one.`,
    ``,
    `Race page: ${race.officialUrl}`,
    `Unsubscribe: ${unsubUrl}`,
  ].join("\n");
  const html = shell(
    `<p style="font-size:18px;font-weight:600;margin:0 0 12px;">Consider it handled.</p>
     <p>You asked us to keep an eye on <strong>${esc(race.name)}</strong>. We will. ${esc(when)}</p>
     <p style="color:#71717a;">Current status: ${esc(statusLabel)}.</p>
     <p>You'll get one email the moment there's something to act on — and nothing in between.</p>
     <p style="color:#71717a;">Until then, go run. We've got this one.</p>`,
    unsubUrl,
  );
  return { subject, text, html };
}

// ── 2. OPEN — registration has opened ──────────────────────────────────────
export function openEmail(race: RaceLike, unsubUrl: string) {
  const closesClause = race.registrationCloses
    ? ` — closes ${fmt(race.registrationCloses)}`
    : "";
  const subject = `${race.name} registration is open${closesClause}`;
  const text = [
    `It's open.`,
    ``,
    `Registration for ${race.name} just opened${closesClause}.`,
    ``,
    `Register: ${race.officialUrl}`,
    ``,
    `This is the part you've been waiting for. See you on the start line.`,
    ``,
    `Unsubscribe: ${unsubUrl}`,
  ].join("\n");
  const html = shell(
    `<p style="font-size:18px;font-weight:600;margin:0 0 12px;">It's open.</p>
     <p>Registration for <strong>${esc(race.name)}</strong> just opened${esc(closesClause)}.</p>
     ${cta(race.officialUrl, "Go to registration →")}
     <p style="color:#71717a;">This is the part you've been waiting for. See you on the start line.</p>`,
    unsubUrl,
  );
  return { subject, text, html };
}

// ── 3. CLOSING — deadline approaching ──────────────────────────────────────
export function closingEmail(race: RaceLike, daysLeft: number, unsubUrl: string) {
  const dayWord = daysLeft === 1 ? "day" : "days";
  const closesOn = race.registrationCloses ? fmt(race.registrationCloses) : "soon";
  const subject = `${race.name} — ${daysLeft} ${dayWord} left to register`;
  const text = [
    `Closing soon.`,
    ``,
    `Registration for ${race.name} closes ${closesOn} — that's ${daysLeft} ${dayWord} away.`,
    ``,
    `Register: ${race.officialUrl}`,
    ``,
    `If you're still deciding — this is the nudge. Miss it and it's a year. No pressure. (Okay, a little pressure.)`,
    ``,
    `Unsubscribe: ${unsubUrl}`,
  ].join("\n");
  const html = shell(
    `<p style="font-size:18px;font-weight:600;margin:0 0 12px;">Closing soon.</p>
     <p>Registration for <strong>${esc(race.name)}</strong> closes <strong>${esc(closesOn)}</strong> — that's ${daysLeft} ${dayWord} away.</p>
     ${cta(race.officialUrl, "Register before it closes →")}
     <p style="color:#71717a;">If you're still deciding — this is the nudge. Miss it and it's a year. No pressure. (Okay, a little pressure.)</p>`,
    unsubUrl,
  );
  return { subject, text, html };
}
