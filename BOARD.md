# Bangkok Bus Board — working notes

An experiment, started 2026-09-17, living beside Bangkok Bus Check on the
same site. This file is the hand-off: what it is, what was decided, what is
done, what is next. Keep it current when you change course.

## What it is

The reverse question to Bus Check. Not "which bus is this" but "where do the
buses go from here": a full-screen map, tap any stop, and every route
serving it fans out from the stop as coloured lines. Exploration of real
routes, so the data must be right; Bus Check's grab-bag policy (anything
that might identify a bus) does not apply here.

Working name **Bangkok Bus Board** ("board" as in departure board; pairs with
"Check"). Thai placeholder ป้ายรถเมล์กรุงเทพ. Renaming is the three strings
in `src/lib/i18n.ts` (`boardName`, `boardTagline`, `boardBlurb`), the folder
`board/`, and `public/board/manifest.webmanifest`.

## Decisions so far

- **Same repo, same site, second Vite entry.** `board/index.html` →
  `src/board/`, built by the same `vite build` (two inputs in
  `vite.config.ts`), deployed by the same workflow, sharing data, tiles,
  stylesheet, service worker and `src/lib` + `src/ui`. Not a mode of Bus
  Check: it must not compete with the keypad on the first screen, and it can
  be deleted by removing one folder. See the Layout section of README.md.
- **Cross-linking is a "See also" link on each settings page**, opening in a
  new tab. Nothing deeper until the experiment earns it.
- **Draw the leg ahead, not the whole route.** From the tapped stop onward
  (slice the shape at the stop, as Bus Check's map does). For termini and
  loops this means the full run from the stop round to itself; accepted for
  now, may need a different look later so incoming is not read as outgoing.
- **Rainbow by bearing.** Sort a stop's routes by the compass bearing of
  their first ~500 m from the stop and assign hues around the wheel in that
  order, so lines leaving the same way get neighbouring colours and the fan
  reads as a rainbow. Route numbers as line-placed labels.
- **Per stop, not per road.** A stop is one kerb; the twin across the road is
  a later refinement (no pairing rule exists yet).
- **Stops shown from about zoom 13**, with a hint to zoom in below that.
- **Hash `#s<stopId>`** with Bus Check's stop ids, so a jump between the apps
  is possible later.
- **Reliability tiers** (below): `confirmed` + `official` drawn by default.

## Data reliability

Rule in `scripts/reliability.ts`; judged with `bbc reliability`. Only the
GTFS feed has stops and shapes, so Wikipedia-only routes are out regardless.

Excluded, in this order: no main run with stops; the feed and Wikipedia
disagree on the termini (`agreement: conflict` — exactly the "may not go
there" cases); vans; hail-and-ride-only routes (no stops to tap); a main run
without a shape.

Tiers on what remains, stored as `Route.reliability` in the shared data:

| tier | meaning | routes (2026-09 data) |
|---|---|---|
| `confirmed` | feed and Wikipedia agree on the termini | 271 |
| `official` | numbered bus in the feed alone | 39 |
| `thin` | suburban route (songthaew) in the feed alone | 166 |

Excluded: 97 without a stop list, 18 conflicts, 167 vans, 115 hail-and-ride
only. Note `official` is mostly provincial local routes with plain numbers
(Nonthaburi, Pak Kret, Paknam: 1~2, 2, 3, 4…) plus a handful of real buses
(34X, 39, 74, 91, 203); the four-digit `suburban` flag does not catch them.

The board draws `confirmed` + `official` (`BOARD_TIERS`). `thin` is behind
nothing yet; if ever, a setting. A hand-kept "verified" list (routes ridden,
dated) could become a fourth signal later and feed back into Bus Check as a
badge; that is the "curated shared data" idea, alongside the landmark rules.

## Data files

- `public/data/board/stops.json` — every stop served by a main run of a
  drawable route: id, names, lat/lon, route ids. Built by `bbc build-data`.
- Route geometry comes from the existing `public/data/routes/<id>.json`
  (directions with `shape` and ordered `stops`); fetched on tap for the
  stop's routes. Per-stop bundles only if that proves slow.

## Plan and status

1. [x] Reliability rule + `Route.reliability` (`scripts/reliability.ts`)
2. [x] `bbc reliability` audit command (`-v` lists routes; `bbc reliability 2-45` judges one)
3. [x] `stops.json` in the build (`scripts/board-data.ts`; 6.7k stops, 1.4 MB, 300 KB gzipped)
4. [x] Base-map extraction: `src/ui/base-map.ts` (protocol, style,
       controls, theme, label images, popups) so the board can add its own
       layers; no visible change to Bus Check — re-verify its map
5. [ ] Board: map + stop dots + selection + hash
6. [ ] The fan: fetch, slice at the stop, bearing-sort, colour, number labels
7. [ ] Card at the bottom: stop name, route chips in the line colours, chip
       → Bus Check route page (new tab)

Later, if it earns it: focus on the user's location; twin stops across the
road; incoming vs outgoing look for loops and termini; landmarks as labels;
a jump from Bus Check's map to here.

## Working notes

- `bbc <command>` is `bbc.cmd` on Windows, `npm run bbc --` elsewhere.
  `npm test`, `npm run typecheck`, `npm run build` must stay green.
- The dev server (`npm run dev`, port 5173) serves both apps: `/` and
  `/board/`. Tiles need `public/tiles/bangkok.pmtiles` (git-ignored; see
  README, `scripts/extract-tiles.sh`).
- Bus Check is tagged `v1.6` at the point just before this experiment
  started (after the refactor that made the second entry possible).
