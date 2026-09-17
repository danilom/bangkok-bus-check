/**
 * The board app's URL hash: "#settings", or the selected stop's id
 * ("#s2369" — Bus Check's ids, which already carry the s, so a jump
 * between the apps can be added later).
 */

export interface BoardHash {
  settings?: boolean;
  stop?: string;
}

export function readBoardHash(hash: string): BoardHash {
  if (hash === '#settings') return { settings: true };
  const match = /^#(s\d+)$/.exec(hash);
  return match?.[1] ? { stop: match[1] } : {};
}

export function formatBoardHash(state: BoardHash): string {
  if (state.settings) return '#settings';
  return state.stop ? `#${state.stop}` : '';
}
