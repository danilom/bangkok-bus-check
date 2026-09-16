import { localize, t, type Lang } from '../lib/i18n.ts';
import type { Direction, RouteDetail, RouteSummary, Stop } from '../lib/types.ts';
import { renderDirectionPill, renderLoopLine, sideAt, type Side } from './direction-pill.ts';
import { h } from './dom.ts';
import { renderBadges, renderNumber } from './route-card.ts';

export type DetailStatus =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; detail: RouteDetail };

export interface DetailViewProps {
  lang: Lang;
  route: RouteSummary;
  status: DetailStatus;
  /** Which direction's stops are shown; the pill is the toggle. */
  side: Side;
  /** Variant runs (by trip id) the user has expanded; survives re-renders. */
  expanded: Set<string>;
  onSelectSide: (side: Side) => void;
  onBack: () => void;
  onRetry: () => void;
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
  const main = detail.directions.find((direction) => !direction.variant && direction.origin === side)
    ?? detail.directions.find((direction) => direction.origin === side);
  // Variant runs for this side (short-turns, expressway runs) and trips that
  // matched neither terminus are listed below; the other side's are behind the toggle.
  const otherSide: Side = side === 0 ? 1 : 0;
  const others = detail.directions.filter((direction) => direction !== main && direction.origin !== otherSide);
  return h('div', { class: 'detail-body' }, [
    main
      ? renderStopList(lang, main, detail.stops)
      : h('p', { class: 'muted', text: t(lang, detail.directions.length === 0 ? 'noDirections' : 'noStops') }),
    others.length > 0 &&
      h('div', { class: 'directions' }, [
        h('p', { class: 'recent-label', text: t(lang, 'variants') }),
        ...others.map((direction) => renderCollapsibleDirection(props, direction, detail.stops)),
      ]),
    (detail.operatorDetail ?? route.operator) && renderFact(t(lang, 'operator'), localize(lang, detail.operatorDetail ?? route.operator ?? { th: '' })),
    detail.hours && renderFact(t(lang, 'hours'), detail.hours),
    detail.vehicles.length > 0 && renderFact(t(lang, 'vehicles'), detail.vehicles.map((vehicle) => localize(lang, vehicle)).join(' · ')),
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

function renderStopList(lang: Lang, direction: Direction, stops: Record<string, Stop>): HTMLElement {
  const named = namedStops(direction, stops);
  if (named.length === 0) return h('p', { class: 'muted', text: t(lang, 'noStops') });
  return h('div', { class: 'stops-panel' }, [
    h('p', { class: 'direction-count', text: `${direction.stops.length} ${t(lang, 'stops')}` }),
    h('ol', { class: 'stop-list' }, named.map((stop) => h('li', { class: 'stop', text: localize(lang, stop.name) }))),
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
