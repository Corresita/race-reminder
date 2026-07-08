# Race Radar

Never miss a trail race registration window again.

Race Radar tracks **UTMB World Series** and **World Trail Majors** races — race dates, registration opening and closing dates, entry methods (lottery vs. first come, first served), and index/points requirements — in one clean calendar.

## Why

Popular ultra-trail races sell out within days (sometimes hours) of registration opening, and every race has its own rules: UTMB Mont-Blanc runs a Running Stones lottery, Hong Kong 100 uses a ballot, Eiger Ultra-Trail is first come, first served. Keeping track of all these windows by hand means missed races. Race Radar puts every window in one place — and will eventually notify you before they open.

## Features

- Browse UTMB World Series and World Trail Majors races
- Filter by series and distance (20K / 50K / 100K / 100M)
- Registration window countdowns — time until registration opens, or time left to register
- Race status tracking: announced → registration open → closed / sold out → completed
- `npm run scrape` — checks every UTMB race against its official site (dates and per-distance registration status)

## Roadmap

- [ ] iCal feed (`.ics`) so you can subscribe from Apple/Google Calendar
- [ ] Email notifications when a subscribed race opens registration
- [ ] Automated data updates via GitHub Actions (scraper groundwork in `scripts/scrape.ts`)
- [ ] 2027 season data as races are announced
- [ ] Mobile app

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data

Race data lives in [`data/races.json`](data/races.json). Each race record looks like:

```json
{
  "id": "utmb-mont-blanc-2026",
  "name": "UTMB Mont-Blanc",
  "series": "UTMB World Series",
  "country": "France",
  "raceDate": "2026-08-28T06:00:00+02:00",
  "registrationOpens": null,
  "registrationCloses": "2026-01-15T23:59:59+01:00",
  "entryMethod": "lottery",
  "entryRequirement": "UTMB Index 100M + Running Stones",
  "distances": ["20K", "50K", "100K", "100M"],
  "officialUrl": "https://utmb.world/races/UTMB",
  "status": "reg_closed"
}
```

`registrationOpens` / `registrationCloses` are `null` when the organizer has not announced them yet (`TBA` in the UI). `status` is one of `announced`, `reg_open`, `reg_closed`, `sold_out`, `completed`.

> **Note:** Dates are community-maintained and may lag official announcements. Always confirm on the official race website before booking flights. Corrections via PR are very welcome!

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + React
- Tailwind CSS
- JSON file as the data store (deliberately simple for now)
- `scripts/scrape.ts` — dependency-free checker that reads event dates and registration status straight from the `__NEXT_DATA__` JSON embedded in UTMB race sites

## Project journey

The research, design decisions, and lessons learned behind this project are documented in [PROJECT_JOURNEY.md](PROJECT_JOURNEY.md).

## Contributing

Data corrections are the most valuable contribution right now — if you spot a wrong date or a missing race, open a PR against `data/races.json`.

## License

[MIT](LICENSE)
