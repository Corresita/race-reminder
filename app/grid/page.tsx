import type { Metadata } from "next";
import Link from "next/link";
import { type Race } from "@/app/components/race-browser";
import races from "@/data/races.json";
import {
  compareStatus,
  deriveStatus,
  type DerivedStatus,
} from "@/lib/deriveStatus";

/**
 * /grid — LAYOUT EXPERIMENT, not linked from anywhere.
 *
 * A gallery-grid take on the race list (one big framed board, every race a
 * boxed cell), modeled on the REG-CHECK mockup. Read-only: same data and
 * status derivation as the home page, but no filters and no subscribe
 * actions. The home page is untouched; delete this folder to remove the
 * experiment.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Race Reminder — grid layout test",
  robots: { index: false },
};

const raceData = races as unknown as Race[];

type Pill = { label: string; kind: "open" | "waiting" | "closed" };

function pill(status: DerivedStatus): Pill {
  switch (status.code) {
    case "REG_OPEN":
    case "REG_CLOSING_SOON":
    case "LOTTERY_OPEN":
      return { label: "Open now", kind: "open" };
    case "REG_OPENS_SOON":
    case "LOTTERY_OPENS_SOON":
    case "COMPLETED_NEXT_KNOWN":
    case "REG_NOT_OPEN":
      return { label: "Not yet open", kind: "waiting" };
    case "SOLD_OUT":
      return { label: "Sold out", kind: "closed" };
    case "AWAITING_DRAW":
      return { label: "Awaiting draw", kind: "waiting" };
    case "LOTTERY_DRAWN":
      return { label: "Drawn", kind: "closed" };
    case "DATES_TBA":
      return { label: "Dates TBA", kind: "waiting" };
    default:
      return { label: "Closed", kind: "closed" };
  }
}

/** The big figure on the cell's media block, mockup-style ("04D", "22D+"). */
function figure(status: DerivedStatus): string {
  const d = status.daysUntil;
  switch (status.code) {
    case "REG_OPEN":
    case "REG_CLOSING_SOON":
    case "LOTTERY_OPEN":
      return d != null ? `${d}D` : "OPEN";
    case "REG_OPENS_SOON":
    case "LOTTERY_OPENS_SOON":
    case "COMPLETED_NEXT_KNOWN":
      return d != null ? `${d}D+` : "SOON";
    case "AWAITING_DRAW":
      return "DRAW";
    default:
      return "—";
  }
}

function factRow(status: DerivedStatus): { label: string; value: string } {
  const d = status.daysUntil;
  switch (status.code) {
    case "REG_OPEN":
    case "REG_CLOSING_SOON":
      return d != null
        ? { label: "Reg closes", value: `${d} days` }
        : { label: "Reg closes", value: "Until full" };
    case "LOTTERY_OPEN":
      return d != null
        ? { label: "Ballot ends", value: `${d} days` }
        : { label: "Ballot", value: "Open" };
    case "REG_OPENS_SOON":
    case "LOTTERY_OPENS_SOON":
      return { label: "Opens in", value: d != null ? `${d} days` : "TBA" };
    case "COMPLETED_NEXT_KNOWN":
      return { label: "Next opens", value: d != null ? `${d} days` : "TBA" };
    case "AWAITING_DRAW":
      return { label: "Draw in", value: d != null ? `${d} days` : "TBA" };
    case "SOLD_OUT":
      return { label: "Result", value: "Sold out" };
    default:
      return { label: "Next cycle", value: "TBA" };
  }
}

function action(
  status: DerivedStatus,
  officialUrl: string,
): { label: string; href: string | null } {
  switch (status.code) {
    case "REG_OPEN":
    case "REG_CLOSING_SOON":
      return { label: "Go to register", href: officialUrl };
    case "LOTTERY_OPEN":
      return { label: "Enter ballot", href: officialUrl };
    case "REG_OPENS_SOON":
    case "LOTTERY_OPENS_SOON":
    case "COMPLETED_NEXT_KNOWN":
    case "REG_NOT_OPEN":
      return { label: "Set reminder on home", href: "/" };
    default:
      return { label: "Closed", href: null };
  }
}

export default function GridTest() {
  const now = new Date();
  const rows = raceData
    .map((race) => ({ race, status: deriveStatus(race, now) }))
    .sort((a, b) => compareStatus(a.status, b.status));

  const openCount = rows.filter(
    (r) => r.status.actionable && !r.status.completed,
  ).length;

  return (
    <main className="min-h-screen w-full px-4 py-8 sm:px-8">
      <p className="mx-auto mb-4 max-w-screen-2xl text-xs text-zinc-500">
        Layout experiment — the{" "}
        <Link href="/" className="underline underline-offset-2">
          live site
        </Link>{" "}
        is unchanged.
      </p>

      <div className="mx-auto max-w-screen-2xl border border-zinc-300 bg-white">
        {/* Board header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-300 px-5 py-4 sm:px-7">
          <p className="font-display text-base font-semibold tracking-[0.2em] text-zinc-900 uppercase">
            Race Reminder™
          </p>
          <p className="text-xs tracking-wide text-zinc-500 uppercase">
            <span className="font-semibold text-zinc-900">{rows.length}</span>{" "}
            races
            <span className="mx-3">·</span>
            <span className="font-semibold text-zinc-900">
              {openCount}
            </span>{" "}
            actionable
          </p>
        </div>

        {/* The grid: hairlines between cells via gap-px over the frame color */}
        <ul className="grid grid-cols-1 gap-px bg-zinc-300 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {rows.map(({ race, status }) => {
            const p = pill(status);
            const fact = factRow(status);
            const act = action(status, race.officialUrl);
            const dark = p.kind === "open";
            return (
              <li key={race.id} className="flex flex-col bg-white">
                {/* Media block: typographic stand-in for the mockup photos */}
                <div
                  className={`relative h-36 ${dark ? "bg-zinc-900" : "bg-zinc-100"}`}
                >
                  <span
                    className={`absolute right-4 bottom-3 font-mono text-2xl font-semibold tracking-tight ${
                      dark ? "text-zinc-50" : "text-zinc-400"
                    }`}
                  >
                    {figure(status)}
                  </span>
                </div>

                <div className="flex grow flex-col px-5 pt-4 pb-5">
                  <p className="flex justify-between text-[11px] tracking-wide text-zinc-500 uppercase">
                    <span>{race.country ?? "—"}</span>
                    <span>{race.raceDate?.slice(0, 4) ?? "TBA"}</span>
                  </p>
                  <h2 className="font-display mt-1.5 text-lg leading-snug font-semibold text-zinc-900 uppercase">
                    {race.name}
                  </h2>

                  <div className="mt-auto pt-4">
                    <div className="flex items-center justify-between border-t border-zinc-200 py-2.5">
                      <span className="text-[11px] tracking-wide text-zinc-500 uppercase">
                        Status
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] tracking-wide uppercase ${
                          p.kind === "open"
                            ? "bg-zinc-900 text-zinc-50"
                            : p.kind === "waiting"
                              ? "border border-zinc-300 text-zinc-700"
                              : "border border-zinc-200 text-zinc-400"
                        }`}
                      >
                        {p.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-zinc-200 py-2.5">
                      <span className="text-[11px] tracking-wide text-zinc-500 uppercase">
                        {fact.label}
                      </span>
                      <span className="font-mono text-sm font-semibold text-zinc-800">
                        {fact.value}
                      </span>
                    </div>
                    {act.href ? (
                      <a
                        href={act.href}
                        target={act.href === "/" ? undefined : "_blank"}
                        rel={act.href === "/" ? undefined : "noopener"}
                        className="mt-2 block border border-zinc-400 px-4 py-2.5 text-center text-[11px] font-semibold tracking-[0.15em] text-zinc-900 uppercase transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                      >
                        {act.label}
                      </a>
                    ) : (
                      <p className="mt-2 border border-zinc-200 px-4 py-2.5 text-center text-[11px] tracking-[0.15em] text-zinc-400 uppercase select-none">
                        {act.label}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
