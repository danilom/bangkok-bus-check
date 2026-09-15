import { isFallback, localize, serviceBadges, t, type Lang } from '../lib/i18n.ts';
import type { RouteMatch } from '../lib/matcher.ts';
import type { RouteSummary } from '../lib/types.ts';
import { h } from './dom.ts';

/** The number as on the bus, with former numbers small; the matched alias is highlighted. */
export function renderNumber(lang: Lang, route: RouteSummary, matchedAlias?: string): HTMLElement {
  const former = route.formerNumbers.filter((number) => number !== route.number);
  return h('div', { class: 'route-number' }, [
    h('span', { class: `number-primary${matchedAlias === route.number ? ' is-match' : ''}`, text: route.number }),
    former.length > 0 &&
      h('span', { class: 'number-former' }, [
        h('span', { class: 'number-former-label', text: `${t(lang, 'formerly')} ` }),
        ...former.map((number, index) =>
          h('span', { class: `number-former-item${matchedAlias === number ? ' is-match' : ''}`, text: index < former.length - 1 ? `${number}, ` : number }),
        ),
      ]),
  ]);
}

export function renderTerminals(lang: Lang, route: RouteSummary): HTMLElement {
  if (!route.terminals) return h('p', { class: 'terminals terminals-unknown', text: '—' });
  const [from, to] = route.terminals;
  return h('p', { class: 'terminals' }, [
    h('span', { class: fallbackClass(lang, from), text: localize(lang, from) }),
    h('span', { class: 'terminals-arrow', text: ' ↔ ' }),
    h('span', { class: fallbackClass(lang, to), text: localize(lang, to) }),
  ]);
}

function fallbackClass(lang: Lang, text: { th: string; en?: string }): string {
  return isFallback(lang, text) ? 'terminal is-fallback' : 'terminal';
}

export function renderBadges(lang: Lang, route: RouteSummary): HTMLElement | false {
  const badges = serviceBadges(lang, route.service);
  return badges.length > 0 && h('div', { class: 'badges' }, badges.map((badge) => h('span', { class: 'badge', text: badge })));
}

export function renderRouteCard(lang: Lang, match: RouteMatch, onOpen: (route: RouteSummary) => void): HTMLElement {
  const { route } = match;
  return h(
    'button',
    { class: 'route-card', attrs: { type: 'button' }, on: { click: () => onOpen(route) } },
    [
      renderNumber(lang, route, match.alias),
      renderTerminals(lang, route),
      h('div', { class: 'route-meta' }, [
        renderBadges(lang, route),
        route.operator && h('span', { class: 'operator', text: localize(lang, route.operator) }),
      ]),
    ],
  );
}
