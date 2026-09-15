import { localize, t, type Lang } from '../lib/i18n.ts';
import type { Direction, RouteDetail, RouteSummary, Stop } from '../lib/types.ts';
import { h } from './dom.ts';
import { renderBadges, renderNumber, renderTerminals } from './route-card.ts';

export type DetailStatus =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; detail: RouteDetail };

export interface DetailViewProps {
  lang: Lang;
  route: RouteSummary;
  status: DetailStatus;
  /** Directions (by OSM relation id) the user has expanded; survives re-renders. */
  expanded: Set<number>;
  onBack: () => void;
  onRetry: () => void;
}

export function renderDetailView(props: DetailViewProps): HTMLElement {
  const { lang, route } = props;
  return h('section', { class: 'detail' }, [
    h('button', { class: 'back-button', attrs: { type: 'button' }, text: `‹ ${t(lang, 'back')}`, on: { click: props.onBack } }),
    h('header', { class: 'detail-header' }, [renderNumber(lang, route), renderTerminals(lang, route), renderBadges(lang, route)]),
    route.operator && renderFact(t(lang, 'operator'), localize(lang, route.operator)),
    renderStatus(props),
  ]);
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
  const { lang } = props;
  return h('div', { class: 'detail-body' }, [
    detail.vehicles.length > 0 && renderFact(t(lang, 'vehicles'), detail.vehicles.join(' · ')),
    detail.directions.length === 0
      ? h('p', { class: 'muted', text: t(lang, 'noDirections') })
      : h('div', { class: 'directions' }, detail.directions.map((direction) => renderDirection(props, direction, detail.stops))),
    detail.notes && renderNotes(lang, detail.notes),
  ]);
}

function renderFact(label: string, value: string): HTMLElement {
  return h('p', { class: 'fact' }, [h('span', { class: 'fact-label', text: `${label}: ` }), value]);
}

function renderDirection(props: DetailViewProps, direction: Direction, stops: Record<string, Stop>): HTMLElement {
  const { lang, expanded } = props;
  // Unnamed stop nodes exist in OSM but say nothing useful in a text list.
  const named = direction.stops
    .map((id) => stops[id])
    .filter((stop): stop is Stop => stop !== undefined && stop.name.th.length > 0);
  const details = h('details', { class: 'direction' }, [
    h('summary', { class: 'direction-summary' }, [
      h('span', { class: 'direction-title', text: `${localize(lang, direction.from)} → ${localize(lang, direction.to)}` }),
      h('span', { class: 'direction-count', text: `${direction.stops.length} ${t(lang, 'stops')}` }),
    ]),
    named.length === 0
      ? h('p', { class: 'muted', text: t(lang, 'noStops') })
      : h('ol', { class: 'stop-list' }, named.map((stop) => h('li', { class: 'stop', text: localize(lang, stop.name) }))),
  ]);
  details.open = expanded.has(direction.osmRelationId);
  details.addEventListener('toggle', () => {
    if (details.open) expanded.add(direction.osmRelationId);
    else expanded.delete(direction.osmRelationId);
  });
  return details;
}

function renderNotes(lang: Lang, notes: string): HTMLElement {
  return h('details', { class: 'notes' }, [
    h('summary', { text: t(lang, 'notes') }),
    ...notes.split('\n').map((line) => h('p', { class: 'note-line', text: line })),
  ]);
}
