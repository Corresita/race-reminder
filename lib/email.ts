/**
 * email.ts — Race Reminder
 *
 * One Resend-backed sender shared by the notify script and the subscribe
 * API. Without RESEND_API_KEY nothing is sent and the call reports a dry
 * run, so local dev needs no account.
 */

export const SITE_URL =
  process.env.SITE_URL || "https://race-reminder.vercel.app";

/** One-click unsubscribe link for a given subscriber + race. */
export function unsubscribeUrl(email: string, raceId?: string): string {
  const params = new URLSearchParams({ email });
  if (raceId) params.set("race", raceId);
  return `${SITE_URL}/api/unsubscribe?${params.toString()}`;
}

/** RFC 8058 headers so Gmail/Apple Mail show a native one-click unsubscribe. */
export function unsubscribeHeaders(url: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export interface EmailContent {
  subject: string;
  text: string;
  html?: string;
}

/** Returns true when actually sent, false on dry run (no API key). */
export async function sendEmail(
  to: string,
  content: EmailContent,
  headers?: Record<string, string>,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      // || not ??: CI passes unset secrets through as empty strings
      from: process.env.EMAIL_FROM || "Race Reminder <onboarding@resend.dev>",
      to,
      subject: content.subject,
      text: content.text,
      ...(content.html ? { html: content.html } : {}),
      ...(headers ? { headers } : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${await response.text()}`);
  }
  return true;
}
