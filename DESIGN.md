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
filter on the list; the races count clears it. The numbers follow the
active series/distance/search filters (counts and section headings read
the same `visible` array — a single source, so they can never disagree);
only the status-group filter leaves them untouched, because the counts
are that filter's own control.

**Data:** counts from `deriveStatus` over the visible races via
`STATUS_GROUPS`.
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

## 3. Control row (series · distance · region · search)

One wrapping row: series tabs, a thin divider, distance chips, and a
right-aligned pair — region dropdown + live search field (search grows
on mobile). All filters AND together. The row is **sticky** (top-0,
translucent page-background + backdrop blur): filters are the page's
navigation, so they ride along while scrolling the 77 cards — which is
also why there is no back-to-top button. Only this row sticks; the
header (wordmark/hero/counts) scrolls away, it's too tall to pin.

### Series tabs

**Shows:** `All Events` (default) / `UTMB` / `World Majors` / `Independent`.

**Data:** `race.series` — one of `utmb-world-series`, `world-trail-majors`,
`independent`. `All Events` = no series filter (`activeSeries === null`).

### Region dropdown

**Shows:** a pill-shaped `<select>`: All regions / Europe / North
America / South America / Asia / Oceania / Africa. Dark pill while a
region is active. A dropdown, not chips — six more chips would blow up
the row.

**Data:** `COUNTRY_REGION`, a country→continent map derived in code (no
data-file changes). Judgment call: Türkiye files under Europe — that's
where users look for Kaçkar. No sort controls beyond this: "most
urgent" is already the canonical order, and A–Z is outdone by search.

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

1. **Open now (N)** — the `open` group, sorted by `compareStatus`:
   races with a real countdown first (nearest deadline wins), then
   "open until full" races (no time pressure) in the back half, ordered
   by race day. Urgency outranks proximity of the race itself.
2. **Upcoming — not open yet (N)** — the `upcoming` group. Races with a
   known future open date list directly (sorted by open date); races with
   no window at all collapse inside the `Awaiting dates (M)` `<details>`
   fold within this section. N counts both.
3. **Closed — nothing to act on (N)** — the `closed` group, dimmed.

**Rules:** section membership comes from `STATUS_GROUPS` (the same sets
behind the header counts); ordering from `compareStatus`. Card index
numbers (01, 02, …) run continuously across all sections. Each section
lays its cards out in the shared responsive matrix (1 / 2 / 3 / 4
columns at base / sm / lg / 2xl).

**Code:** partition + sort in the `useMemo` of
`app/components/race-browser.tsx`; classification in `lib/deriveStatus.ts`.

---

## 6. Race card

Vertical index cards in a responsive matrix — 1 column on phones, 2 / 3 /
4 at sm / lg / 2xl. Each race is its own card: rounded-2xl, hairline
zinc-200 border, white on the light-gray page (echoing the email frame's
outline; one step lighter than the zinc-300 dividers so 77 outlined cards
don't get heavy). `items-stretch` keeps every card in a row equal-height;
the bottom block is pinned with `mt-auto` so buttons align across a row.
Cards with nothing to act on render dimmed. Top to bottom:

### 6a. Identity (top)

- index number (mono, 11px, zinc-400) left · **short status pill** right,
  colored by `status.urgency` (red = critical, amber = warning, green =
  normal, gray = none). Labels via `shortStatusLabels`: Open now /
  Closing soon / Ballot open / Not yet open / Awaiting draw / Ballot
  drawn / Closed / Sold out / Completed / Not open yet / Dates TBA
- race name (18px medium, links to the official site)
- `organizer-or-series · country · year` meta line (11px tracked caps).
  The year is the edition the card is about: once this edition completes
  and the organizer announces the next one, `nextEdition.raceDate`'s
  year takes over; with nothing announced the completed year stays
  (facts only — never +1 guessing)
- real-distance chips (`40K 70K 161K`), from `distancesKm`

### 6b. Facts (bottom block, above a zinc-200 top border)

- **key date + type row** — left: `dateRow(race, status, now)`, the next
  calendar date that matters (Opens / Closes / Draw / Race day + "05 DEC"
  short format; Dates TBA when nothing is known). Right: **Entry** —
  Lottery / First come / Qualification (no "FCFS" — domain jargon stays
  out of the UI)
- **Requires** — `entryRequirement`; small print `entryNotes` (only when
  present)
- **contextual countdown** — small-caps label + the card's one big
  figure, via `countdownRow(status)`:

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

  The figure is `font-mono` 18px semibold zinc-800, `leading-none`
  (Geist Mono's metrics sit high with looser leading).

### 6c. Action (full-width pill, three-tier hierarchy)

- **solid black** — act now: `Register ↗` (open, no deadline; external
  link to the official site). No status words on buttons — the pill
  reports state, the button is pure verb; across a full screen of open
  cards, repeating "Open now" twice per card reads as shouting
- **outlined** — reminders: `Remind me when it opens` / `Remind me
  before it closes` via `reminderAffordance` (the button never promises
  what the notifier can't deliver). Subscribed state is emerald
  `Reminder set ✓`; hovering turns it red and reads `Cancel reminder`
  (watch-style toggle); clicking cancels and emails a receipt. First
  click expands an inline email form; the email is remembered in
  `localStorage`; POST/DELETE `/api/subscribe`
- **gray, inert** — `Dates not announced yet`

**Code:** `renderRace`, `shortStatusLabels`, `countdownRow`, `dateRow` in
`app/components/race-browser.tsx`; `lib/reminderAffordance.ts`.

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
    table; zinc-400 — one step darker than the site's zinc-300 rule,
    for weight on the email canvas), mirroring the web page's bookends
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
