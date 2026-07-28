/**
 * personalNotes.ts — Race Reminder
 *
 * Hand-written notes for specific subscribers, appended to ONE specific
 * email each (keyed event|raceId|email). Everyone else's emails are
 * byte-identical to the standard templates. Lines render verbatim.
 */

const NOTES: Record<string, string[]> = {
  "open|hk100|runmemoryflowers@gmail.com": [
    "(A little reminder for my cute boyfriend",
    "(Have fun at Glacier National Park!",
    "(Miss you already :)",
  ],
};

export function personalNote(
  event: string,
  raceId: string,
  email: string,
): string[] | null {
  return NOTES[`${event}|${raceId}|${email}`] ?? null;
}
