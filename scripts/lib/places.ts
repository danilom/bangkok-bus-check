/**
 * Place-name normalisation for comparing termini across sources. Thai
 * sources abbreviate freely ("ม." for มหาวิทยาลัย, "รพ." for โรงพยาบาล) and
 * name the big terminals several ways; these are fixed synonyms, not guesses.
 */

import type { LocalizedText } from '../../src/lib/types.ts';

const ABBREVIATIONS: [RegExp, string][] = [
  [/มทร\.\s*/g, 'มหาวิทยาลัยเทคโนโลยีราชมงคล'],
  [/มธ\.\s*/g, 'มหาวิทยาลัยธรรมศาสตร์'],
  [/มจธ\.\s*/g, 'มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าธนบุรี'],
  [/ม\.\s*/g, 'มหาวิทยาลัย'],
  [/รร\.\s*/g, 'โรงเรียน'],
  [/รพ\.\s*/g, 'โรงพยาบาล'],
  [/สน\.\s*/g, 'สถานีตำรวจ'],
  [/ถ\.\s*/g, 'ถนน'],
  [/ท่าอากาศยาน/g, 'สนามบิน'],
];

/** Different official names for the same terminal. */
const SYNONYMS: [RegExp, string][] = [
  [/สถานีขนส่งผู้โดยสารกรุงเทพ\s*ฯ?\s*\(\s*จตุจักร\s*\)|หมอชิต\s*2|หมอชิตใหม่/g, 'หมอชิต 2'],
  [/สถานีขนส่งผู้โดยสารกรุงเทพ\s*ฯ?\s*\(\s*ถนนบรมราชชนนี\s*\)|สายใต้ใหม่\s*\(ตลิ่งชัน\)|สายใต้ใหม่|สายใต้\s*\(ตลิ่งชัน\)/g, 'สายใต้ใหม่'],
  [/สถานีรถไฟกรุงเทพ\s*\(หัวลำโพง\)|สถานีรถไฟกรุงเทพ/g, 'หัวลำโพง'],
  [/สถานีกลางกรุงเทพอภิวัฒน์\s*\(บางซื่อ\)|สถานีกลางกรุงเทพอภิวัฒน์|สถานีกลางบางซื่อ/g, 'กรุงเทพอภิวัฒน์'],
  [/ศูนย์ราชการเฉลิมพระเกียรติ\s*80\s*พรรษา[^,)]*|ศูนย์ราชการฯ?\s*แจ้งวัฒนะ/g, 'ศูนย์ราชการแจ้งวัฒนะ'],
  [/สะพานพระพุทธยอดฟ้า/g, 'สะพานพุทธ'],
  [/อนุสาวรีย์ชัยสมรภูมิ|อนุสาวรีย์ชัยฯ/g, 'อนุสาวรีย์ชัย'],
];

/** Loop-route markers in the two languages the feed uses. */
export const LOOP_LEFT = /วนซ้าย|counter-?clockwise|left loop|turn left|\s\(?L\)?\s*$/i;
export const LOOP_RIGHT = /วนขวา|(?<!counter-?)clockwise|right loop|turn right|\s\(?R\)?\s*$/i;
export const LOOP_PREFIX = /^(?:วงกลม|circle)\s*:?\s*/i;
// Operators' English headsigns abbreviate the sense to a trailing "L" / "R" / "(L)".
const LOOP_SUFFIX = /\s*\(?\s*(?:วนซ้าย|วนขวา|counter-?clockwise|clockwise|left loop|right loop|turn left|turn right)\s*\)?|\s+\(?[LR]\)?\s*$/gi;

/** "วงกลมหมู่บ้านบัวขาว" → "หมู่บ้านบัวขาว"; "มีนบุรี (วนซ้าย)" → "มีนบุรี". */
export function stripLoopMarkers(text: string): string {
  return text.replace(LOOP_PREFIX, '').replace(LOOP_SUFFIX, '').replace(/\s+/g, ' ').trim();
}

/** Route-description noise that is not part of the place name. */
const NOISE = [
  /\(\s*(?:วนซ้าย|วนขวา|ทางด่วน|เที่ยวกลับ|เที่ยวไป|ไม่รับผู้โดยสาร)\s*\)/g,
  /^(?:วงกลม|ช่วง|ตัดช่วง|ปอ\.)\s*:?\s*/,
];

const STATION_PREFIX = /^(?:BTS|MRT|ARL|SRT|สถานีรถไฟฟ้า|สถานี|ท่ารถ|ท่าน้ำ|ท่าเรือ|อู่)\s*/i;

/** The feed's English is inconsistently cased ("bangkhen"); a name starts with a capital, and only the first letter is touched. */
export function capitalizeEnglish(text: LocalizedText): LocalizedText {
  if (!text.en || text.en[0] === text.en[0]?.toUpperCase()) return text;
  return { ...text, en: text.en[0]?.toUpperCase() + text.en.slice(1) };
}

/** Display form of a terminus: the place name without route-description markers. */
export function displayPlace(text: string): string {
  return text
    .replace(NOISE[0] ?? /$^/, '')
    .replace(NOISE[1] ?? /$^/, '')
    .replace(/\s*\(\s*(?:expressway|via expressway|highway|return trip|outbound|inbound)\s*\)/gi, '')
    .replace(/^(?:section|circle)\s*:?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "เเ" (two สระเอ) is a common typing error for "แ"; they look alike but do not compare equal. */
export function fixThaiTypos(text: string): string {
  return text.replace(/เเ/g, 'แ');
}

export function normalizePlace(text: string): string {
  let result = fixThaiTypos(text);
  for (const pattern of NOISE) result = result.replace(pattern, '');
  for (const [pattern, replacement] of ABBREVIATIONS) result = result.replace(pattern, replacement);
  for (const [pattern, replacement] of SYNONYMS) result = result.replace(pattern, replacement);
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Forms of a name worth comparing: as written, without a parenthesised
 * qualifier, the qualifier alone, and each without a station/pier prefix.
 */
export function placeVariants(text: string): string[] {
  const normalized = normalizePlace(text);
  const variants = new Set<string>([normalized]);
  const parenthesised = /\(([^)]*)\)/.exec(normalized)?.[1]?.trim();
  const withoutParens = normalized.replace(/\s*\([^)]*\)/g, '').trim();
  if (parenthesised) variants.add(parenthesised);
  if (withoutParens) variants.add(withoutParens);
  for (const variant of [...variants]) {
    const stripped = variant.replace(STATION_PREFIX, '').trim();
    if (stripped) variants.add(stripped);
  }
  return [...variants].filter((variant) => variant.length > 0);
}
