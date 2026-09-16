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

Routes are keyed by (number, operator): an old number can belong to a BMTA
route, a songthaew and a private minibus at once. The feed's separate
entries for sections, expressway runs and return directions fold into one
route each.
