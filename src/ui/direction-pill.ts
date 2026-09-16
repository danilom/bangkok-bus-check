import { isFallback, localize, t, type Lang } from '../lib/i18n.ts';
import type { LocalizedText, RouteSummary } from '../lib/types.ts';
import { h } from './dom.ts';

/** Which terminus the bus departs from: index into `Route.terminals`. */
export type Side = 0 | 1;

/**
 * Which side of an element a tap landed on. Cards and the detail header are
 * split down the middle so a thumb has far more than the pill to hit.
 */
export function sideAt(event: MouseEvent, element: HTMLElement): Side {
  const bounds = element.getBoundingClientRect();
  return event.clientX - bounds.left < bounds.width / 2 ? 0 : 1;
}

export interface DirectionPillProps {
  lang: Lang;
  route: RouteSummary;
  /** Highlighted half, when used as a toggle. */
  selected?: Side;
  onSelect: (side: Side) => void;
}

/**
 * The route as a line with a tappable half per direction of travel:
 * `[ Bueng Kum → ] [ ← Memorial Bridge ]`. Each half is labelled by the
 * terminus the bus departs from; the arrow shows where it is heading.
 */
export function renderDirectionPill(props: DirectionPillProps): HTMLElement {
  const { lang, route, selected } = props;
  if (!route.terminals) return h('p', { class: 'terminals-unknown', text: '—' });
  const [from, to] = route.terminals;
  if (route.loop) {
    // A loop has no termini: the halves are the two rotation senses, labelled
    // by each run's headsign; a sense with no run is greyed out.
    let [left, right] = route.sideLabels ?? [null, null];
    // The same headsign on both senses says nothing; the rotation words do.
    if (left && right && left.th === right.th) [left, right] = [null, null];
    const name = (label: LocalizedText | null, fallback: 'loopLeft' | 'loopRight'): HTMLElement =>
      h('span', { class: label ? 'dir-name' : 'dir-name is-empty', text: label ? localize(lang, label) : t(lang, fallback) });
    return h('div', { class: 'dir-pill dir-pill-loop', attrs: { role: 'group' } }, [
      renderHalf(props, 0, [h('span', { class: 'dir-arrow', text: '↺' }), name(left, 'loopLeft')], selected === 0),
      renderHalf(props, 1, [name(right, 'loopRight'), h('span', { class: 'dir-arrow', text: '↻' })], selected === 1),
    ]);
  }
  return h('div', { class: 'dir-pill', attrs: { role: 'group' } }, [
    renderHalf(props, 0, [terminusLabel(lang, from), arrow('right')], selected === 0),
    renderHalf(props, 1, [arrow('left'), terminusLabel(lang, to)], selected === 1),
  ]);
}

/** A bold arrow with a big head; SVG so it looks the same in every font and never turns into an emoji. */
function arrow(direction: 'left' | 'right'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'dir-arrow dir-arrow-svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  // Shaft from the left, head filling the right half; mirrored for left.
  path.setAttribute('d', direction === 'right' ? 'M2 10h10V4l10 8-10 8v-6H2z' : 'M22 10H12V4L2 12l10 8v-6h10z');
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

function renderHalf(props: DirectionPillProps, side: Side, children: Element[], isSelected: boolean): HTMLElement {
  return h('button', {
    class: `dir-half dir-half-${side}${isSelected ? ' is-selected' : ''}`,
    attrs: { type: 'button', 'aria-pressed': String(isSelected) },
    on: {
      click: (event) => {
        // The card behind the pill opens the route neutrally; a half picks a side.
        event.stopPropagation();
        props.onSelect(side);
      },
    },
  }, children);
}

/** For loop routes: "Loop: Bua Khao Village – Min Buri" above the pill. */
export function renderLoopLine(lang: Lang, route: RouteSummary): HTMLElement | false {
  if (!route.loop || !route.terminals) return false;
  const [base, via] = route.terminals;
  return h('p', { class: 'loop-line' }, [
    h('span', { class: 'loop-label', text: `${t(lang, 'loop')}: ` }),
    terminusLabel(lang, base),
    h('span', { class: 'terminals-arrow', text: ' – ' }),
    terminusLabel(lang, via),
  ]);
}

function terminusLabel(lang: Lang, text: { th: string; en?: string }): HTMLElement {
  return h('span', { class: isFallback(lang, text) ? 'dir-name is-fallback' : 'dir-name', text: localize(lang, text) });
}
