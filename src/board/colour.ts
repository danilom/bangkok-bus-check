/**
 * OKLCH → sRGB hex, for the fan's line colours. HSL's lightness is not
 * perceptual (a yellow and a blue at the same numbers differ wildly), so
 * hues spaced round the wheel in HSL come out glaring here and dull there.
 * OKLCH keeps every hue at the same visual weight; MapLibre and the older
 * browsers do not parse it, hence the conversion. Björn Ottosson's matrices.
 */

export interface Oklch {
  /** Perceptual lightness, 0–1. */
  l: number;
  /** Chroma; sRGB holds about 0.1–0.3 depending on hue and lightness. */
  c: number;
  /** Hue in degrees. */
  h: number;
}

/**
 * A hex colour for the OKLCH value, chroma reduced until it fits sRGB so
 * lightness and hue are kept exactly and only the saturation gives.
 */
export function oklchToHex({ l, c, h }: Oklch): string {
  let chroma = c;
  let rgb = oklchToLinearSrgb(l, chroma, h);
  while (!inGamut(rgb) && chroma > 0.002) {
    chroma -= 0.004;
    rgb = oklchToLinearSrgb(l, chroma, h);
  }
  return `#${rgb.map((channel) => toHexByte(gammaEncode(clamp01(channel)))).join('')}`;
}

function oklchToLinearSrgb(l: number, c: number, hDegrees: number): [number, number, number] {
  const hRadians = (hDegrees * Math.PI) / 180;
  const a = c * Math.cos(hRadians);
  const b = c * Math.sin(hRadians);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

function inGamut(rgb: readonly number[]): boolean {
  return rgb.every((channel) => channel >= -0.0005 && channel <= 1.0005);
}

function gammaEncode(linear: number): number {
  return linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toHexByte(value: number): string {
  return Math.round(value * 255).toString(16).padStart(2, '0');
}
