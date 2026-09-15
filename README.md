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
no API calls. Two sources are merged:

- **Thai Wikipedia** — the Bangkok bus route list, which tracks the 2024–25
  route-number reform (old numbers ↔ new zone-prefixed numbers), operators
  and termini. CC BY-SA 4.0.
- **OpenStreetMap** — one relation per direction with English names, ordered
  stops and coordinates. ODbL.

```bash
npm run bbc -- fetch-raw            # refresh data/raw/ snapshots (Wikipedia + Overpass)
npm run bbc -- build-data --verbose # data/raw/ → public/data/index.json + routes/<id>.json
```

Snapshots in `data/raw/` are committed so `build-data` is deterministic and
does not depend on Overpass being up. The build prints a coverage report and
every merge decision it made (`--verbose`).

The merge is biased toward inclusion: a user is looking at a real bus, so a
missing route is the failure that matters, not a stale one. Routes are keyed
by (number, operator) because an old number can belong to a BMTA route, a
Nonthaburi songthaew and a private minibus at once.
