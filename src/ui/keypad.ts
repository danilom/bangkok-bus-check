import type { Lang } from '../lib/i18n.ts';
import { t } from '../lib/i18n.ts';
import { h } from './dom.ts';

export interface KeypadHandlers {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
}

const LAYOUT: readonly (readonly string[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['⌫', '0', '✕'],
];

/**
 * On-screen digit keys so the app is ready to type the moment it opens —
 * browsers refuse to raise the OS keyboard without a tap.
 */
export function renderKeypad(lang: Lang, handlers: KeypadHandlers): HTMLElement {
  return h('div', { class: 'keypad', attrs: { role: 'group', 'aria-label': t(lang, 'inputPlaceholder') } },
    LAYOUT.flat().map((key) => renderKey(lang, key, handlers)),
  );
}

function renderKey(lang: Lang, key: string, handlers: KeypadHandlers): HTMLElement {
  const isDigit = /^\d$/.test(key);
  const label = key === '⌫' ? t(lang, 'backspace') : key === '✕' ? t(lang, 'clear') : key;
  const action = (): void => {
    if (isDigit) handlers.onDigit(key);
    else if (key === '⌫') handlers.onBackspace();
    else handlers.onClear();
    tick();
  };
  return h('button', {
    class: isDigit ? 'key key-digit' : 'key key-action',
    text: key,
    attrs: { type: 'button', 'aria-label': label },
    on: {
      // Keep focus (and the physical keyboard) on the text field.
      pointerdown: (event) => event.preventDefault(),
      click: action,
    },
  });
}

/** Haptic feedback where the platform offers it (Android); silently nothing elsewhere. */
function tick(): void {
  if (typeof navigator.vibrate === 'function') navigator.vibrate(8);
}

/**
 * The keypad is for thumbs, so it defaults to touch devices; `?keypad=1` or
 * `?keypad=0` in the URL overrides for testing on a desktop.
 */
export function keypadEnabled(search: string, coarsePointer: boolean): boolean {
  const override = new URLSearchParams(search).get('keypad');
  if (override === '1' || override === 'true') return true;
  if (override === '0' || override === 'false') return false;
  return coarsePointer;
}
