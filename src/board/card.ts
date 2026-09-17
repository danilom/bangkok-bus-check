import { localize, t, type Lang } from '../lib/i18n.ts';
import type { BoardStop, RouteDetail } from '../lib/types.ts';
import { h } from '../ui/dom.ts';
import { legColour, type FanLeg } from './fan.ts';

export type FanStatus = { kind: 'loading' } | { kind: 'ready'; legs: FanLeg[] };

export interface StopCardProps {
  lang: Lang;
  dark: boolean;
  stop: BoardStop;
  fan: FanStatus;
  details: ReadonlyMap<string, RouteDetail>;
  highlight?: string;
  onHighlight: (routeId: string | undefined) => void;
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
      h('button', { class: 'icon-button board-card-close', attrs: { type: 'button', 'aria-label': t(lang, 'clear') }, text: '×', on: { click: props.onClose } }),
    ]),
    fan.kind === 'ready' && fan.legs.length > 0 && renderChips(props, fan.legs),
    fan.kind === 'ready' && props.highlight !== undefined && renderHighlight(props, fan.legs),
  ]);
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

/** The singled-out route: where each of its legs goes, and a link to its Bus Check page. */
function renderHighlight(props: StopCardProps, legs: readonly FanLeg[]): HTMLElement | false {
  const { lang } = props;
  const own = legs.filter((leg) => leg.routeId === props.highlight);
  const first = own[0];
  if (!first) return false;
  const detail = props.details.get(first.routeId);
  return h('div', { class: 'board-highlight' }, [
    ...own.map((leg) => {
      const direction = detail?.directions[leg.directionIndex];
      return h('p', { class: 'board-highlight-to', text: direction ? `→ ${localize(lang, direction.to)}` : '' });
    }),
    h('a', { class: 'link-button board-open', attrs: { href: checkHref(first, detail), target: '_blank', rel: 'noopener' }, text: `${t(lang, 'openInCheck')} ↗` }),
  ]);
}

/** Bus Check's hash: the number as the query, the route, and the side whose pill shows this leg's run. */
function checkHref(leg: FanLeg, detail: RouteDetail | undefined): string {
  const origin = detail?.directions[leg.directionIndex]?.origin;
  const side = origin === undefined ? '' : `/${origin === 1 ? 0 : 1}`;
  return `${import.meta.env.BASE_URL}#${encodeURIComponent(leg.route.number)}/${encodeURIComponent(leg.routeId)}${side}`;
}
