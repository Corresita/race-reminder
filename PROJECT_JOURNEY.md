# Project Journey

A log of how Race Radar went from an idea to a working project.

## The starting point: a runner's pain point (July 2026)

The idea: a trail race reminder website + app covering the UTMB World Series and the World Trail Majors. The core scenario — subscribe to the races you care about and get an email the moment registration opens. Popular ultra-trail races often sell out the day they open; miss the window and you wait a whole year.

## Research: has anyone built this already?

Two rounds of searching GitHub led to a clear conclusion: **nothing directly overlapping exists**, but there is a set of useful "spare parts" to learn from:

| Repository | What's relevant |
|---|---|
| [jdmc24/marathon-dashboard](https://github.com/jdmc24/marathon-dashboard) | Closest "complete product": race database + registration deadline tracking + email reminders (Gmail API + node-cron), but US road marathons only |
| [luisaneubauer/ultra-calendar](https://github.com/luisaneubauer/ultra-calendar) | Git-managed trail race data in YAML + generated `.ics` calendar feed — same domain, but no website and no notifications |
| [petecog/cycle-calendar](https://github.com/petecog/cycle-calendar) | UCI mountain bike calendar: scrape official data → iCal → weekly GitHub Actions → GitHub Pages; a zero-server subscription model |
| [ByungHeonLEE/marathon_check_bot](https://github.com/ByungHeonLEE/marathon_check_bot), [tbowww/race-registration-scraper](https://github.com/tbowww/race-registration-scraper) | Poll a registration page → push a notification; proof that the monitoring mechanic works |
| [thibtd/DataEng_UTMB_pipeline](https://github.com/thibtd/DataEng_UTMB_pipeline) | The only project focused on UTMB data (pipeline + recommender system) |
| [ricfog/TRAP-data](https://github.com/ricfog/TRAP-data) | ITRA + UTMB dataset (2021, no longer updated) — useful for understanding the data shape |

The commercial product [RaceNotify](https://racenotify.com/en) does exactly this kind of "registration opening alert", which proves the demand is real — but it is closed source and focused on European road racing. **The UTMB + WTM niche is wide open.**

## The repositioning: when my data told me my product idea was wrong

### The original vision

Race Radar started with a simple promise: *"Get notified before registration opens."* As a runner, that's the moment that feels most valuable — the starting gun of a registration race. I wrote it into the README before writing a line of feature code.

### The data audit that broke it

Then I built the dataset. After curating 21 races across UTMB World Series and World Trail Majors, I ran a simple check: how many races actually had a confirmed `registrationOpens` date?

**One.** Out of twenty-one.

This wasn't sloppy research — it's how the trail world works. Most organizers announce opening dates ad hoc, weeks in advance, on Instagram or in newsletters. The data my core promise depended on *structurally doesn't exist* in a reliable form. Meanwhile, `registrationCloses` was available for most races, because closing dates are published as part of the official race calendar.

I had two options: chase the missing data forever, or listen to what the data I *could* get was telling me.

### The pivot: from "opens" to "closes"

I repositioned V1 around the closing window: **"Registration is closing — X days left."**

At first this felt like a downgrade. Then I checked it against the actual pain. As a runner, missing an *opening* costs you a good bib price or a spot in a fast-selling race — annoying. Missing a *closing* means the race is simply gone for a year — catastrophic. The failure mode I could reliably detect was also the one that hurt most. The constraint didn't weaken the product; it aimed it.

**Design lesson:** the value proposition has to be built on data you can actually sustain, not data you wish existed. I'd rather ship a narrow promise I can keep than a broad one that silently fails.

### The second insight: races are cycles, not events

While deciding what to do with completed races, my first instinct was the standard one: hide them, they're noise. Then I caught myself checking the Hong Kong 100 page — a race that finished months ago — because I knew its next registration was about to be announced. (It was: July 30.)

That's when the model clicked. A trail race isn't a linear event that ends. It's an annual cycle:

> announced → registration opens → closes / sells out / lottery → race runs → **announced again**

A "completed" race is precisely the race whose next registration window is approaching. Hiding it would hide the product's job. So completed races stay visible, rolled forward into a "next edition watch" state. This came directly from my own behavior as a user — the kind of insight I don't think I could have reached from the outside of this sport.

### The engineering decision that made both possible: facts vs. conclusions

Early on, my JSON stored a `status` field per race: `"reg_open"`, `"completed"`. Within days it was already self-contradicting — one race was marked `reg_open` with no registration dates at all. Hand-written statuses rot the moment time passes.

The fix: **the data source stores only facts** (dates, timezone, mechanism), and **status is derived at runtime** from facts plus the current clock (`lib/deriveStatus.ts`). The only manual status left is `soldOut`, because no formula can know that. Separating source of truth from derived state is what makes the cyclical model work — statuses roll forward on their own as time passes, with zero maintenance.

### Scoping: trail only, and saying so out loud

The earliest sketch included the six road marathon majors. I cut them — not because they don't matter, but because their registration mechanics are standardized and already well-served. Trail is where the genuine complexity lives: lotteries, stones (UTMB), qualifiers, one-hour FCFS windows. **I focused on trail because registration-mechanism complexity is the actual problem being solved.** The lottery states in `deriveStatus.ts` (entry window → awaiting draw → drawn) are already designed for the next additions — Western States, Hardrock, and the 200-mile races — which have no "registration window" at all, only an entry period and a draw date.

### What I'd tell the me of three weeks ago

Your first value proposition is a hypothesis, not a commitment. The dataset is a user-research artifact — read it. And your own behavior as a user is data too; the moment you catch yourself doing something your own product doesn't support, that's the roadmap talking.

## Roadmap

1. ✅ Facts-only data schema, with status derived at runtime (`lib/deriveStatus.ts`)
2. ✅ Website: browse + filter, sorted by next actionable date
3. ⬜ Western States, Hardrock, and the 200-milers (lottery model is ready)
4. ⬜ iCal feed (zero-cost subscriptions, following the cycle-calendar model)
5. ⬜ Scheduled GitHub Actions scraping of UTMB `__NEXT_DATA__` to keep dates fresh
6. ⬜ Email alerts for closing windows
7. ⬜ Mobile app
