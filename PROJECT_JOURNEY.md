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

## Roadmap

1. ✅ Data schema built around registration windows, with correct series attribution
2. ✅ Website: browse + filter + registration window countdowns
3. ⬜ iCal feed (zero-cost subscriptions, following the cycle-calendar model)
4. ⬜ Scheduled GitHub Actions scraping of UTMB `__NEXT_DATA__` to keep statuses fresh
5. ⬜ Subscriptions + email notifications (registration opening / closing soon)
6. ⬜ Per-site scraper adapters for the World Trail Majors races
7. ⬜ Mobile app
