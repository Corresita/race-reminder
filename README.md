# Race Reminder

Never miss a trail ultra registration.

**Live Site**: [racereminder.run](https://racereminder.run)

Race Reminder tracks **77 ultra-trail races** — the full UTMB World Series calendar (65 events), the World Trail Majors, and independent classics like Western States and Hardrock — with race dates, registration windows, entry methods (lottery vs. first come, first served), and index requirements in one clean calendar.

## Why

Popular ultra-trail races sell out within days (sometimes hours) of registration opening, and every race has its own rules: UTMB Mont-Blanc runs a Running Stones lottery, Hong Kong 100 uses a ballot, Eiger Ultra-Trail is first come, first served. Keeping track of all these windows by hand means missed races. Race Reminder puts every window in one place — and emails you when the ones you care about open.

## Features

- **Browse 77 races** across UTMB World Series, World Trail Majors, and independents
- **Filter** by series and distance range (≤50K / 50–100K / 100K / 100M), computed from each race's real course distances
- **Registration countdowns** — time until registration opens, or time left to register, sorted by what needs action next
- **Derived race status** — announced → registration open → closing soon → closed / sold out → completed → next edition; computed at runtime from stored facts, never stored by hand
- **Email reminders** — subscribe to a race with your email and get notified when its registration window opens
- **Auto-updating data** — a scraper syncs every UTMB race against its official site (event dates, distances, sold-out and registration status) every 6 hours via GitHub Actions

## Roadmap

- [ ] iCal feed (`.ics`) so you can subscribe from Apple/Google Calendar
- [x] Email notifications when a subscribed race opens registration (`scripts/notify.ts`, daily via GitHub Actions)
- [x] Automated data updates via GitHub Actions (`scripts/scrape.ts` syncs official UTMB sites every 6 hours)
- [ ] Exact registration open/close dates for the full UTMB calendar (sites expose live status, not dates — those stay hand-curated)
- [ ] 2027 season data as races are announced
- [ ] Mobile app

## Running locally

Want to use the app? Just visit [racereminder.run](https://racereminder.run) — no setup needed. The steps below are for developing or contributing.

### Prerequisites

- Node.js 18+

### Installation

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables (optional)

Only needed to actually send reminder emails — everything else works without configuration:

```env
RESEND_API_KEY=re_...                        # from https://resend.com; without it, notify runs dry
EMAIL_FROM="Race Reminder <you@yourdomain.com>" # a sender verified in Resend (optional)
```

## Project structure

```
race-reminder/
├── app/
│   ├── page.tsx                 # Server component: loads races, renders the page
│   ├── components/
│   │   └── race-browser.tsx     # Client component: tabs, filters, subscribe buttons
│   └── api/
│       └── subscribe/route.ts   # POST/DELETE subscription endpoint
├── lib/
│   ├── deriveStatus.ts          # Facts → status derivation (the core logic)
│   └── subscriptions.ts         # Subscriber storage shared by API + notifier
├── scripts/
│   ├── scrape.ts                # Checks races against official UTMB sites
│   └── notify.ts                # Emails subscribers when registration opens
└── data/
    ├── races.json               # The race database (facts only)
    └── subscriptions.json       # Subscribers (gitignored, created on first use)
```

## Available scripts

```bash
npm run dev      # Start the dev server
npm run build    # Production build
npm run lint     # ESLint
npm run scrape             # Diff every UTMB race against its official site (dry run)
npm run scrape -- --write  # Apply the changes to data/races.json
npm run notify             # Email subscribers whose races just opened (dry run without RESEND_API_KEY)
```

## API endpoints

| Method | Endpoint         | Description                                      |
| ------ | ---------------- | ------------------------------------------------ |
| POST   | `/api/subscribe` | Subscribe an email to a race (`{email, raceId}`) |
| DELETE | `/api/subscribe` | Remove a subscription (`{email, raceId}`)        |

Subscriptions are stored in `data/subscriptions.json` (gitignored — it contains email addresses). `scripts/notify.ts` reads them, derives each race's status, and emails subscribers whose race has an open window — at most once per race edition.

## Data

Race data lives in [`data/races.json`](data/races.json). The file stores **facts only** — status is derived at runtime by [`lib/deriveStatus.ts`](lib/deriveStatus.ts) from the facts plus the current time. Each race record looks like:

```json
{
  "id": "utmb-mont-blanc",
  "name": "UTMB Mont-Blanc",
  "series": "utmb-world-series",
  "country": "France",
  "raceDate": "2026-08-28T06:00:00+02:00",
  "registrationOpens": null,
  "registrationCloses": "2026-01-15T23:59:59+01:00",
  "registrationType": "lottery",
  "entryRequirement": "UTMB Index 100M + Running Stones",
  "distancesKm": [15, 40, 60, 101, 145, 174, 300],
  "officialUrl": "https://montblanc.utmb.world/"
}
```

`registrationOpens` / `registrationCloses` are `null` when the organizer has not announced them yet (`TBA` in the UI). `registrationType` is `fcfs`, `lottery`, or `qualification`; lottery races may carry a `lotteryDrawDate`. The only manually stored status is `soldOut: true` — code cannot know a race sold out. Everything else (open, closing soon, closed, completed, next edition) is a conclusion, not a field.

### Data sources

| Source                                                                    | Coverage                    | Data provided                                        |
| ------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------- |
| [utmb.world](https://utmb.world/utmb-world-series-events) event calendar | 65 UTMB World Series races  | Names, dates, countries, distances, official sites   |
| Official race sites (via `npm run scrape`)                                | UTMB subdomains             | Event dates, per-distance registration status        |
| Manual curation                                                            | World Trail Majors + WSER/Hardrock + registration windows | Registration windows, entry requirements, lottery details |

> **Note:** Dates are manually curated and may lag official announcements. Always confirm on the official race website before booking flights.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + React
- Tailwind CSS
- JSON files as the data store (deliberately simple for now)
- [Resend](https://resend.com) for reminder emails
- Dependency-free scraper that reads the `__NEXT_DATA__` JSON embedded in UTMB race sites

## Project journey

The research, design decisions, and lessons learned behind this project are documented in [PROJECT_JOURNEY.md](PROJECT_JOURNEY.md). The page's information architecture — every UI block, its data, and its display rules — lives in [DESIGN.md](DESIGN.md).

## Contributing

Data corrections are the most valuable contribution right now — if you spot a wrong date or a missing race, open a PR against `data/races.json`.

1. Fork the repository
2. Create a branch (`git checkout -b fix/eiger-2027-dates`)
3. Commit your changes
4. Open a Pull Request

## License

[MIT](LICENSE)
