/**
 * emails.ts — Race Reminder
 *
 * Five emails: confirm / cancel / opens-soon / open / closing.
 *
 * Voice: the SUBJECT is pure information + action (race, status, date) so it
 * groks in one inbox glance. WARMTH lives in the last line of the body — a
 * runner-to-runner aside, earned after the useful part. Every email carries a
 * visible unsubscribe link; letting people leave easily is part of the warmth.
 *
 * Frame: every email is a white card centered on a zinc canvas, bracketed by
 * the site's dot-dash rule (same bookend pair as the web page). A per-template
 * kicker sits above the top rule — "Welcome to" (confirm), "A message from"
 * (cancel), "A heads-up from" (opens-soon), "A reminder from" (open /
 * closing) — and the footer closes with the wordmark plus the site tagline.
 *
 * Each builder returns { subject, text, html }. Plain text is included for
 * deliverability; HTML is inline-styled (email clients are hostile to real
 * CSS; Outlook's Word engine squares off round dots and corners — accepted).
 * Dates render on their authored calendar day, never shifting with the
 * recipient's timezone.
 */

interface RaceLike {
  name: string;
  officialUrl: string;
  registrationOpens: string | null;
  registrationCloses: string | null;
  registrationType?: string;
  nextEdition?: { registrationOpens?: string | null } | null;
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

const FONT_STACK = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
const DISPLAY_STACK = `'Space Grotesk',${FONT_STACK}`;

function wordmark(px: number): string {
  return `<span style="font-family:${DISPLAY_STACK};font-size:${px}px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#18181b;">Race&nbsp;Reminder&trade;</span>`;
}

/** The site's dot-dash rule, email-safe: a 3-cell table (dot / dashes / dot). */
function dotRule(): string {
  const dot = `<div style="width:6px;height:6px;border-radius:3px;background:#a1a1aa;font-size:0;line-height:0;">&nbsp;</div>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      <td width="6" style="width:6px;">${dot}</td>
      <td style="vertical-align:middle;"><div style="border-top:1px dashed #a1a1aa;font-size:0;line-height:0;">&nbsp;</div></td>
      <td width="6" style="width:6px;">${dot}</td>
    </tr>
  </table>`;
}

/**
 * Card frame shared by every template: kicker + rule, white card, rule +
 * unsubscribe + wordmark + tagline. The card centers on the canvas; the text
 * inside stays left-aligned.
 */
function shell(inner: string, unsubUrl: string, kicker: string): string {
  return `<div style="padding:24px 12px;">
  <div style="max-width:600px;margin:0 auto;background:#fbfbfb;border:1px solid #a1a1aa;border-radius:24px;padding:36px 32px;font-family:${FONT_STACK};font-size:16px;color:#18181b;line-height:1.55;">
    <p style="margin:0 0 14px;font-family:${DISPLAY_STACK};font-size:13px;letter-spacing:0.15em;text-transform:uppercase;color:#3f3f46;">${kicker}&nbsp; ${wordmark(13)}</p>
    ${dotRule()}
    <div style="margin:36px 0;">
      ${inner}
    </div>
    ${dotRule()}
    <p style="font-size:14px;color:#a1a1aa;margin:20px 0 0;">
      Don't want these? <a href="${unsubUrl}" style="color:#a1a1aa;">Unsubscribe</a>.
    </p>
    <p style="margin:28px 0 10px;">${wordmark(14)}</p>
    <p style="font-size:14px;color:#71717a;margin:0;">
      Know the day registration opens. Every lottery draw, every deadline that
      matters — for the trail ultras you&rsquo;re chasing.
    </p>
  </div>
</div>`;
}

function cta(url: string, label: string): string {
  return `<p style="margin:28px 0;">
    <a href="${esc(url)}" style="background:#18181b;color:#fafafa;padding:13px 24px;text-decoration:none;border-radius:9999px;font-weight:600;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;display:inline-block;">${label}</a>
  </p>`;
}

// ── 1. CONFIRM — sent the instant they set a reminder ──────────────────────
export function confirmEmail(race: RaceLike, unsubUrl: string) {
  // Only a FUTURE open date supports "expected to open around X" — an open
  // date in the past means registration is underway, so lead with the
  // deadline instead (and never promise a "day it opens" that already went).
  const now = Date.now();
  const opensDate =
    race.registrationOpens && new Date(race.registrationOpens).getTime() > now
      ? fmt(race.registrationOpens)
      : null;
  const closesDate =
    race.registrationCloses && new Date(race.registrationCloses).getTime() > now
      ? fmt(race.registrationCloses)
      : null;

  const whenText = opensDate
    ? `Registration is expected to open around ${opensDate}. We'll email you the day it does.`
    : closesDate
      ? `Registration closes ${closesDate}. We'll email you before it does.`
      : `We're watching its official site — we'll email you the day registration opens.`;
  const whenHtml = opensDate
    ? `Registration is expected to open around <strong>${esc(opensDate)}</strong>. We&rsquo;ll email you the day it does.`
    : closesDate
      ? `Registration closes <strong>${esc(closesDate)}</strong>. We&rsquo;ll email you before it does.`
      : `We&rsquo;re watching its official site — we&rsquo;ll email you the day registration opens.`;

  const subject = `We're watching ${race.name} for you.`;
  const text = [
    `Got it — you're subscribed to ${race.name}.`,
    `We'll keep an eye on it for you!`,
    ``,
    whenText,
    ``,
    `Nothing to do now. Go run.`,
    `Wishing you a fine day :)`,
    ``,
    ``,
    ``,
    `View the race: ${race.officialUrl}`,
    ``,
    `Don't want these? Unsubscribe: ${unsubUrl}`,
    ``,
    `— Race Reminder`,
  ].join("\n");
  const html = shell(
    `<p>Got it — you&rsquo;re subscribed to <strong>${esc(race.name)}</strong>.<br>We&rsquo;ll keep an eye on it for you!</p>
     <p>${whenHtml}</p>
     <p>Nothing to do now. Go run.<br>Wishing you a fine day :)</p>
     <p style="margin:56px 0 0;"><a href="${esc(race.officialUrl)}" style="color:#18181b;">View the race →</a></p>`,
    unsubUrl,
    "Welcome to",
  );
  return { subject, text, html };
}

// ── 1a. CANCELLED — sent when a reminder is cancelled on the site ──────────
// (Not sent for email-link unsubscribes: after "stop emailing me", another
// email would be exactly the wrong reply. The site cancel is an account
// action, so it earns a receipt with an undo path.)
export function cancelEmail(
  race: RaceLike,
  siteUrl: string,
  unsubAllUrl: string,
) {
  const subject = `Reminder cancelled: ${race.name}`;
  const text = [
    `Done — we've stopped watching ${race.name} for you.`,
    ``,
    `No more emails about this race.`,
    ``,
    `Changed your mind? Set the reminder again anytime: ${siteUrl}`,
    ``,
    `Don't want any reminders? Unsubscribe from all races: ${unsubAllUrl}`,
    ``,
    `— Race Reminder`,
  ].join("\n");
  const html = shell(
    `<p>Done — we&rsquo;ve stopped watching <strong>${esc(race.name)}</strong> for you.</p>
     <p>No more emails about this race.</p>
     <p style="margin:56px 0 0;"><a href="${esc(siteUrl)}" style="color:#18181b;">Changed your mind? Set it again →</a></p>`,
    unsubAllUrl,
    "A message from",
  );
  return { subject, text, html };
}

// ── 1b. OPENS SOON — a known opening date is days away ─────────────────────
export function opensSoonEmail(
  race: RaceLike,
  daysLeft: number,
  unsubUrl: string,
) {
  const now = Date.now();
  // The soonest future open date — this edition's, or the announced next one.
  const opensIso = [
    race.registrationOpens,
    race.nextEdition?.registrationOpens,
  ].find((iso) => iso && new Date(iso).getTime() > now);
  const opensOn = opensIso ? fmt(opensIso) : "in a few days";
  const dayWord = daysLeft === 1 ? "day" : "days";
  const mechanism =
    race.registrationType === "lottery"
      ? `It's a lottery — no need to race the clock, but don't forget to enter.`
      : `It's first come, first served — popular races fill fast, so be ready.`;

  const subject = `${race.name} registration opens in ${daysLeft} ${dayWord}`;
  const text = [
    `Heads up — ${race.name} opens for registration on ${opensOn}. That's ${daysLeft} ${dayWord} away.`,
    ``,
    mechanism,
    ``,
    ``,
    ``,
    `View the race: ${race.officialUrl}`,
    ``,
    `Set your alarm. We'll email you again the moment it's open.`,
    ``,
    `Don't want these? Unsubscribe: ${unsubUrl}`,
    ``,
    `— Race Reminder`,
  ].join("\n");
  const html = shell(
    `<p>Heads up — <strong>${esc(race.name)}</strong> opens for registration on <strong>${esc(opensOn)}</strong>. That&rsquo;s ${daysLeft} ${dayWord} away.</p>
     <p>${esc(mechanism)}</p>
     <p style="margin:56px 0 24px;"><a href="${esc(race.officialUrl)}" style="color:#18181b;">View the race →</a></p>
     <p style="color:#71717a;margin-bottom:0;">Set your alarm. We&rsquo;ll email you again the moment it&rsquo;s open.</p>`,
    unsubUrl,
    "A heads-up from",
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
     ${cta(race.officialUrl, "Secure your place →")}
     <p style="color:#71717a;margin-bottom:0;">This is the part you've been waiting for. See you on the start line.</p>`,
    unsubUrl,
    "A reminder from",
  );
  return { subject, text, html };
}

// ── 3. CLOSING — deadline approaching ──────────────────────────────────────
export function closingEmail(
  race: RaceLike,
  daysLeft: number,
  unsubUrl: string,
) {
  const dayWord = daysLeft === 1 ? "day" : "days";
  const closesOn = race.registrationCloses
    ? fmt(race.registrationCloses)
    : "soon";
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
     ${cta(race.officialUrl, "Lock in your place →")}
     <p style="color:#71717a;margin-bottom:0;">If you're still deciding — this is the nudge. Miss it and it's a year. No pressure. (Okay, a little pressure.)</p>`,
    unsubUrl,
    "A reminder from",
  );
  return { subject, text, html };
}
