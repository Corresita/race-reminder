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

**Shows:** `RACE REMINDER™` wordmark, the description line, and live
counts: `{total} races · {open} open · {upcoming} upcoming · {closed}
closed`. **The counts are buttons**: open/upcoming/closed toggle a status
filter on the list; the races count clears it. The numbers stay global
(never affected by any filter).

**Data:** counts from `deriveStatus` over all races via `STATUS_GROUPS`.
Every status code lands in exactly one group, so the three always sum to
the total:

- `open` = `REG_OPEN`, `REG_CLOSING_SOON`, `LOTTERY_OPEN`
- `upcoming` = `REG_OPENS_SOON`, `LOTTERY_OPENS_SOON`,
  `COMPLETED_NEXT_KNOWN` (an announced next edition is "opening later",
  not "closed"), `REG_NOT_OPEN`, `DATES_TBA`
- `closed` = `REG_CLOSED`, `SOLD_OUT`, `LOTTERY_DRAWN`, `AWAITING_DRAW`,
  `COMPLETED_NEXT_TBA`

**Code:** `STATUS_GROUPS`, `counts`, `activeStatusGroup` in
`app/components/race-browser.tsx` (header lives in the client component so
the counts can drive filter state).

---

## 2. Hero / description

**Shows:** directly under the wordmark, one combined sentence-case line
(the h1): "Know the day registration opens. Every lottery draw, every
deadline that matters — for the trail ultras you're chasing." No divider
splits it; it sits inside the brand block, above the shared header rule
(`DotRule`: a 1px zinc-300 dashed line with a 6px round dot at each end
— decorative, `aria-hidden`). The same rule reappears above the footer
and nowhere else: the pair reads as bookends framing the page, and a
third use would demote it to ornament. Group dividers stay plain.

**Rules:** one font (default Inter), sentence case, gray — descriptive
supporting copy, not a wordmark. When the line wraps, it must break at
the em-dash, never mid-phrase: "— for the trail ultras you're chasing."
is wrapped in an `inline-block` span so it moves to the next line as a
unit (wide screens still render one line). The `<title>`/meta
description in `app/layout.tsx` are separate and tuned for search.

**Code:** header block in `app/components/race-browser.tsx`;
`<title>`/description in `app/layout.tsx`.

---

## 3. Control row (series · distance · search)

One wrapping row: series tabs, a thin divider, distance chips, and a
live search field (right-aligned, grows on mobile). All filters AND
together.

### Series tabs

**Shows:** `All Events` (default) / `UTMB` / `World Majors` / `Independent`.

**Data:** `race.series` — one of `utmb-world-series`, `world-trail-majors`,
`independent`. `All Events` = no series filter (`activeSeries === null`).

### Search

**Shows:** an input that filters as you type, matching race **name or
country** (case-insensitive substring).

**Code:** `searchQuery` state in `app/components/race-browser.tsx`.

### Distance filters

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

**One taxonomy everywhere:** the page sections mirror the header counts
exactly — same words, same numbers. Clicking a header count filters to
precisely one section.

1. **Open now (N)** — the `open` group, sorted by `compareStatus`
   (nearest deadline first).
2. **Upcoming — not open yet (N)** — the `upcoming` group. Races with a
   known future open date list directly (sorted by open date); races with
   no window at all collapse inside the `Awaiting dates (M)` `<details>`
   fold within this section. N counts both.
3. **Closed — nothing to act on (N)** — the `closed` group, dimmed.

**Rules:** section membership comes from `STATUS_GROUPS` (the same sets
behind the header counts); ordering from `compareStatus`. Card index
numbers (01, 02, …) run continuously across all sections.

**Code:** partition + sort in the `useMemo` of
`app/components/race-browser.tsx`; classification in `lib/deriveStatus.ts`.

---

## 6. Race card

Full-width horizontal bars stacked vertically with gaps — each row is its
own rounded white card with a hairline zinc-200 border on the light-gray
page (echoing the email frame's outline; one step lighter than the
zinc-300 dividers so 77 outlined cards don't get heavy); rows with
nothing to act on render dimmed (three columns per row, stacking on
mobile):

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

  The value is the card's one big figure: `font-mono` 18px semibold
  zinc-800 (a step lighter than zinc-900 body black), `leading-none`
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
  remembered in `localStorage`; POST/DELETE `/api/subscribe`). Hovering a
  set reminder turns it red and reads `Cancel reminder` (watch-style
  toggle); clicking cancels and emails a receipt.

**Code:** `renderRace`, `shortStatusLabels`, `countdownRow` in
`app/components/race-browser.tsx`.

---

## 7. Footer

**Shows:** the `DotRule` divider (the header rule's bookend twin, ~20px
above the content), then one row — the data-honesty note (manually
curated, confirm on official sites) on the left, and a `© 2026 Race
Reminder` copyright
line on the right — Space Grotesk 16px, zinc-900, with mixed weight and
tracking: "©2026" regular at 0.1em tracking, "Race Reminder"
semibold at 0.2em (the wordmark keeps its brand spacing; the legal
prefix stays quiet). The header wordmark: 16px semibold, 0.2em
tracking. No ™ here: in a copyright
line the name is the owner, not a brand mark ("© 2026 Apple Inc.", never
"Apple™"). ™ lives in the header wordmark and emails. Bump the year each
January.

**Code:** `app/page.tsx`.

---

## Typography

Three faces, loaded via `next/font` in `app/layout.tsx`, mapped to
Tailwind utilities in `app/globals.css`:

| Face              | Utility        | Used for                                        |
| ----------------- | -------------- | ----------------------------------------------- |
| **Space Grotesk** | `font-display` | the two brand wordmarks (header + footer)       |
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
- **Notifier** (`scripts/notify.ts`, daily) fires three dedup'd events per
  race edition — **opens-soon** (a known opening date within 3 days),
  **open** (entered an open state), **closing** (an open window within 3
  days of its deadline) — each subscriber gets each once: heads-up → open →
  closing nudge. Four HTML emails (confirm/opens-soon/open/closing) in
  `lib/emails.ts`: subject is the action signal, warmth in the last line,
  plain-text part included. `NOTIFY_NOW=<iso>` time-travels dry runs for
  testing.
- **Emails** — confirmation ("We're watching {race} for you."), a
  cancellation receipt for site-side cancels (with a re-subscribe path;
  email-link unsubscribes deliberately send nothing), and every reminder
  carry a visible unsubscribe link plus RFC 8058 List-Unsubscribe
  headers; `/api/unsubscribe` (GET + POST) removes one race or all.
- **Email template rules** (`shell()` in `lib/emails.ts`):
  - card frame: everything sits inside a rounded outer frame (1px
    zinc-400 border, radius 24, background #fbfbfb, `max-width:600px;
    margin:0 auto`) — outside the frame the email client's own
    background shows through. The body copy sits directly on the frame
    background (no white panel), flush-left with the kicker and footer;
    the frame centers, the text stays left-aligned
  - the card is bracketed by the site's dot-dash rule (email-safe 3-cell
    table; zinc-400 here for contrast on the gray canvas), mirroring the
    web page's bookends
  - kicker above the top rule, per template: "Welcome to" (confirm), "A
    message from" (cancel), "A heads-up from" (opens-soon), "A reminder
    from" (open, closing) — always ending in the wordmark; understated
    wording only, the tracked-caps frame turns cleverness into shouting
  - footer below the bottom rule: unsubscribe line, wordmark (14px), then
    the site tagline in gray
  - base copy 16px, footers 13–14px
  - race names and dates are **bold**; the when-line only uses **future**
    dates (a past opens date routes to the deadline or watching line)
  - quiet CTAs ("View the race →", "Set it again →") are regular-weight
    links with ~56px of air above; the two act-now emails use a black
    pill button with tracked uppercase label, a matched escalating pair:
    open = "Secure your place →", closing = "Lock in your place →"
  - signature is the brand wordmark (uppercase, 0.2em tracking, bold,
    zinc-900); email clients block webfonts, so the system stack carries
    the look with 'Space Grotesk' first for clients that have it
  - Outlook's Word engine squares off round dots, pill corners, and card
    radius — accepted degradation, everything stays legible
  - sender: `Race Reminder <hello@racereminder.run>` (Resend; SPF + DKIM +
    DMARC live on racereminder.run)
- **Dates** render on their authored calendar day (the ISO offset is the
  race's own timezone), never shifting with the viewer's timezone.

## Adjusting a block

Each block above is independent: copy lives in `page.tsx`, list mechanics
and card fields in `race-browser.tsx`, meaning in `deriveStatus.ts`. Rule
of thumb: if a change is about **what a status means**, edit
`deriveStatus`; if it's about **which fields show where**, edit the card;
if it's about **wording**, it's `page.tsx`/`layout.tsx`.
