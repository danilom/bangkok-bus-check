# TODO

Working notes on what is left, and on how we get from "data mashed together
from four sources" to "data we can trust". Last revised 2026-09-16.

## Where we are

- Routes: 435, keyed by (number, operator). Backbone from Thai Wikipedia;
  English termini and coordinates from OSM.
- Stop lists: OSM's, shown in the detail view. **Known bad**: OSM members are
  in ordered chunks concatenated out of order, and ~64% of stops are unnamed.
  Do not trust the order as displayed today.
- No route has been checked against reality.

## Data sources

| Source | Use | Status |
|---|---|---|
| Thai Wikipedia route list | route list, old↔new numbers, operator, flags, Thai termini | in use |
| OpenStreetMap | English names, coordinates, road geometry | in use (stop lists to be dropped) |
| BMTA site (`bmta.co.th/bus-lines/<id>`) | official key stops, **both directions**, fares, hours; ~100 BMTA routes | to collect (browser, one-off; WAF blocks scripts) |
| Transit Bangkok (`transitbangkok.com/lines/bangkok-bus-line/<n>`) | full ordered stop list, one direction, TH + EN; 364 routes incl. 109 of TSB's 125 | to collect (plain HTTP) |
| TSB infographics (`intranet.thaismilebus.com/RouteWebview/`, 141 images) | official key stops, one direction; images only | reference for spot checks; no OCR (Thai OCR is not usable) |

Not usable: ViaBus / TSB Go Plus (no API), data.go.th (nothing relevant),
transitbangkok.com terms (none published — accepted risk for a tiny app).

## Collection and merge

- [ ] `bbc fetch-raw --source transitbangkok`: index from
      `bangkok_bus_routes.php`, then EN + TH page per route → `data/raw/transitbangkok/`.
      Clean mojibake in Thai names. Keep the site's operator label.
- [ ] BMTA: one-off collection via the in-app browser at human pace →
      `data/raw/bmta/<id>.json` (number, title, both directions, fare, hours,
      depot, vehicle). Refresh the same way, rarely.
- [ ] `sources/transitbangkok.ts`, `sources/bmta.ts`; attach stop lists to
      routes by the numbers in the page title.
- [ ] Drop OSM stop bags from detail files; keep OSM directions for termini,
      English and (later) geometry.
- [ ] Per stop list record `source`, `direction` (`published` /
      `published-reverse`), and the snapshot date.

## Reliability checks — do these before trusting anything

### Measured error rates (before building on Transit Bangkok)
- [ ] BMTA routes: mechanically compare Transit Bangkok's list with BMTA's
      key stops — do BMTA's stops appear, in the same order? Report the share
      of routes that agree.
- [ ] TSB routes: read 15–20 TSB infographics by eye and compare with
      Transit Bangkok's list (1-31 matched on first check).
- [ ] Known stale example to keep as a regression: 73 / 2-45 on Transit
      Bangkok ends at Huai Khwang; BMTA, Wikipedia and OSM say Bueng Kum.

### Cross-source agreement, computed at build time
- [ ] Per route: do the termini agree across Wikipedia, OSM, Transit Bangkok,
      BMTA (name similarity, both languages)?
- [ ] Per route: do the stop lists overlap (BMTA key stops ⊂ Transit Bangkok
      list, order preserved)?
- [ ] Build report: counts of agree / disagree / single-source, and a list of
      disagreeing routes with what each source says.
- [ ] Store the verdict in the index (`agreement: 'all' | 'partial' |
      'conflict' | 'single'`) so the UI can show it.

### Shown in the app
- [ ] Data date (already) and, per route, the source of the stop list.
- [ ] A small marker on cards whose sources conflict; never a confident
      answer built from one stale source without saying so.
- [ ] Show only published directions; label an assumed reverse as assumed,
      or don't show it.

### Field verification (the only real-world check we have)
- [ ] `data/overrides/verified.json`: route id, date, who, which direction,
      result (`ok` / corrections). The app shows "verified <date>" on those.
- [ ] First batch: 5–6 lines ridden end to end in a week. Pick lines that
      cover all four sources: a BMTA route with both directions, a TSB route,
      one that Transit Bangkok has stale (2-45), one only Wikipedia knows.
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
- [ ] Phase 2: map (OSM geometry + MapLibre + OpenFreeMap), route line and
      stops as dots — unnamed stops are fine on a map.
- [ ] Manual English overrides for termini OSM lacks (~30 routes).
- [ ] The `extra` badge has false positives from history notes.
- [ ] Real Android checks: sticky keypad vs Chrome's collapsing toolbar;
      reinstall the home-screen icon after the manifest colour change.
