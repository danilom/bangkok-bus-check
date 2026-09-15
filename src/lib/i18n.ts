import type { LocalizedText, ServiceFlags } from './types.ts';

export type Lang = 'en' | 'th';

const STRINGS = {
  appName: { en: 'Bangkok Bus Check', th: 'เช็กรถเมล์กรุงเทพ' },
  tagline: { en: 'Type the bus number. See where it goes.', th: 'พิมพ์เลขสาย แล้วดูว่ารถไปไหน' },
  inputPlaceholder: { en: 'Bus number', th: 'เลขสายรถเมล์' },
  clear: { en: 'Clear', th: 'ล้าง' },
  backspace: { en: 'Delete', th: 'ลบ' },
  recent: { en: 'Recent', th: 'ค้นหาล่าสุด' },
  noMatch: { en: 'No route matches', th: 'ไม่พบสาย' },
  formerly: { en: 'formerly', th: 'เดิม' },
  operator: { en: 'Operator', th: 'ผู้ให้บริการ' },
  vehicles: { en: 'Buses', th: 'รถที่ให้บริการ' },
  stops: { en: 'stops', th: 'ป้าย' },
  noStops: { en: 'No stop list for this direction yet.', th: 'ยังไม่มีรายการป้ายสำหรับทิศทางนี้' },
  noDirections: { en: 'No per-direction detail for this route yet.', th: 'ยังไม่มีข้อมูลรายทิศทางของสายนี้' },
  notes: { en: 'Notes (Thai)', th: 'หมายเหตุ' },
  back: { en: 'Back', th: 'กลับ' },
  loading: { en: 'Loading…', th: 'กำลังโหลด…' },
  loadFailed: { en: 'Could not load route data.', th: 'โหลดข้อมูลไม่สำเร็จ' },
  retry: { en: 'Retry', th: 'ลองใหม่' },
  dataAsOf: { en: 'Data as of', th: 'ข้อมูล ณ' },
  switchLang: { en: 'ไทย', th: 'EN' },
  moreRoutes: { en: 'Type more digits to narrow down.', th: 'พิมพ์ตัวเลขเพิ่มเพื่อค้นหาให้แคบลง' },
  badgeExpressway: { en: 'Expressway', th: 'ทางด่วน' },
  badgeNight: { en: 'All night', th: 'ตลอดคืน' },
  badgeExtra: { en: 'Extra', th: 'เสริม' },
  badgeAirport: { en: 'Airport', th: 'สนามบิน' },
  badgeSuburban: { en: 'Suburban', th: 'ชานเมือง' },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

export function t(lang: Lang, key: StringKey): string {
  return STRINGS[key][lang];
}

/** Shown in the chosen language, falling back to Thai (always present). */
export function localize(lang: Lang, text: LocalizedText): string {
  return (lang === 'en' && text.en) || text.th;
}

/** Whether the localized text had to fall back to the other language. */
export function isFallback(lang: Lang, text: LocalizedText): boolean {
  return lang === 'en' && !text.en;
}

const BADGES: [keyof ServiceFlags, StringKey][] = [
  ['expressway', 'badgeExpressway'],
  ['night', 'badgeNight'],
  ['extra', 'badgeExtra'],
  ['airport', 'badgeAirport'],
  ['suburban', 'badgeSuburban'],
];

export function serviceBadges(lang: Lang, service: ServiceFlags): string[] {
  return BADGES.filter(([flag]) => service[flag]).map(([, key]) => t(lang, key));
}

export function detectLang(): Lang {
  return navigator.language.toLowerCase().startsWith('th') ? 'th' : 'en';
}
