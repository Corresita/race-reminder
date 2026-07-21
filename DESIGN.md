# Race Reminder — Page Design & Information Architecture

One section per UI block, top to bottom. Each section lists what it shows,
where the data comes from, the display rules, and where the code lives — so
any block can be adjusted without touching the others.

Visual styling (colors, grid, imagery) is intentionally minimal for now;
this document describes the **information layer**. Reference inspirations:
REG-CHECK-style brand bar + big display type; numbered cards with contextual
countdowns.

---

## 1. Brand bar

**Shows:** `RACE REMINDER™` wordmark, one-line tagline, and live counts:
`{total} races · {open} open · {closed} closed`. **The counts are
buttons**: open/closed toggle a status filter on the list; the races count
clears it. The numbers stay global (never affected by any filter).

**Data:** counts from `deriveStatus` over all races via `STATUS_GROUPS`:

- `open` = codes `REG_OPEN`, `REG_CLOSING_SOON`, `LOTTERY_OPEN`
- `closed` = codes `REG_CLOSED`, `SOLD_OUT`, `LOTTERY_DRAWN`,
  `AWAITING_DRAW`, `COMPLETED_NEXT_KNOWN`, `COMPLETED_NEXT_TBA`
- races that are neither (opens-announced or dates-TBA) are counted in
  neither bucket — the numbers deliberately don't sum to the total

**Code:** `STATUS_GROUPS`, `counts`, `activeStatusGroup` in
`app/components/race-browser.tsx` (header lives in the client component so
the counts can drive filter state).

---

## 2. Hero / description

**Shows:** directly under the wordmark, one combined sentence-case line
(the h1): "Never miss a start line. Opening dates, deadlines, and lottery
draws — sorted by what needs action next." No divider splits it; it sits
inside the brand block, above the shared border.

**Rules:** one font (default Inter), sentence case, gray — descriptive
supporting copy, not a wordmark. The `<title>`/meta description in
`app/layout.tsx` are separate and tuned for search.

**Code:** header block in `app/components/race-browser.tsx`;
`<title>`/description in `app/layout.tsx`.

---

## 3. Series tabs

**Shows:** `All Events` (default) / `UTMB` / `World Majors` / `Independent`.

**Data:** `race.series` — one of `utmb-world-series`, `world-trail-majors`,
`independent`. `All Events` = no series filter (`activeSeries === null`).

**Code:** `seriesTabs` + `activeSeries` state in
`app/components/race-browser.tsx`.

---

## 4. Distance filters

**Shows:** `≤50K` / `50–100K` / `100K` / `100M` toggle chips.

**Data:** `race.distancesKm` — real course distances in km. UTMB races are
filled by the scraper from each sub-race's official distance stat; the
non-UTMB races are hand-verified.

**Rules (range buckets, a race matches if ANY distance falls in range):**

| Bucket  | Range         |
| ------- | ------------- |
| ≤50K    | km ≤ 50       |
| 50–100K | 50 < km < 85  |
| 100K    | 85 ≤ km < 130 |
| 100M    | km ≥ 130      |

Do **not** store bucket tags in data — buckets are derived, so boundary
changes are a one-file edit here.

**Code:** `distanceFilters` in `app/components/race-browser.tsx`.

---

## 5. Race list: grouping & order

Three groups, in order:

1. **Actionable** — `status.actionable === true` (open now, closing soon,
   ballot open, opens-announced, next-edition-open-date-known). Sorted by
   `compareStatus`: nearest actionable date first.
2. **No-action group** — everything with dates but nothing to do (closed,
   sold out, drawn, awaiting draw, completed). Separated by a labeled
   divider row: `Nothing to act on — closed, sold out, or completed (N)`.
   Same sort.
3. **Awaiting dates fold** — `DATES_TBA` and `REG_NOT_OPEN` races collapsed
   inside a `<details>` labeled `Awaiting dates (N)`: no registration window
   yet (dates unknown, or a known race date whose registration hasn't
   opened). Keeps them out of the main list while staying subscribable.

**Rules:** classification lives in the status machine
(`DerivedStatus.actionable`, `compareStatus`) — the UI never re-derives
meaning from status codes for ordering. Card index numbers (01, 02, …) run
continuously across all three groups.

**Code:** partition + sort in the `useMemo` of
`app/components/race-browser.tsx`; classification in `lib/deriveStatus.ts`.

---

## 6. Race card

Full-width horizontal bars stacked vertically with gaps — each row is its
own rounded white card on the light-gray page; rows with nothing to act on
render dimmed (three columns per row, stacking on mobile):

### 6a. Identity (left)

- index number + race name
- `organizer-or-series · country · year` (year from `raceDate`)
- official site link
- real-distance chips (`40K 70K 161K`), from `distancesKm`

### 6b. Facts (middle)

- **Race Date** — formatted `raceDate`, `TBA` when null
- **Entry** — `registrationType` (Lottery / First come, first served /
  Qualification)
- **Requires** — `entryRequirement` (only when present)
- small print — `entryNotes` (only when present)

### 6c. Registration (right)

- **short status badge**, colored by `status.urgency`
  (red = critical, amber = warning, green = normal, gray = none).
  Labels via `shortStatusLabels`: Open now / Closing soon / Ballot open /
  Not yet open / Awaiting draw / Ballot drawn / Closed / Sold out /
  Completed / Not open yet / Dates TBA
- **contextual countdown** — small-caps label + big value, via
  `countdownRow(status)`:

  | Status                  | Label                 | Value        |
  | ----------------------- | --------------------- | ------------ |
  | opens announced         | Opens in              | `{n}d`       |
  | completed, next known   | Next edition opens in | `{n}d`       |
  | open / closing soon     | Closes in             | `{n}d` / TBA |
  | ballot open             | Ballot ends in        | `{n}d` / Open|
  | awaiting draw           | Draw in               | `{n}d`       |
  | ballot drawn            | Ballot                | Drawn        |
  | sold out                | Status                | Sold out     |
  | closed / completed TBA  | Next cycle            | TBA          |
  | dates TBA               | Dates                 | TBA          |

  The value is the card's one big figure: `font-mono`, `leading-none`
  (so the box hugs the text and it reads vertically centered, not
  top-biased — Geist Mono's metrics sit high with looser leading).

  **Spacing rule — keep it balanced when the figure's size changes.**
  The figure must sit with equal *visual* space above (to the STATUS
  label) and below (to the action button). Two gotchas:
  - Use `leading-none` on the figure; otherwise extra line-height pushes
    the glyph to the top of its box and it looks top-biased.
  - The action button is a filled pill with its own `py-1.5` (~6px) top
    padding, so its **text** sits ~6px below its edge. Equal margins
    therefore look unequal. Compensate: the button container's top margin
    is ~6px *less* than the figure's top margin (currently figure
    `mt-2.5` ≈ 10px, button `mt-1.5` ≈ 6px). If the figure's font size
    changes, re-check both so the text-to-text gaps stay equal.

- **Opens / Closes dates** — only while the window is live
  (`status.actionable && !status.completed`); stale past-edition dates are
  hidden
- **Set reminder button** — `Set reminder` / `Reminder set ✓` (emerald
  when set; first click expands an inline email form, the email is
  remembered in `localStorage`; POST/DELETE `/api/subscribe`).

**Code:** `renderRace`, `shortStatusLabels`, `countdownRow` in
`app/components/race-browser.tsx`.

---

## 7. Footer

**Shows:** in one row — the data-honesty note (manually curated, confirm
on official sites) on the left, and a `RACE_REMINDER ©` wordmark on the
right, styled identically to the top brand mark (Space Grotesk, small,
semibold, 0.25em tracking, zinc-900).

**Code:** `app/page.tsx`.

---

## Typography

Three faces, loaded via `next/font` in `app/layout.tsx`, mapped to
Tailwind utilities in `app/globals.css`:

| Face              | Utility        | Used for                                        |
| ----------------- | -------------- | ----------------------------------------------- |
| **Space Grotesk** | `font-display` | wordmark, hero headline, footer wordmark        |
| **Inter**         | default        | everything else — labels, names, badges, body   |
| **Geist Mono**    | `font-mono`    | card index numbers, countdown figures           |

## Data & status reference

- **Facts only in `data/races.json`** — dates, type, distances, plus the
  scraper's `observed` status. Status is always derived at runtime by
  `lib/deriveStatus.ts` from facts + current time (the one exception:
  `soldOut`).
- **Hydration rule** — the server passes its render timestamp
  (`initialNow`) to the client so both render the identical DOM. Any new
  time-dependent UI must use `now` from that prop, never `new Date()`.
- **Scraper** (`scripts/scrape.ts`, 6-hourly via GitHub Actions) syncs
  UTMB races: event dates, real distances, sold-out, observed status. It
  aggregates only ranked World Series sub-races (ignores kids/fun runs),
  treats charity-bibs-only as sold out, and detects between-editions sites
  (announced next date but last edition's races still listed) as "not open
  yet" instead of carrying the old sold-out forward.
- **Notifier** (`scripts/notify.ts`, daily) fires two dedup'd events per
  race edition: **open** (entered an open state) and **closing** (an open
  window within 3 days of its deadline) — each subscriber gets each once.
  Three HTML emails (confirm/open/closing) in `lib/emails.ts`: subject is
  the action signal, warmth in the last line, plain-text part included.
- **Emails** — confirmation ("We're watching {race} for you.") and every
  reminder carry a visible unsubscribe link plus RFC 8058 List-Unsubscribe
  headers; `/api/unsubscribe` (GET + POST) removes one race or all.
- **Dates** render on their authored calendar day (the ISO offset is the
  race's own timezone), never shifting with the viewer's timezone.

## Adjusting a block

Each block above is independent: copy lives in `page.tsx`, list mechanics
and card fields in `race-browser.tsx`, meaning in `deriveStatus.ts`. Rule
of thumb: if a change is about **what a status means**, edit
`deriveStatus`; if it's about **which fields show where**, edit the card;
if it's about **wording**, it's `page.tsx`/`layout.tsx`.
