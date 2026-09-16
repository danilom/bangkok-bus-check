import { localize, t, type Lang } from '../lib/i18n.ts';
import { condenseStops, type Segment } from '../lib/condense.ts';
import { formatDistance, NEAR_ROUTE_METERS, nearestStop, type Position } from '../lib/location.ts';
import type { Direction, RouteDetail, RouteSummary, Stop } from '../lib/types.ts';
import { renderDirectionPill, renderLoopLine, sideAt, type Side } from './direction-pill.ts';
import { h } from './dom.ts';
import { renderBadges, renderNumber } from './route-card.ts';

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
  /** Hidden stretches the user has opened ("tripId:from"), and the show-everything switch. */
  expandedGaps: Set<string>;
  showAllStops: boolean;
  onToggleAllStops: () => void;
  onExpandGap: (key: string) => void;
}

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
    renderBadges(lang, route),
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
    // Vehicle type first: it is what identifies the bus in front of you.
    detail.vehicles.length > 0 && renderFact(t(lang, 'vehicles'), detail.vehicles.map((vehicle) => localize(lang, vehicle)).join(' · ')),
    main && renderLocationPanel(props),
    main
      ? renderStopList(props, main, detail.stops, props.location.kind === 'ready' ? props.location.position : undefined)
      : h('p', { class: 'muted', text: t(lang, detail.directions.length === 0 ? 'noDirections' : 'noStops') }),
    others.length > 0 &&
      h('div', { class: 'directions' }, [
        h('p', { class: 'recent-label', text: t(lang, 'variants') }),
        ...others.map((direction) => renderCollapsibleDirection(props, direction, detail.stops)),
      ]),
    (detail.operatorDetail ?? route.operator) && renderFact(t(lang, 'operator'), localize(lang, detail.operatorDetail ?? route.operator ?? { th: '' })),
    detail.hours && renderFact(t(lang, 'hours'), detail.hours),
    detail.notes && renderNotes(lang, detail.notes),
  ]);
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
 * stops nearest the user and one per long stretch; hidden stretches open on
 * a tap, or all at once. With a position, stops already passed collapse
 * behind "n earlier stops" and the nearest is marked with its distance; a
 * position far from the route shows the list from the start and says so.
 */
function renderStopList(props: DetailViewProps, direction: Direction, stops: Record<string, Stop>, position?: Position): HTMLElement {
  const { lang } = props;
  const named = namedStops(direction, stops);
  if (named.length === 0) return h('p', { class: 'muted', text: t(lang, 'noStops') });
  const nearest = position ? nearestStop(named, position) : undefined;
  const onRoute = nearest !== undefined && nearest.meters <= NEAR_ROUTE_METERS;
  const start = onRoute ? nearest.index : 0;
  const upcoming = named.slice(start);
  const forced = new Map<number, string>();
  if (onRoute) for (let offset = 0; offset < 3 && offset < upcoming.length; offset += 1) forced.set(offset, 'nearest');
  const segments = props.showAllStops ? upcoming.map((stop, index): Segment => ({ kind: 'stop', index, stop, reason: 'all' })) : condenseStops(upcoming, { forced });
  const condensed = segments.some((segment) => segment.kind === 'gap') || props.showAllStops;

  const item = (stop: Stop, index: number): HTMLElement => {
    const isNearest = onRoute && index === start;
    return h('li', { class: isNearest ? 'stop is-nearest' : 'stop', attrs: { value: String(index + 1) } }, [
      localize(lang, stop.name),
      isNearest && nearest && h('span', { class: 'stop-distance', text: ` \u00b7 ${t(lang, 'nearestStop')}, ${formatDistance(nearest.meters)}` }),
    ]);
  };
  const rows: HTMLElement[] = [];
  for (const segment of segments) {
    if (segment.kind === 'stop') {
      rows.push(item(segment.stop, start + segment.index));
      continue;
    }
    const key = `${direction.tripId}:${start + segment.from}`;
    if (props.expandedGaps.has(key)) {
      for (let index = segment.from; index <= segment.to; index += 1) {
        const stop = upcoming[index];
        if (stop) rows.push(item(stop, start + index));
      }
    } else {
      rows.push(h('li', { class: 'stop-gap' }, [
        h('button', { class: 'stop-gap-button', attrs: { type: 'button' }, text: `\u00b7 \u00b7 \u00b7 ${segment.count} ${t(lang, segment.count === 1 ? 'stopOne' : 'stops')} \u00b7 \u00b7 \u00b7`, on: { click: () => props.onExpandGap(key) } }),
      ]));
    }
  }
  const earlier = named.slice(0, start);
  return h('div', { class: 'stops-panel' }, [
    h('div', { class: 'stops-header' }, [
      h('span', { class: 'direction-count', text: `${direction.stops.length} ${t(lang, 'stops')}` }),
      condensed && h('button', { class: 'text-button stops-toggle', attrs: { type: 'button' }, text: t(lang, props.showAllStops ? 'showFewerStops' : 'showAllStops'), on: { click: props.onToggleAllStops } }),
    ]),
    nearest && !onRoute && h('p', { class: 'muted', text: `${t(lang, 'farFromRoute')} ${formatDistance(nearest.meters)} ${t(lang, 'awayFull')}` }),
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
  const details = h('details', { class: 'direction' }, [
    h('summary', { class: 'direction-summary' }, [
      h('span', { class: 'direction-title', text: `${localize(lang, direction.from)} → ${localize(lang, direction.to)}` }),
      h('span', { class: 'direction-count', text: `${direction.stops.length} ${t(lang, 'stops')}` }),
    ]),
    named.length === 0
      ? h('p', { class: 'muted', text: t(lang, 'noStops') })
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
  return h('details', { class: 'notes' }, [
    h('summary', { text: t(lang, 'notes') }),
    ...notes.split('\n').map((line) => h('p', { class: 'note-line', text: line })),
  ]);
}
