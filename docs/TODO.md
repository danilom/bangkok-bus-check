# TODO

Working notes on what is left, and on how we get from "data mashed together
from four sources" to "data we can trust". Last revised 2026-09-16.

## Where we are

- Backbone is the official **Namtang GTFS** feed (OTP, Ministry of Transport):
  `https://namtang-api.otp.go.th/download/namtang-gtfs.zip`, CC BY 4.0.
  Both directions, ordered stops, Thai + English, coordinates, hours.
- Wikipedia fills old numbers, private operators, ~120 routes the feed
  lacks, vehicles and notes, and cross-checks the termini (`agreement`).
- 909 routes: ~305 city bus lines, ~390 suburban, ~160 vans, loops modelled
  by rotation sense. 17 routes where the sources disagree are badged.
- Not needed any more: OSM, Transit Bangkok, BMTA site scraping, TSB
  infographics. The stop-order problem is gone with them.
- No route has been checked against reality yet.

## Data sources

| Source | Use | Status |
|---|---|---|
| Namtang GTFS | routes, directions, ordered stops, names, coordinates, hours | in use |
| Thai Wikipedia route list | old↔new numbers, operators, flags, gap-fill routes, notes | in use |
| BMTA site, TSB infographics | official reference for spot checks only | not collected |
| Transit Bangkok | not needed | — |
| OpenStreetMap | not needed (feed has geometry in `shapes.txt` for the map later) | removed |

## Collection and merge

- [x] GTFS fetch (selected tables) and parser; Wikipedia gap-fill; agreement flag.
- [ ] Van lines (`ต.`): keep or drop? Currently kept, badged "Van".
- [ ] Wikipedia-only routes (121): mostly suburban numbers the feed does not
      carry — check a few against the feed under other numbers.
- [ ] `calendar` tables: weekday-only / holiday services are not surfaced.

## Reliability checks — do these before trusting anything

### Measured against the operators' own material
- [ ] BMTA routes: compare the feed's stops with BMTA's key stops on
      `bmta.co.th/bus-lines/<id>` for 10–20 routes by eye (both directions).
- [ ] TSB routes: compare with 10–20 TSB infographics by eye.
- [ ] Known example to keep as a regression: 2-45 runs Bueng Kum ↔ Saphan
      Phut (feed and Wikipedia agree); anything listing Huai Khwang is stale.

### Cross-source agreement, computed at build time
- [x] Per route: termini compared between the feed and Wikipedia after
      normalising abbreviations and terminal synonyms; verdict stored as
      `agreement` in the index; `--verbose` lists the conflicts.
- [ ] Review the 17 conflicts: which side is right? Real changes (1-56 now
      ends at Mo Chit 2, 4-50 Om Yai ↔ Sanam Luang) vs Wikipedia lag.
- [ ] Feed freshness per route: `feed_info.feed_version` is the whole feed's
      date; nothing per route. Watch for routes whose stops change between
      snapshots.

### Shown in the app
- [x] Data date; "Sources disagree" and "Not in official feed" badges.
- [x] Only published directions; a loop side with no run is greyed out.
- [ ] Per-route source line in the detail view.

### Field verification (the only real-world check we have)
- [ ] `data/overrides/verified.json`: route id, date, who, which direction,
      result (`ok` / corrections). The app shows "verified <date>" on those.
- [ ] First batch: 5–6 lines ridden end to end in a week. Pick lines that
      cover the different data situations: a BMTA route, a TSB route, a loop
      (1-76 or 4-2), one of the 17 conflicts (1-56, 4-50), one van, and one
      only Wikipedia knows.
- [ ] While riding, note: does the number on the bus match `number`? Do the
      termini match the front sign? Is the stop order right? Which
      "prominent" stops would you want on the card?
- [ ] Corrections go into an overrides file the merge applies last, with a
      reason and date, so a refresh does not undo them.

### Spot checks against live systems (manual, occasional)
- [ ] ViaBus and Google Maps transit both show Bangkok bus routes; compare a
      handful of routes when something looks off. Not a source.

### Freshness
- [ ] Re-run the agreement check after every `fetch-raw`; newly conflicting
      routes are the ones to look at.
- [ ] Wikipedia notes carry dates of route changes; surface the latest date
      per route in the build report.

## Product, after the data is trustworthy

- [ ] "Via" line on the card: a few prominent stops picked by keyword
      (BTS/MRT/ARL, hospital, market, university, mall) from the stop list —
      selection, not sequencing.
- [ ] P3: show the Thai terminus alongside English so it can be matched to
      the front sign.
- [ ] Phase 2: map — `shapes.txt` from the feed (simplified) + MapLibre +
      OpenFreeMap; route line and stops as dots.
- [ ] Manual English overrides for the Wikipedia-only routes (Thai only).
- [ ] The `extra` badge has false positives from history notes.
- [ ] Real Android checks: sticky keypad vs Chrome's collapsing toolbar;
      reinstall the home-screen icon after the manifest colour change.
