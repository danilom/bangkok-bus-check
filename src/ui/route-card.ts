import { agreementBadge, localize, serviceBadges, t, type Lang } from '../lib/i18n.ts';
import type { RouteMatch } from '../lib/matcher.ts';
import type { RouteSummary, Vehicle } from '../lib/types.ts';
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
  const badges = serviceBadges(lang, route.service).map(({ flag, label }) => h('span', { class: 'badge' }, [flag === 'night' && moonIcon(), label]));
  // The data warning outranks the service badges: it goes first.
  const warning = agreementBadge(lang, route.agreement);
  if (warning) badges.unshift(h('span', { class: 'badge badge-warning', text: warning }));
  return badges.length > 0 && h('div', { class: 'badges' }, badges);
}

/** A filled crescent, tilted like the usual night-mode icon; takes the badge's text colour. */
function moonIcon(): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'badge-icon');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  // A circle with a smaller circle cut from its upper right, rotated 40° clockwise.
  path.setAttribute('d', 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('transform', 'rotate(40 12 12)');
  svg.append(path);
  return svg;
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
  // Swatches sit at the right end of the line, in the vehicles' order; the text clips before they do.
  const swatches = route.vehicles.map(renderSwatch).filter((swatch): swatch is HTMLElement => swatch !== false);
  const parts: string[] = [];
  if (route.operator) parts.push(localize(lang, route.operator));
  for (const vehicle of route.vehicles) parts.push(full ? localize(lang, vehicle) : withoutParenthetical(localize(lang, vehicle)));
  if (parts.length === 0 && swatches.length === 0) return false;
  return h('p', { class: full ? 'route-meta' : 'route-meta is-clipped' }, [
    h('span', { class: 'route-meta-text', text: parts.join(' · ') }),
    swatches.length > 0 && h('span', { class: 'route-meta-swatches' }, swatches),
  ]);
}

/** A small square in the livery's colours, one horizontal band per colour word ("cream-red" → cream over red), as on the bus. */
function renderSwatch(vehicle: Vehicle): HTMLElement | false {
  const colours = vehicle.colours ?? [];
  if (colours.length === 0) return false;
  const step = 100 / colours.length;
  const bands = colours.map((colour, index) => `${colour} ${index * step}% ${(index + 1) * step}%`).join(', ');
  return h('span', { class: 'swatch', attrs: { style: `background: linear-gradient(to bottom, ${bands})`, 'aria-hidden': 'true' } });
}

function withoutParenthetical(text: string): string {
  return text.replace(/\s*\([^)]*\)/g, '').trim();
}
