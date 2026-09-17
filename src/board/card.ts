import { localize, t, type Lang } from '../lib/i18n.ts';
import type { BoardStop, RouteDetail } from '../lib/types.ts';
import { h } from '../ui/dom.ts';
import { openInNewIcon } from '../ui/icons.ts';
import { legColour, type FanLeg } from './fan.ts';

export type FanStatus = { kind: 'loading' } | { kind: 'ready'; legs: FanLeg[] };

export interface StopCardProps {
  lang: Lang;
  dark: boolean;
  stop: BoardStop;
  fan: FanStatus;
  details: ReadonlyMap<string, RouteDetail>;
  highlight?: string;
  /** The map is out at the fan (or the highlighted route); the zoom button offers the way back. */
  far: boolean;
  onHighlight: (routeId: string | undefined) => void;
  onToggleView: () => void;
  onClose: () => void;
}

/** The card over the bottom of the map: the stop, and its routes as chips in the fan's colours. */
export function renderStopCard(props: StopCardProps): HTMLElement {
  const { lang, stop, fan } = props;
  return h('section', { class: 'board-card' }, [
    h('div', { class: 'board-card-head' }, [
      h('div', { class: 'board-card-titles' }, [
        h('h2', { class: 'board-card-title', text: localize(lang, stop.name) }),
        h('p', { class: 'board-card-count muted', text: countLine(props) }),
      ]),
      fan.kind === 'ready' && fan.legs.length > 0 && renderViewButton(props, fan.legs),
      h('button', { class: 'text-button board-card-button board-card-close', attrs: { type: 'button', 'aria-label': t(lang, 'clear') }, text: '×', on: { click: props.onClose } }),
    ]),
    fan.kind === 'ready' && fan.legs.length > 0 && renderChips(props, fan.legs),
  ]);
}

/** Zoom to the routes in full (all, or the singled-out one), or to the stop. Taps on the map never move it. */
function renderViewButton(props: StopCardProps, legs: readonly FanLeg[]): HTMLElement {
  const { lang } = props;
  const highlighted = legs.find((leg) => leg.routeId === props.highlight);
  const text = props.far ? t(lang, 'boardZoomStop') : highlighted ? t(lang, 'boardZoomRoute').replace('{n}', highlighted.route.number) : t(lang, 'boardZoomAll');
  return h('button', { class: 'text-button board-card-button board-card-view', attrs: { type: 'button' }, text, on: { click: props.onToggleView } });
}

function countLine(props: StopCardProps): string {
  const { lang, fan } = props;
  if (fan.kind === 'loading') return t(lang, 'boardLoadingRoutes');
  const routes = new Set(fan.legs.map((leg) => leg.routeId)).size;
  if (routes === 0) return t(lang, 'boardNoRoutes');
  return routes === 1 ? t(lang, 'routeOne') : t(lang, 'routesCount').replace('{n}', String(routes));
}

/** One chip per route, in the fan's order (by bearing), each in its line colour. */
function renderChips(props: StopCardProps, legs: readonly FanLeg[]): HTMLElement {
  const seen = new Set<string>();
  const routes = legs.filter((leg) => !seen.has(leg.routeId) && seen.add(leg.routeId));
  return h('div', { class: 'chips board-chips' }, routes.map((leg) =>
    h('button', {
      class: `chip fan-chip${props.highlight === leg.routeId ? ' is-selected' : ''}`,
      attrs: { type: 'button', style: `--leg: ${legColour(leg.hue, props.dark)}` },
      text: leg.route.number,
      on: { click: () => props.onHighlight(props.highlight === leg.routeId ? undefined : leg.routeId) },
    }),
  ));
}

/**
 * The singled-out route as a compact pill in Bus Check's title style —
 * number, where this leg goes — that is itself the link to its Bus Check
 * page; the icon at the end says so. Floats under the card, on its own:
 * Check's idiom on its own surface, apart from the card's chips.
 */
export function renderRouteLink(props: StopCardProps): HTMLElement | false {
  const { lang, fan } = props;
  if (fan.kind !== 'ready' || props.highlight === undefined) return false;
  const own = fan.legs.filter((leg) => leg.routeId === props.highlight);
  const first = own[0];
  if (!first) return false;
  const detail = props.details.get(first.routeId);
  const destinations = own
    .map((leg) => detail?.directions[leg.directionIndex]?.to)
    .filter((to) => to !== undefined)
    .map((to) => localize(lang, to));
  // The row is the card's width, so the pill sits at the card's right edge, not the window's.
  return h('div', { class: 'board-route-row' }, [
    h('a', { class: 'board-route', attrs: { href: checkHref(first, detail), target: '_blank', rel: 'noopener', title: t(lang, 'openInCheck') } }, [
      h('span', { class: 'board-route-number', text: first.route.number }),
      destinations.length > 0 && h('span', { class: 'board-route-to' }, [
        h('span', { class: 'dir-to', text: t(lang, 'to') }),
        ' ',
        h('span', { class: 'board-route-destination', text: destinations.join(' · ') }),
      ]),
      h('span', { class: 'board-route-open' }, [openInNewIcon(15)]),
    ]),
  ]);
}

/** Bus Check's hash: the number as the query, the route, and the side whose pill shows this leg's run. */
function checkHref(leg: FanLeg, detail: RouteDetail | undefined): string {
  const origin = detail?.directions[leg.directionIndex]?.origin;
  const side = origin === undefined ? '' : `/${origin === 1 ? 0 : 1}`;
  return `${import.meta.env.BASE_URL}#${encodeURIComponent(leg.route.number)}/${encodeURIComponent(leg.routeId)}${side}`;
}
