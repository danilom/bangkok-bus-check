import { agreementBadge, localize, serviceBadges, t, type Lang } from '../lib/i18n.ts';
import type { RouteMatch } from '../lib/matcher.ts';
import type { RouteSummary } from '../lib/types.ts';
import { renderDirectionPill, renderLoopLine, sideAt, type Side } from './direction-pill.ts';
import { h } from './dom.ts';

/** The number as on the bus, with former numbers small; the matched alias is highlighted. */
/** The title row: number, former numbers, and the badges right-aligned in the space the row has left. */
export function renderNumber(lang: Lang, route: RouteSummary, matchedAlias?: string): HTMLElement {
  const former = route.formerNumbers.filter((number) => number !== route.number);
  return h('div', { class: 'route-number' }, [
    // A van is not the bus of the same number: say so in the title itself.
    route.service.van && h('span', { class: 'number-kind', text: t(lang, 'badgeVan') }),
    h('span', { class: `number-primary${matchedAlias === route.number ? ' is-match' : ''}`, text: route.number }),
    former.length > 0 &&
      h('span', { class: 'number-former' }, [
        h('span', { class: 'number-former-label', text: `${t(lang, 'formerly')} ` }),
        ...former.map((number, index) =>
          h('span', { class: `number-former-item${matchedAlias === number ? ' is-match' : ''}`, text: index < former.length - 1 ? `${number}, ` : number }),
        ),
      ]),
    renderBadges(lang, route),
  ]);
}

export function renderBadges(lang: Lang, route: RouteSummary): HTMLElement | false {
  const badges = serviceBadges(lang, route.service).map((badge) => h('span', { class: 'badge', text: badge }));
  const warning = agreementBadge(lang, route.agreement);
  if (warning) badges.push(h('span', { class: 'badge badge-warning', text: warning }));
  return badges.length > 0 && h('div', { class: 'badges' }, badges);
}

export interface RouteCardProps {
  lang: Lang;
  match: RouteMatch;
  /** Opens the route; `side` is set when a direction half was tapped. */
  onOpen: (route: RouteSummary, side?: Side) => void;
}

export function renderRouteCard({ lang, match, onOpen }: RouteCardProps): HTMLElement {
  const { route } = match;
  const card = h(
    'article',
    {
      class: 'route-card',
      attrs: { tabindex: '0', role: 'button' },
      on: {
        click: (event) => onOpen(route, sideAt(event, card)),
        keydown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(route, 0);
          }
          if (event.key === 'ArrowRight') onOpen(route, 1);
        },
      },
    },
    [
      renderNumber(lang, route, match.alias),
      renderLoopLine(lang, route),
      renderDirectionPill({ lang, route, onSelect: (side) => onOpen(route, side) }),
      renderMeta(lang, route, false),
    ],
  );
  return card;
}

/**
 * The footer line: operator, then what the bus looks like (the fact that
 * identifies it at the kerb). On a results card it is one line with an
 * ellipsis and the vehicle names lose their bracketed part ("(electric)",
 * "(Euro II)") so the colour and type fit; the route page shows it in full.
 */
export function renderMeta(lang: Lang, route: RouteSummary, full: boolean): HTMLElement | false {
  const vehicles = route.vehicles.map((vehicle) => (full ? localize(lang, vehicle) : withoutParenthetical(localize(lang, vehicle))));
  const parts = [route.operator && localize(lang, route.operator), ...vehicles].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return false;
  return h('p', { class: full ? 'route-meta' : 'route-meta is-clipped', text: parts.join(' · ') });
}

function withoutParenthetical(text: string): string {
  return text.replace(/\s*\([^)]*\)/g, '').trim();
}
