import { localize, t, type Lang } from '../lib/i18n.ts';
import { condenseStops, type Segment } from '../lib/condense.ts';
import { formatDistance, NEAR_ROUTE_METERS, nearestStop, type Position } from '../lib/location.ts';
import type { Direction, RouteDetail, RouteSummary, Stop } from '../lib/types.ts';
import { renderDirectionPill, renderLoopLine, sideAt, type Side } from './direction-pill.ts';
import { h } from './dom.ts';
import { renderMeta, renderNumber } from './route-card.ts';

/** Where the location feature stands for this view. */
export type LocationStatus =
  | { kind: 'disabled' }
  | { kind: 'off' }
  | { kind: 'explaining' }
  | { kind: 'locating' }
  | { kind: 'ready'; position: Position }
  | { kind: 'error'; reason: 'unsupported' | 'denied' | 'unavailable' };

export type DetailStatus =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; detail: RouteDetail };

export interface DetailViewProps {
  lang: Lang;
  route: RouteSummary;
  status: DetailStatus;
  /** Which destination's stops are shown; the pill is the toggle. */
  side: Side;
  /** Variant runs (by trip id) the user has expanded; survives re-renders. */
  expanded: Set<string>;
  onSelectSide: (side: Side) => void;
  onBack: () => void;
  onRetry: () => void;
  location: LocationStatus;
  /** The location button: first tap explains, then asks. */
  onLocation: () => void;
  onLocationDismiss: () => void;
  /** The show-everything switch for the condensed stop list. */
  showAllStops: boolean;
  onToggleAllStops: () => void;
  /** The "Front sign (Thai)" panel, English UI only; its open state is remembered. */
  frontSignOpen: boolean;
  onFrontSignToggle: (open: boolean) => void;
}

/** A hidden stretch is a fixed row of dots; the count is in the row's title only. */
const GAP_DOTS = 9;

export function renderDetailView(props: DetailViewProps): HTMLElement {
  const { lang, route, side } = props;
  return h('section', { class: 'detail' }, [
    h('button', { class: 'back-button', attrs: { type: 'button' }, text: `‹ ${t(lang, 'back')}`, on: { click: props.onBack } }),
    renderHeader(props),
    renderStatus(props),
  ]);
}

/** Like a card, the header's halves select the matching direction. */
function renderHeader(props: DetailViewProps): HTMLElement {
  const { lang, route, side } = props;
  const header = h('header', { class: 'detail-header', on: { click: (event) => props.onSelectSide(sideAt(event, header)) } }, [
    renderNumber(lang, route),
    renderLoopLine(lang, route),
    renderDirectionPill({ lang, route, selected: side, onSelect: props.onSelectSide }),
    renderMeta(lang, route, true),
  ]);
  return header;
}

function renderStatus(props: DetailViewProps): HTMLElement {
  const { lang, status } = props;
  if (status.kind === 'loading') return h('p', { class: 'muted', text: t(lang, 'loading') });
  if (status.kind === 'error') {
    return h('div', { class: 'error' }, [
      h('p', { text: t(lang, 'loadFailed') }),
      h('button', { class: 'text-button', attrs: { type: 'button' }, text: t(lang, 'retry'), on: { click: props.onRetry } }),
    ]);
  }
  return renderDetailBody(props, status.detail);
}

function renderDetailBody(props: DetailViewProps, detail: RouteDetail): HTMLElement {
  const { lang, route, side } = props;
  // `side` is the destination; a run heading there departs from the other end.
  const departsFrom: Side = side === 0 ? 1 : 0;
  const main = detail.directions.find((direction) => !direction.variant && direction.origin === departsFrom)
    ?? detail.directions.find((direction) => direction.origin === departsFrom);
  // Variant runs towards this destination (short-turns, expressway runs) and
  // trips that matched neither terminus are listed below; the other
  // destination's are behind the toggle.
  const others = detail.directions.filter((direction) => direction !== main && direction.origin !== side);
  return h('div', { class: 'detail-body' }, [
    lang === 'en' && renderFrontSign(props, detail),
    main && renderLocationPanel(props),
    main
      ? renderStopList(props, main, detail.stops, props.location.kind === 'ready' ? props.location.position : undefined)
      : h('p', { class: 'muted', text: t(lang, detail.directions.length === 0 ? 'noDirections' : 'noStops') }),
    others.length > 0 &&
      h('div', { class: 'directions' }, [
        h('p', { class: 'recent-label', text: t(lang, 'variants') }),
        ...others.map((direction) => renderCollapsibleDirection(props, direction, detail.stops)),
      ]),
    // The card carries the operator; the fuller "A (operating as B)" form is worth its own line when there is one.
    detail.operatorDetail && renderFact(t(lang, 'operator'), localize(lang, detail.operatorDetail)),
    detail.hours && renderFact(t(lang, 'hours'), detail.hours),
    detail.notes && renderNotes(lang, detail.notes),
  ]);
}

/**
 * The two destinations in Thai, big, side by side in the pill's positions,
 * for matching the bus's front sign by shape when the UI is English: the
 * feed's headsign where the run has one (that is what the sign says), else
 * the terminus. No English: the pill above labels the same two positions.
 * Tapping a half selects that side, like the pill.
 */
function renderFrontSign(props: DetailViewProps, detail: RouteDetail): HTMLElement | false {
  const { lang, route, side } = props;
  if (!route.terminals) return false;
  const rows = ([0, 1] as const).map((destination) => {
    const thai = signText(route, detail, destination);
    return h('button', {
      class: `sign-half${side === destination ? ' is-selected' : ''}`,
      attrs: { type: 'button', 'aria-pressed': String(side === destination), title: thai ?? '' },
      on: { click: () => props.onSelectSide(destination) },
    }, [h('span', { class: 'sign-th', text: thai ?? '—' })]);
  });
  const panel = h('details', { class: 'disclosure front-sign' }, [
    h('summary', { text: t(lang, 'frontSign') }),
    h('div', { class: 'sign-halves' }, rows),
  ]);
  panel.open = props.frontSignOpen;
  panel.addEventListener('toggle', () => props.onFrontSignToggle(panel.open));
  return panel;
}

/** The Thai a bus heading for `destination` carries on its sign. */
function signText(route: RouteSummary, detail: RouteDetail, destination: Side): string | undefined {
  const departsFrom: Side = destination === 0 ? 1 : 0;
  const run = detail.directions.find((direction) => !direction.variant && direction.origin === departsFrom)
    ?? detail.directions.find((direction) => direction.origin === departsFrom);
  if (run?.headsign?.th) return run.headsign.th;
  if (route.loop) {
    const label = route.sideLabels?.[destination];
    if (!label) return undefined;
    return label.marked ? `${label.name.th} ${t('th', destination === 0 ? 'senseLeft' : 'senseRight')}` : label.name.th;
  }
  return route.terminals?.[destination]?.th;
}

function renderFact(label: string, value: string): HTMLElement {
  return h('p', { class: 'fact' }, [h('span', { class: 'fact-label', text: `${label}: ` }), value]);
}

/** Unnamed stop nodes exist in OSM but say nothing useful in a text list. */
function namedStops(direction: Direction, stops: Record<string, Stop>): Stop[] {
  return direction.stops
    .map((id) => stops[id])
    .filter((stop): stop is Stop => stop !== undefined && stop.name.th.length > 0);
}

function hailAndRideCount(direction: Direction, stops: Record<string, Stop>): number {
  return direction.stops.filter((id) => stops[id]?.hailAndRide).length;
}

/** "Hail-and-ride: 24 boarding points along the way", or the no-named-stops form when that is all the run has. */
function renderHailAndRide(lang: Lang, count: number, named: boolean): HTMLElement {
  const text = named ? `${t(lang, 'hailAndRide')} ${count} ${t(lang, 'boardingPoints')}` : `${t(lang, 'hailAndRideOnly')} ${count} ${t(lang, 'boardingPointsOnly')}`;
  return h('p', { class: 'muted hail-and-ride', text });
}

/** "64 stops · 13 shown", or "46 stops ahead · 11 shown" once the list starts at the nearest stop; no "shown" when nothing is hidden. */
function countLine(lang: Lang, total: number, shown: number, ahead: boolean, condensed: boolean): string {
  const count = `${total} ${t(lang, ahead ? 'stopsAhead' : 'stops')}`;
  if (!condensed) return count;
  return lang === 'th' ? `${count} \u00b7 ${t(lang, 'shown')} ${shown}` : `${count} \u00b7 ${shown} ${t(lang, 'shown')}`;
}

/** "A → B", or just "→ B" when the run starts on a hail-and-ride stretch and has no named origin. */
function directionTitle(lang: Lang, direction: Direction): string {
  const from = localize(lang, direction.from);
  return from ? `${from} → ${localize(lang, direction.to)}` : `→ ${localize(lang, direction.to)}`;
}

/**
 * The button, the one-time explanation, progress and errors for the
 * location feature. Rendered only when there is a run to trim.
 */
function renderLocationPanel(props: DetailViewProps): HTMLElement | false {
  const { lang, location } = props;
  if (location.kind === 'ready' || location.kind === 'disabled') return false;
  if (location.kind === 'off') {
    return h('button', { class: 'text-button location-button', attrs: { type: 'button' }, on: { click: props.onLocation } }, [pinIcon(), t(lang, 'locationButton')]);
  }
  if (location.kind === 'explaining') {
    return h('div', { class: 'location-explain' }, [
      h('p', { text: t(lang, 'locationExplain') }),
      h('div', { class: 'chips' }, [
        h('button', { class: 'chip is-selected', attrs: { type: 'button' }, text: t(lang, 'locationUse'), on: { click: props.onLocation } }),
        h('button', { class: 'chip chip-quiet', attrs: { type: 'button' }, text: t(lang, 'dontAsk'), on: { click: props.onLocationDismiss } }),
      ]),
    ]);
  }
  if (location.kind === 'locating') return h('p', { class: 'muted', text: t(lang, 'locating') });
  const key = location.reason === 'denied' ? 'locationDenied' : location.reason === 'unsupported' ? 'locationUnsupported' : 'locationUnavailable';
  // Errors: retry, or turn the feature off (same as the settings toggle).
  return h('div', { class: 'location-explain' }, [
    h('p', { class: 'muted', text: t(lang, key) }),
    h('div', { class: 'chips' }, [
      location.reason !== 'unsupported' && h('button', { class: 'chip is-selected', attrs: { type: 'button' }, text: t(lang, 'retry'), on: { click: props.onLocation } }),
      h('button', { class: 'chip chip-quiet', attrs: { type: 'button' }, text: t(lang, 'turnOff'), on: { click: props.onLocationDismiss } }),
    ]),
  ]);
}

/** A map-pin outline in the current text colour, so it follows the accent. */
function pinIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'pin-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 22s7-7.1 7-12.5A7 7 0 0 0 5 9.5C5 14.9 12 22 12 22zm0-9.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6z');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('fill-rule', 'evenodd');
  svg.append(path);
  return svg;
}

/**
 * The run's stops, in travel order, condensed to termini, landmarks, the
 * stops nearest the user and one per long stretch; a hidden stretch is a row
 * of dots, one per stop, and "Show all" opens everything. With a position, stops already passed collapse
 * behind "n earlier stops" and the nearest is marked with its distance; a
 * position far from the route keeps the full list, with the nearest stop
 * still marked and always shown.
 */
function renderStopList(props: DetailViewProps, direction: Direction, stops: Record<string, Stop>, position?: Position): HTMLElement {
  const { lang } = props;
  const named = namedStops(direction, stops);
  const hailAndRide = hailAndRideCount(direction, stops);
  if (named.length === 0) return hailAndRide > 0 ? renderHailAndRide(lang, hailAndRide, false) : h('p', { class: 'muted', text: t(lang, 'noStops') });
  const nearest = position ? nearestStop(named, position) : undefined;
  const onRoute = nearest !== undefined && nearest.meters <= NEAR_ROUTE_METERS;
  const start = onRoute ? nearest.index : 0;
  const upcoming = named.slice(start);
  const forced = new Map<number, string>();
  if (onRoute) for (let offset = 0; offset < 3 && offset < upcoming.length; offset += 1) forced.set(offset, 'nearest');
  else if (nearest) forced.set(nearest.index, 'nearest');
  const condensedSegments = condenseStops(upcoming, { forced });
  // With everything shown, the stops the condensed list would keep stay prominent and the rest step back.
  const prominent = new Set(condensedSegments.flatMap((segment) => (segment.kind === 'stop' ? [segment.index] : [])));
  const segments = props.showAllStops ? upcoming.map((stop, index): Segment => ({ kind: 'stop', index, stop, reason: prominent.has(index) ? 'kept' : 'all' })) : condensedSegments;
  const condensed = condensedSegments.some((segment) => segment.kind === 'gap');

  const item = (stop: Stop, index: number, secondary = false): HTMLElement => {
    const isNearest = nearest !== undefined && index === nearest.index;
    const classes = ['stop', isNearest && 'is-nearest', secondary && !isNearest && 'is-secondary'].filter(Boolean).join(' ');
    return h('li', { class: classes, attrs: { value: String(index + 1) } }, [
      h('span', { class: 'stop-number', text: String(index + 1) }),
      h('span', { class: 'stop-name' }, [
        localize(lang, stop.name),
        isNearest && nearest && h('span', { class: 'stop-distance', text: ` \u00b7 ${t(lang, 'nearestStop')}, ${formatDistance(nearest.meters)}` }),
      ]),
    ]);
  };
  const rows: HTMLElement[] = [];
  for (const segment of segments) {
    if (segment.kind === 'stop') {
      rows.push(item(segment.stop, start + segment.index, segment.reason === 'all'));
      continue;
    }
    // One dot per hidden stop: the length of the stretch at a glance, in one short row.
    rows.push(h('li', { class: 'stop-gap', attrs: { title: `${segment.count} ${t(lang, segment.count === 1 ? 'stopOne' : 'stops')}` } }, [
      h('span', { class: 'stop-gap-dots', text: '\u00b7'.repeat(GAP_DOTS) }),
    ]));
  }
  const earlier = named.slice(0, start);
  return h('div', { class: 'stops-panel' }, [
    h('div', { class: 'stops-header' }, [
      h('span', { class: 'direction-count', text: countLine(lang, upcoming.length, prominent.size, onRoute, condensed && !props.showAllStops) }),
      condensed && h('button', { class: 'text-button stops-toggle', attrs: { type: 'button' }, text: t(lang, props.showAllStops ? 'showFewerStops' : 'showAllStops'), on: { click: props.onToggleAllStops } }),
    ]),
    hailAndRide > 0 && renderHailAndRide(lang, hailAndRide, true),
    earlier.length > 0 &&
      h('details', { class: 'earlier-stops' }, [
        h('summary', { text: `${earlier.length} ${t(lang, 'earlierStops')}` }),
        h('ol', { class: 'stop-list is-passed' }, earlier.map((stop, index) => item(stop, index))),
      ]),
    h('ol', { class: 'stop-list' }, rows),
  ]);
}

/** Variant runs and trips that matched neither terminus stay collapsible. */
function renderCollapsibleDirection(props: DetailViewProps, direction: Direction, stops: Record<string, Stop>): HTMLElement {
  const { lang, expanded } = props;
  const named = namedStops(direction, stops);
  const hailAndRide = hailAndRideCount(direction, stops);
  const details = h('details', { class: 'direction' }, [
    h('summary', { class: 'direction-summary' }, [
      h('span', { class: 'direction-title', text: directionTitle(lang, direction) }),
      h('span', { class: 'direction-count', text: named.length === 0 && hailAndRide > 0 ? `${hailAndRide} ${t(lang, 'boardingPointsShort')}` : `${named.length} ${t(lang, 'stops')}` }),
    ]),
    hailAndRide > 0 && renderHailAndRide(lang, hailAndRide, named.length > 0),
    named.length === 0
      ? hailAndRide === 0 && h('p', { class: 'muted', text: t(lang, 'noStops') })
      : h('ol', { class: 'stop-list' }, named.map((stop) => h('li', { class: 'stop', text: localize(lang, stop.name) }))),
  ]);
  details.open = expanded.has(direction.tripId);
  details.addEventListener('toggle', () => {
    if (details.open) expanded.add(direction.tripId);
    else expanded.delete(direction.tripId);
  });
  return details;
}

function renderNotes(lang: Lang, notes: string): HTMLElement {
  return h('details', { class: 'disclosure notes' }, [
    h('summary', { text: t(lang, 'notes') }),
    h('div', { class: 'panel' }, notes.split('\n').map((line) => h('p', { class: 'note-line', text: line }))),
  ]);
}
