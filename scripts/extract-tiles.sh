#!/usr/bin/env sh
# Cuts the basemap tiles described in data/tiles.json from the pinned
# Protomaps build. Needs the `pmtiles` CLI (https://github.com/protomaps/go-pmtiles)
# on PATH or in $PMTILES. Used by the deploy workflow and for local dev.
set -eu
cd "$(dirname "$0")/.."
PMTILES="${PMTILES:-pmtiles}"
BUILD=$(node -p "require('./data/tiles.json').build")
BBOX=$(node -p "require('./data/tiles.json').bbox")
MAXZOOM=$(node -p "require('./data/tiles.json').maxzoom")
OUTPUT=$(node -p "require('./data/tiles.json').output")
mkdir -p "$(dirname "$OUTPUT")"
"$PMTILES" extract "https://build.protomaps.com/$BUILD.pmtiles" "$OUTPUT" --bbox="$BBOX" --maxzoom="$MAXZOOM"
ls -l "$OUTPUT"
