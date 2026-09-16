# Bangkok Bus Check

Type the number of the bus pulling up. See where it goes. English and Thai.

A single-purpose web app for Bangkok's city buses — not a journey planner,
and no real-time arrivals (there is no public source for them). Built as a
plain TypeScript PWA with no framework, hosted on GitHub Pages.

## Develop

```bash
npm install
npm run dev        # Vite dev server
npm test           # node --test over tests/**/*.test.ts
npm run typecheck
npm run build      # → dist/  (set BASE_PATH=/<repo>/ for GitHub Pages)
```

## Data

Route data is compiled at build time and shipped with the page; the app makes
no API calls. Two sources:

- **Namtang GTFS** — the official feed from the Office of Transport and
  Traffic Policy and Planning (Ministry of Transport): every Bangkok bus,
  van and suburban route with both directions, ordered stops, Thai and
  English names, coordinates and service hours. CC BY 4.0. This is the
  backbone.
- **Thai Wikipedia** — the Bangkok bus route list. Fills what the feed
  lacks (old numbers for the reform-era routes, the actual private
  operators, a few suburban routes, vehicle types, history) and serves as an
  independent check on the termini. CC BY-SA 4.0.

```bash
bbc fetch-raw                    # both sources → data/raw/   (bbc.cmd on Windows; `npm run bbc --` elsewhere)
bbc fetch-raw --source namtang   # just the GTFS feed
bbc build-data --verbose         # data/raw/ → public/data/index.json + routes/<id>.json
bbc extract-places               # add Thai names lacking English to data/overrides/translations.json
bbc extract-places --feed-english  # also list the feed's English, as lines you can paste to override
bbc build-data --strict          # fail instead of warning when anything would show untranslated
bbc landmarks 2-45 73            # print a route's condensed stop list with the reason each stop is kept
bbc landmarks --audit            # dataset-wide numbers for judging the landmark keywords
```

Snapshots in `data/raw/` are committed so `build-data` is deterministic and
works offline. Of the GTFS tables only the ones the build needs are kept
(`shapes.txt` and the fare tables are left out until something uses them).
The build prints a coverage report; `--verbose` lists every route where the
two sources disagree on the termini, and the app shows a "sources disagree"
badge on those. Anything that would appear in Thai on the English UI is
listed in a warning at the end of the build; after a data refresh, run
`bbc extract-places`, translate the new drafts in
`data/overrides/translations.json`, and rebuild.

Long stop lists are condensed in the app to termini, landmarks, the stops
nearest the user and one stop per long stretch, with hidden stretches a tap
away. Which stops count as landmarks is decided by the keyword tiers in
`data/overrides/landmarks.json`, applied at build time: major tiers (rail,
terminals, piers, named landmarks) are always shown, two consecutive stops
of one landmark counting once; minor tiers (junctions, hospitals, markets,
big-box stores) only stand in for the arbitrary stop a long stretch would
otherwise get. The stretch length grows with the route (a tenth of the
list, at least 6), so spacing adds about ten stops at most. Edit the file
and rebuild. `bbc landmarks <route>` shows
the effect on real routes; `bbc landmarks --audit` gives the whole-dataset
numbers (lit share per direction, hits per keyword, busy unlit stops, lit
stops only one route serves).

The feed models hail-and-ride stretches (vans, suburban routes) as chains
of virtual stops named "visual stop". They are kept with their coordinates
but no name, so lists show only named stops plus a line saying how many
boarding points the run has.

Routes are keyed by (number, operator): an old number can belong to a BMTA
route, a songthaew and a private minibus at once. The feed's separate
entries for sections, expressway runs and return directions fold into one
route each.
