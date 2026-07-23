/**
 * subscriptions.ts — Race Reminder
 *
 * Subscriber + notification-log storage, shared by the subscribe API route
 * and the notify script. Two backends behind one interface:
 *
 *  - Upstash Redis (REST) when UPSTASH_REDIS_REST_URL / _TOKEN are set —
 *    required in production, where serverless filesystems are ephemeral.
 *  - Local JSON files in data/ otherwise, so `npm run dev` needs no accounts.
 *
 * Layout in Redis: hash "subscriptions" (field "raceId|email" → createdAt),
 * set "notified" (members "raceId|raceDate|email").
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface Subscription {
  email: string;
  raceId: string;
  createdAt: string;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- Upstash backend ----------

function upstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(command: (string | number)[]): Promise<unknown> {
  const config = upstashConfig();
  if (!config) throw new Error("Upstash is not configured");
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) {
    throw new Error(`Upstash ${response.status}: ${await response.text()}`);
  }
  return ((await response.json()) as { result: unknown }).result;
}

// ---------- Local file backend ----------

const subscriptionsPath = path.join(process.cwd(), "data", "subscriptions.json");
const notifiedPath = path.join(process.cwd(), "data", "notified.json");

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2) + "\n");
}

// ---------- Public interface ----------

export async function listSubscriptions(): Promise<Subscription[]> {
  if (upstashConfig()) {
    const flat = (await redis(["HGETALL", "subscriptions"])) as string[];
    const subscriptions: Subscription[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      const separator = flat[i].indexOf("|");
      subscriptions.push({
        raceId: flat[i].slice(0, separator),
        email: flat[i].slice(separator + 1),
        createdAt: flat[i + 1],
      });
    }
    return subscriptions;
  }
  return readJsonFile<Subscription[]>(subscriptionsPath, []);
}

/** Returns true when this is a new subscription, false if it already existed. */
export async function addSubscription(email: string, raceId: string): Promise<boolean> {
  if (upstashConfig()) {
    const created = await redis([
      "HSETNX",
      "subscriptions",
      `${raceId}|${email}`,
      new Date().toISOString(),
    ]);
    return created === 1;
  }
  const subscriptions = await readJsonFile<Subscription[]>(subscriptionsPath, []);
  if (subscriptions.some((sub) => sub.email === email && sub.raceId === raceId)) {
    return false;
  }
  subscriptions.push({ email, raceId, createdAt: new Date().toISOString() });
  await writeJsonFile(subscriptionsPath, subscriptions);
  return true;
}

/** Returns true when a subscription actually existed and was removed. */
export async function removeSubscription(email: string, raceId: string): Promise<boolean> {
  if (upstashConfig()) {
    const removed = await redis(["HDEL", "subscriptions", `${raceId}|${email}`]);
    return removed === 1;
  }
  const subscriptions = await readJsonFile<Subscription[]>(subscriptionsPath, []);
  const remaining = subscriptions.filter(
    (sub) => !(sub.email === email && sub.raceId === raceId),
  );
  if (remaining.length !== subscriptions.length) {
    await writeJsonFile(subscriptionsPath, remaining);
    return true;
  }
  return false;
}

/** Remove every subscription for an email. Returns how many were removed. */
export async function removeAllSubscriptions(email: string): Promise<number> {
  if (upstashConfig()) {
    const flat = (await redis(["HGETALL", "subscriptions"])) as string[];
    const fields: string[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      const key = flat[i];
      if (key.slice(key.indexOf("|") + 1) === email) fields.push(key);
    }
    if (fields.length > 0) await redis(["HDEL", "subscriptions", ...fields]);
    return fields.length;
  }
  const subscriptions = await readJsonFile<Subscription[]>(subscriptionsPath, []);
  const remaining = subscriptions.filter((sub) => sub.email !== email);
  if (remaining.length !== subscriptions.length) {
    await writeJsonFile(subscriptionsPath, remaining);
  }
  return subscriptions.length - remaining.length;
}

/** Keys of already-sent notifications ("raceId|raceDate|email"). */
export async function listNotified(): Promise<Set<string>> {
  if (upstashConfig()) {
    return new Set((await redis(["SMEMBERS", "notified"])) as string[]);
  }
  return new Set(await readJsonFile<string[]>(notifiedPath, []));
}

export async function markNotified(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  if (upstashConfig()) {
    await redis(["SADD", "notified", ...keys]);
    return;
  }
  const notified = await readJsonFile<string[]>(notifiedPath, []);
  await writeJsonFile(notifiedPath, [...new Set([...notified, ...keys])]);
}
