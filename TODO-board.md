
[ ] P3: In routes box, to save vertical space, make the "x routes" text on the same line as the title, if possible (if it doesn't fit, separate line is ok).
[ ] ?? P3: Maybe title should have the map background as well
[ ] P3: zoom button: have separate buttons, maybe zooming "back" (to saved position and zoom) is a good idea 


# Bangkok Bus Board — to do

Backlog for `/board/`. Decisions, status and the reasoning live in
[BOARD.md](BOARD.md); this is the list of what is open.

## Open

[ ] Judge it on a real phone. Everything so far was the desktop and the
    `?test=phone` box (Settings → Test → Viewport).

[ ] The fans need a rethink. At street zoom a busy stop's fan is mostly
    lines running off the edges; "Zoom to all" for 30 routes (some 40 km)
    is citywide with the stop a dot in it. Loops and termini draw the whole
    run, so incoming reads as outgoing. Ideas: draw only the first few km
    by default, a different look for the way back, or an intermediate zoom.

[ ] The card takes ~40% of a phone screen with a busy stop's chips.

[ ] Twin stops across the road: a stop is one kerb; no pairing rule yet.

[ ] Focus on the user's location (Bus Check has the plumbing:
    `src/lib/location.ts`, the position layers in `src/ui/base-map.ts`).

[ ] Jump from Bus Check's map to here: the hash is `#<stopId>` with Bus
    Check's ids already, so it is a link on its stop popup.

[ ] Long-press on a stop as a bonus gesture for "Zoom to all". Never the
    only way (see BOARD.md: taps never move the map).

[ ] Theme = System: flipping the OS theme while the map is open recolours
    the page but not the map (no `matchMedia` listener). Both apps.

[ ] Light-mode fan colours (`legColour`, OKLCH L 0.52 C 0.17) were tuned by
    the numbers, not by eye; check them on the light basemap.

[ ] `thin` reliability tier (166 songthaew routes) is drawn nowhere; a
    setting, if wanted. See BOARD.md, Data reliability.

[ ] Hand-kept "verified" list (routes ridden, dated) as a fourth signal,
    feeding back into Bus Check as a badge.

[ ] Landmarks as labels on the map (Bus Check's `landmarks.json`).

[ ] The map's attribution control lives behind the card; fine, but the
    licence must stay reachable — check it still opens from the pill's
    corner when a route is singled out.

[ ] How does "Open in Bus Check" (new tab) behave from the installed app?
    Same question as Bus Check's "See also" link.

[ ] Icons: `public/icons/board-*.png` were made by hue-shifting the purple
    set to the green accent; there is no source file. Redo if the bus
    changes.

## Done

[x] Map, stop dots, selection, hash; the fan (slice at the stop, bearing
    sort, rainbow); the card with chips; single a route out; open it in Bus
    Check. First working version 2026-09-17.
[x] Zoom hint at the top with the live zoom and the threshold.
[x] Taps never move the map; "Zoom to all / to 3-8 / to stop" on the card.
[x] Own icon (green), own labels toggle ("Aa"), viewport switcher in
    Settings → Test.
