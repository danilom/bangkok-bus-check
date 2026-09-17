

[x] Bug: on Android full screen, pressing the back button leads to an empty page
    -- firefox bug, not an issue in Chrome

[x] Bug: on the details page, focusing the input field does not bring up the keyboard
    -- keypad now follows the input's focus on every screen

[x] Full chip should be clickable
    -- left half of the card opens the left direction, right half the right


## Planning notes (Claude)

Data-source status, reliability checks and product backlog. Last revised 2026-09-16.

### Where we are

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

### Data sources

| Source | Use | Status |
|---|---|---|
| Namtang GTFS | routes, directions, ordered stops, names, coordinates, hours | in use |
| Thai Wikipedia route list | old↔new numbers, operators, flags, gap-fill routes, notes | in use |
| BMTA site, TSB infographics | official reference for spot checks only | not collected |
| Transit Bangkok | not needed | — |
| OpenStreetMap | not needed (feed has geometry in `shapes.txt` for the map later) | removed |

### Collection and merge

- [x] GTFS fetch (selected tables) and parser; Wikipedia gap-fill; agreement flag.
- [x] `data/overrides/translations.json`: hand-supervised English, keyed by
      Thai text, sections `places` and `operators`; `bbc extract-places`
      adds drafts, the build applies them (override → feed → entry).
- [x] Translations: `places` (82) and `operators` (31) drafted and reviewed;
      `vehicles` (47) drafted, awaiting review.
- [ ] Van lines (`ต.`): keep or drop? Currently kept, badged "Van".
- [ ] Wikipedia-only routes (121): mostly suburban numbers the feed does not
      carry — check a few against the feed under other numbers.
- [ ] `calendar` tables: weekday-only / holiday services are not surfaced.

### Reliability checks — do these before trusting anything

#### Measured against the operators' own material
- [ ] BMTA routes: compare the feed's stops with BMTA's key stops on
      `bmta.co.th/bus-lines/<id>` for 10–20 routes by eye (both directions).
- [ ] TSB routes: compare with 10–20 TSB infographics by eye.
- [ ] Known example to keep as a regression: 2-45 runs Bueng Kum ↔ Saphan
      Phut (feed and Wikipedia agree); anything listing Huai Khwang is stale.

#### Cross-source agreement, computed at build time
- [x] Per route: termini compared between the feed and Wikipedia after
      normalising abbreviations and terminal synonyms; verdict stored as
      `agreement` in the index; `--verbose` lists the conflicts.
- [ ] Review the 17 conflicts: which side is right? Real changes (1-56 now
      ends at Mo Chit 2, 4-50 Om Yai ↔ Sanam Luang) vs Wikipedia lag.
- [ ] Feed freshness per route: `feed_info.feed_version` is the whole feed's
      date; nothing per route. Watch for routes whose stops change between
      snapshots.

#### Shown in the app
- [x] Data date; "Sources disagree" and "Not in official feed" badges.
- [x] Only published directions; a loop side with no run is greyed out.
- [ ] Per-route source line in the detail view.

#### Field verification (the only real-world check we have)
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

#### Spot checks against live systems (manual, occasional)
- [ ] ViaBus and Google Maps transit both show Bangkok bus routes; compare a
      handful of routes when something looks off. Not a source.

#### Freshness
- [ ] Re-run the agreement check after every `fetch-raw`; newly conflicting
      routes are the ones to look at.
- [ ] Wikipedia notes carry dates of route changes; surface the latest date
      per route in the build report.

### Decided against (and why)

- **Sorting results by distance from the user.** Position arrives after the
  list is on screen, so the list would reorder itself a second later; for a
  keypad app that is a non-starter. Order stays deterministic (matcher tiers).
- **"Passes 120 m from you" on cards.** A claim the data can't support, and
  the app is see a bus, type a number, get info; not navigation.
- **Reordering OSM's stop lists heuristically** (chunk chaining, geometry
  projection). Guessed sequences on top of spotty data. Moot since the GTFS
  feed has ordered stops.
- **Scraping Transit Bangkok, the BMTA site, or OCR of TSB infographics.**
  Superseded by the official feed; Thai OCR is not usable anyway.
- **OpenStreetMap as a source.** Everything it offered (English, coordinates,
  geometry) the feed does better.
- **Labelling the direction pill by origin with arrows.** People read a
  place name as a destination, and the bus's front sign shows the
  destination; the pill now says "to X".
- **Bilingual text everywhere on the card.** Too much for a phone screen; a
  language toggle instead (Thai terminus alongside English is a P3).
- **"Report a problem" link.** Not for now; the user isn't set up to curate
  strangers' reports.
- **Real-time arrivals.** No public source.
- **Trapping the Back button** to hide Firefox's blank first page in its
  installed-app shell. Would make the app impossible to leave; it's a
  Firefox bug (1524887), Chrome is fine.
- **A DESIGN.md.** Would restate the code and go stale; this list is the
  part worth keeping.

### Product, after the data is trustworthy

- [x] Condensed stop list on the details page: termini + keyword landmarks
      (`data/overrides/landmarks.json`, major always / minor only where a
      stretch needs a stop) + nearest stops + spacing; gaps expand on tap;
      `bbc landmarks <route>` and `--audit` for review. No scoring.
- [ ] Review the landmark picks on the routes you ride; add `include` /
      `exclude` names or keyword fragments as needed. Candidate next
      signal if keywords prove poor: divergence (routes branching at a
      stop), as one more stated reason, not a blended score.
- [ ] "Via" line on the card: a few of those landmarks (selection, not
      sequencing) — after the picks are trusted.
- [x] Location on the details page: stops already passed collapse, nearest
      stop marked with distance. Opt-in, explained before the browser asks;
      `?test=…` adds a simulated-position box in settings (Google Maps link).
- [ ] P3: show the Thai terminus alongside English so it can be matched to
      the front sign.
- [x] Phase 2: map — feed shapes, MapLibre + self-hosted Protomaps tiles;
      route line, stops and landmarks labelled, position dot, pill in the
      top bar. Needs WebGL2 (says so when unavailable).
- [ ] Vans: hidden from results by default (Settings → "Vans in results",
      experimental). Field check: numbers are rarely visible on the vehicle.
      The useful van feature is a different shape — where am I, what departs
      from here, big Thai destination boards — i.e. the reverse lookup below,
      with vans as the motivating case. Decide after a last real-world look
      whether to drop the toggle or build that.
- [ ] Map popup: "stop 16 of 64" is filler. Candidates for that line: the
      other routes serving the stop (the reverse lookup, needs a stop→routes
      index), distance from the user, or the next landmark ahead.
- [ ] Map fonts: build our own glyph pack (Protomaps `font-maker`) so the
      labels stop looking like a near-miss of the UI font and the last
      third-party runtime asset goes away. First try: Roboto + Sarabun
      (looped Thai). Copy the sprites too.
- [ ] Manual English overrides for the Wikipedia-only routes (Thai only).
- [ ] The `extra` badge has false positives from history notes.
- [ ] Real Android checks: sticky keypad vs Chrome's collapsing toolbar;
      reinstall the home-screen icon after the manifest colour change.
- Known, not ours: Firefox for Android's installed-app shell starts on
      about:blank, so Back from the start screen shows a blank page before
      exiting (Mozilla bug 1524887). Chrome's shell is fine.
