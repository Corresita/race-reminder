# Race Reminder 🏔️

**Never miss a registration window again.**

Trail race registrations don't fail politely. Miss the closing date of a first-come-first-served race, or a lottery entry window, and the answer is: *wait a year.* Race Reminder tracks the registration windows of major trail ultras in one place, and tells you what needs your attention — before it's too late.

**Live at:** [racereminder.run](https://racereminder.run)

---

## The problem

Every trail runner solves this the same broken way: bookmarked race websites, phone reminders set months in advance, group chats where someone hopefully remembers to post "registration closes Friday!!". Each race has its own mechanism — first-come-first-served, lottery, qualification points, running stones — and its own calendar. The information exists; it's just scattered across thirty websites that you have to remember to check.

## What Race Reminder does

One page. Every tracked race, sorted by **what needs action next**:

- ⏰ **Closing soon** — registration windows about to shut (the core alert)
- 🎟️ **Lottery windows** — entry periods and draw dates for UTMB Mont-Blanc, HK100, MIUT, and friends
- 🔄 **Next edition watch** — a completed race isn't dead, it's a signal: the next edition's registration is coming. Race Reminder keeps watching so you don't have to.

## Design principles

**Facts, not conclusions.** The data source (`data/races.json`) stores only facts: dates, timezones, registration mechanism. Status ("open", "closing soon", "completed") is never stored — it's derived at runtime from facts + current time (`lib/deriveStatus.ts`). The only manually maintained status is `soldOut`, because code can't know that. This means status can never silently go stale.

**Races are cycles, not events.** A trail race is a living annual organism. "Completed" is just one phase of its loop: announced → opens → closes → runs → announces again. Completed races stay visible, rolled forward into "next edition" tracking — because the moment a race finishes is exactly when its next registration date starts to matter.

**Scope: trail only, on purpose.** Road majors (Boston, London, Tokyo) are deliberately excluded. Their registration mechanisms are standardized and well-served. Trail ultras are where the complexity lives — lotteries, stones, qualifiers, tiny FCFS windows — and complexity is the problem worth solving.

## Coverage

Currently tracking 23 races across:

- **UTMB World Series** (incl. UTMB Mont-Blanc finals)
- **World Trail Majors**
- **Independent classics** — Western States 100, Hardrock 100

Independent races don't belong to either series (WSER is independent *with* a UTMB partnership — qualifier reciprocity, not membership), which is why the schema separates `series` from `organizer` and keeps mechanism quirks in `entryNotes`. Next up: the 200-mile scene (Cocodona 250, Moab 240, Bigfoot 200).

Race data is manually curated (with a scraper assist for UTMB sites — `npm run scrape`). Registration rules change rarely, but they do change — **always confirm on the official race website before booking flights.**

## Stack

Next.js · Tailwind CSS · static JSON data source. No backend, no database, no accounts — deliberately. V1 optimizes for zero maintenance cost and instant page loads.

## Roadmap

- [x] Western States and Hardrock
- [ ] The 200-milers (Cocodona 250, Moab 240, Bigfoot 200)
- [ ] `.ics` calendar export per race — let your own calendar do the reminding
- [ ] Email alerts for closing windows
- [ ] Community-submitted date corrections

## Project journey

The research, repositioning, and design decisions behind this project are documented in [PROJECT_JOURNEY.md](PROJECT_JOURNEY.md).

## Disclaimer

Race Reminder is an independent tool built by a trail runner, for trail runners. It is not affiliated with UTMB Group, WTM, or any race organizer. Dates are curated in good faith; the official race website is always the source of truth.

## License

[MIT](LICENSE)
