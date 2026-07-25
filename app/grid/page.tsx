import type { Metadata } from "next";
import { type Race } from "@/app/components/race-browser";
import races from "@/data/races.json";
import { GridBrowser } from "./grid-browser";

/**
 * /grid — LAYOUT EXPERIMENT, not linked from anywhere.
 *
 * A gallery-grid take on the race list (one big framed board, every race an
 * index-card cell), with the home page's filters and search. Same data and
 * status derivation as the home page; no subscribe actions. The home page
 * is untouched; delete this folder to remove the experiment.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Race Reminder — grid layout test",
  robots: { index: false },
};

const raceData = races as unknown as Race[];

export default function GridTest() {
  // Stable per-request timestamp; the client reuses it during hydration.
  // eslint-disable-next-line react-hooks/purity
  return <GridBrowser races={raceData} initialNow={Date.now()} />;
}
