/**
 * watchlistToken.ts — Race Reminder
 *
 * HMAC-signed per-email tokens, so a link that acts on someone's
 * subscriptions (unsubscribe today, the watchlist page next) proves it came
 * from an email we sent them. The token binds the email only — no race, no
 * expiry — so one token serves every link and old emails keep working.
 * Rotating WATCHLIST_SECRET invalidates every link ever sent.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string | null {
  // || not ??: CI passes unset secrets through as empty strings
  return process.env.WATCHLIST_SECRET || null;
}

function sign(key: string, email: string): string {
  return createHmac("sha256", key)
    .update(email.trim().toLowerCase())
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

/** Token for this email, or null when WATCHLIST_SECRET is unset. */
export function watchlistToken(email: string): string | null {
  const key = secret();
  if (!key) {
    console.error("WATCHLIST_SECRET is not set; links go out unsigned");
    return null;
  }
  return sign(key, email);
}

export function verifyWatchlistToken(
  email: string,
  token: string | null | undefined,
): boolean {
  const key = secret();
  if (!key || !token) return false;
  const expected = Buffer.from(sign(key, email));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
