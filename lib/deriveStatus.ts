/**
 * deriveStatus.ts — Race Reminder
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
  /** Latest registration status observed on the official site by the
   *  scraper. An observation is a fact; it is only consulted when the
   *  date facts above cannot reach a conclusion. */
  observed?: {
    status?: string | null;
    checkedAt?: string | null;
  } | null;
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
  | "REG_NOT_OPEN"           // race date known, registration not open yet
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
  /** True when the runner can still do something (register now or mark a
   *  known upcoming open date). False for terminal/waiting states —
   *  sold out, closed, drawn, awaiting draw, completed, dates unknown. */
  actionable: boolean;
  /** True when this edition's race has already been run. */
  completed: boolean;
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
        actionable: true,
        completed: true,
      };
    }
    // Next edition's registration has opened (we know the open date but no
    // close yet). Without this, the race would fall back to "next TBA" the
    // moment the window opened — exactly when subscribers must be told.
    if (nextOpens && now >= nextOpens) {
      const isLottery = race.registrationType === "lottery";
      return {
        code: isLottery ? "LOTTERY_OPEN" : "REG_OPEN",
        label: isLottery
          ? "Next edition — lottery entry open"
          : "Next edition — registration open",
        urgency: "normal",
        daysUntil: null,
        sortKey: nextOpens.getTime(),
        actionable: true,
        completed: true,
      };
    }
    return {
      code: "COMPLETED_NEXT_TBA",
      label: "Completed — next edition TBA",
      urgency: "none",
      daysUntil: null,
      sortKey: FAR_FUTURE,
      actionable: false,
      completed: true,
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
      actionable: false,
      completed: false,
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
      actionable: true,
      completed: false,
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
        actionable: true,
        completed: false,
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
        actionable: true,
        completed: false,
      };
    }
    return {
      code: "REG_OPEN",
      label: `Registration open — closes in ${d}d`,
      urgency: "normal",
      daysUntil: d,
      sortKey: closes.getTime(),
      actionable: true,
      completed: false,
    };
  }

  // ---- 4b. Open with no announced close ----
  // `opens` is in the past and no closing date is known. Without this branch
  // such a race would fall through to DATES_TBA and hide in the "awaiting
  // dates" fold while its registration is actually open.
  if (opens && now >= opens && !closes) {
    return {
      code: isLottery ? "LOTTERY_OPEN" : "REG_OPEN",
      label: isLottery ? "Lottery entry open" : "Registration open",
      urgency: "normal",
      daysUntil: null,
      sortKey: raceDate?.getTime() ?? FAR_FUTURE,
      actionable: true,
      completed: false,
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
        actionable: false,
        completed: false,
      };
    }
    if (isLottery && draw && now >= draw) {
      return {
        code: "LOTTERY_DRAWN",
        label: "Lottery results out",
        urgency: "none",
        daysUntil: raceDate ? daysBetween(now, raceDate) : null,
        sortKey: raceDate?.getTime() ?? FAR_FUTURE,
        actionable: false,
        completed: false,
      };
    }
    return {
      code: "REG_CLOSED",
      label: "Registration closed",
      urgency: "none",
      daysUntil: raceDate ? daysBetween(now, raceDate) : null,
      sortKey: raceDate?.getTime() ?? FAR_FUTURE,
      actionable: false,
      completed: false,
    };
  }

  // ---- 6. No usable dates — fall back to the scraper's observation ----
  // Date facts always win (they never reach here when conclusive); an
  // observation only rescues races whose windows were never announced.
  if (race.observed?.status === "registration_open") {
    return {
      code: isLottery ? "LOTTERY_OPEN" : "REG_OPEN",
      label: isLottery ? "Lottery entry open" : "Registration open",
      urgency: "normal",
      daysUntil: null,
      sortKey: raceDate?.getTime() ?? FAR_FUTURE,
      actionable: true,
      completed: false,
    };
  }
  if (race.observed?.status === "registration_closed") {
    return {
      code: "REG_CLOSED",
      label: "Registration closed",
      urgency: "none",
      daysUntil: raceDate ? daysBetween(now, raceDate) : null,
      sortKey: raceDate?.getTime() ?? FAR_FUTURE,
      actionable: false,
      completed: false,
    };
  }
  // Announced but not yet open — the race date is known, registration isn't.
  // (available_soon, or the scraper's between-editions marker.) Honest signal:
  // "not open yet", not "dates TBA".
  if (race.observed?.status === "available_soon" && raceDate) {
    return {
      code: "REG_NOT_OPEN",
      label: "Registration not open yet",
      urgency: "none",
      daysUntil: null,
      sortKey: raceDate.getTime(),
      actionable: false,
      completed: false,
    };
  }

  // ---- 7. Not enough facts ----
  return {
    code: "DATES_TBA",
    label: "Dates TBA",
    urgency: "none",
    daysUntil: null,
    sortKey: FAR_FUTURE,
    actionable: false,
    completed: false,
  };
}

/** Canonical list order: actionable races first (nearest actionable date
 *  wins), then everything the runner can only look at, TBA last. */
export function compareStatus(a: DerivedStatus, b: DerivedStatus): number {
  return Number(b.actionable) - Number(a.actionable) || a.sortKey - b.sortKey;
}

export function sortRaces(races: Race[], now: Date = new Date()): Race[] {
  return races
    .map((race) => ({ race, status: deriveStatus(race, now) }))
    .sort((a, b) => compareStatus(a.status, b.status))
    .map(({ race }) => race);
}
