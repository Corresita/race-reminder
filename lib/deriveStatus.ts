/**
 * deriveStatus.ts — Race Radar
 *
 * Design principle: the JSON data source stores only FACTS (dates, registration
 * mechanism). STATUS is a CONCLUSION, derived at runtime from facts + current time.
 * The only manually-stored statuses are things code cannot derive: sold_out.
 *
 * Race lifecycle is CYCLICAL, not linear:
 *   announced → reg opens soon → reg open → closed/sold out/lottery → race completed → (next edition)
 * A "completed" race is not dead — it is a signal that the next edition's
 * registration is approaching. Completed races are therefore never hidden;
 * they roll forward into "next edition" states.
 */

// ---------- Data schema (facts only) ----------

export type RegistrationType = "fcfs" | "lottery" | "qualification";

export interface Race {
  id: string;
  name: string;
  /** ISO 8601 with timezone offset, e.g. "2027-01-16T08:00:00+08:00" */
  raceDate: string | null;
  registrationOpens: string | null;
  registrationCloses: string | null;
  registrationType: RegistrationType;
  /** Lottery races only: when results are drawn (WSER, Hardrock) */
  lotteryDrawDate?: string | null;
  /** The ONLY manual status. Code cannot know a race sold out. */
  soldOut?: boolean;
  /** Optional: known info about the next edition, for completed races.
   *  e.g. HK100 2026 completed, but 2027 registration opens July 30. */
  nextEdition?: {
    raceDate?: string | null;
    registrationOpens?: string | null;
  };
}

// ---------- Derived status ----------

export type StatusCode =
  | "REG_OPENS_SOON"      // opens date known, in the future
  | "REG_OPEN"            // inside the window
  | "REG_CLOSING_SOON"    // inside window, ≤ urgencyDays left  ← the core product value
  | "REG_CLOSED"          // window passed, race not yet run
  | "SOLD_OUT"
  | "LOTTERY_OPENS_SOON"
  | "LOTTERY_OPEN"
  | "AWAITING_DRAW"       // lottery entry closed, draw date pending
  | "LOTTERY_DRAWN"
  | "COMPLETED_NEXT_KNOWN"   // race ran; next edition's reg date is known
  | "COMPLETED_NEXT_TBA"     // race ran; watching for next edition announcement
  | "DATES_TBA";             // not enough facts to conclude anything

export type Urgency = "critical" | "warning" | "normal" | "none";

export interface DerivedStatus {
  code: StatusCode;
  /** Human-readable, ready for the UI badge */
  label: string;
  urgency: Urgency;
  /** Days until the next actionable moment (open / close / draw / next-edition open). Null if unknown. */
  daysUntil: number | null;
  /** Timestamp to sort the race list by. Unknown dates sort last. */
  sortKey: number;
}

const DAY_MS = 86_400_000;
const FAR_FUTURE = 8.64e15; // sorts unknowns to the bottom

function daysBetween(now: Date, target: Date): number {
  return Math.ceil((target.getTime() - now.getTime()) / DAY_MS);
}

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * @param race  the race record (facts)
 * @param now   current time — injected as a parameter, never read inside,
 *              so the function is pure and trivially testable
 * @param urgencyDays  window that triggers "closing soon" (default 14)
 */
export function deriveStatus(
  race: Race,
  now: Date = new Date(),
  urgencyDays = 14
): DerivedStatus {
  const raceDate = parse(race.raceDate);
  const opens = parse(race.registrationOpens);
  const closes = parse(race.registrationCloses);
  const draw = parse(race.lotteryDrawDate);

  // ---- 1. Race already completed → cyclical rollover ----
  if (raceDate && now > raceDate) {
    const nextOpens = parse(race.nextEdition?.registrationOpens);
    if (nextOpens && now < nextOpens) {
      const d = daysBetween(now, nextOpens);
      return {
        code: "COMPLETED_NEXT_KNOWN",
        label: `Next edition — registration opens in ${d}d`,
        urgency: d <= urgencyDays ? "warning" : "normal",
        daysUntil: d,
        sortKey: nextOpens.getTime(),
      };
    }
    return {
      code: "COMPLETED_NEXT_TBA",
      label: "Completed — next edition TBA",
      urgency: "none",
      daysUntil: null,
      sortKey: FAR_FUTURE,
    };
  }

  // ---- 2. Sold out (the one manual status) ----
  if (race.soldOut) {
    return {
      code: "SOLD_OUT",
      label: "Sold out",
      urgency: "none",
      daysUntil: raceDate ? daysBetween(now, raceDate) : null,
      sortKey: raceDate?.getTime() ?? FAR_FUTURE,
    };
  }

  const isLottery = race.registrationType === "lottery";

  // ---- 3. Before the window opens ----
  if (opens && now < opens) {
    const d = daysBetween(now, opens);
    return {
      code: isLottery ? "LOTTERY_OPENS_SOON" : "REG_OPENS_SOON",
      label: isLottery
        ? `Lottery entry opens in ${d}d`
        : `Registration opens in ${d}d`,
      urgency: d <= urgencyDays ? "warning" : "normal",
      daysUntil: d,
      sortKey: opens.getTime(),
    };
  }

  // ---- 4. Inside the window ----
  // Note: if `opens` is null but `closes` is in the future, we assume the
  // window is open. This matches reality for most FCFS trail races whose
  // opening date was never formally announced.
  if (closes && now <= closes) {
    const d = daysBetween(now, closes);
    if (isLottery) {
      return {
        code: "LOTTERY_OPEN",
        label: `Lottery entry open — closes in ${d}d`,
        urgency: d <= urgencyDays ? "critical" : "normal",
        daysUntil: d,
        sortKey: closes.getTime(),
      };
    }
    if (d <= urgencyDays) {
      // ← This state IS the product. Everything else exists to support it.
      return {
        code: "REG_CLOSING_SOON",
        label: `Closing soon — ${d}d left`,
        urgency: "critical",
        daysUntil: d,
        sortKey: closes.getTime(),
      };
    }
    return {
      code: "REG_OPEN",
      label: `Registration open — closes in ${d}d`,
      urgency: "normal",
      daysUntil: d,
      sortKey: closes.getTime(),
    };
  }

  // ---- 5. Window closed, race not yet run ----
  if (closes && now > closes) {
    if (isLottery && draw && now < draw) {
      const d = daysBetween(now, draw);
      return {
        code: "AWAITING_DRAW",
        label: `Lottery drawn in ${d}d`,
        urgency: "normal",
        daysUntil: d,
        sortKey: draw.getTime(),
      };
    }
    if (isLottery && draw && now >= draw) {
      return {
        code: "LOTTERY_DRAWN",
        label: "Lottery results out",
        urgency: "none",
        daysUntil: raceDate ? daysBetween(now, raceDate) : null,
        sortKey: raceDate?.getTime() ?? FAR_FUTURE,
      };
    }
    return {
      code: "REG_CLOSED",
      label: "Registration closed",
      urgency: "none",
      daysUntil: raceDate ? daysBetween(now, raceDate) : null,
      sortKey: raceDate?.getTime() ?? FAR_FUTURE,
    };
  }

  // ---- 6. Not enough facts ----
  return {
    code: "DATES_TBA",
    label: "Dates TBA",
    urgency: "none",
    daysUntil: null,
    sortKey: FAR_FUTURE,
  };
}

/** List sorting: most urgent / nearest actionable date first, TBA last. */
export function sortRaces(races: Race[], now: Date = new Date()): Race[] {
  return [...races].sort(
    (a, b) => deriveStatus(a, now).sortKey - deriveStatus(b, now).sortKey
  );
}
