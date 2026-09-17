import type { LocalizedText, ServiceFlags, SourceAgreement } from './types.ts';

export type Lang = 'en' | 'th';

const STRINGS = {
  appName: { en: 'Bangkok Bus Check', th: 'เช็กรถเมล์กรุงเทพ' },
  tagline: { en: 'Type the bus number. See where it goes.', th: 'พิมพ์เลขสาย แล้วดูว่ารถไปไหน' },
  // The board app (a second entry point on this site): where the buses go from a stop or an area.
  boardName: { en: 'Bangkok Bus Board', th: 'ป้ายรถเมล์กรุงเทพ' },
  boardTagline: { en: 'Where the buses go from a stop near you. Nothing here yet.', th: 'รถเมล์จากป้ายใกล้คุณไปไหนบ้าง ยังไม่มีอะไรที่นี่' },
  boardBlurb: { en: 'Where the buses go from a stop near you (experimental)', th: 'รถเมล์จากป้ายใกล้คุณไปไหนบ้าง (ทดลอง)' },
  checkBlurb: { en: 'Type a bus number, see where it goes', th: 'พิมพ์เลขสาย แล้วดูว่ารถไปไหน' },
  seeAlso: { en: 'See also', th: 'ดูเพิ่มเติม' },
  boardZoomHint: { en: 'Zoom in to see the stops', th: 'ซูมเข้าเพื่อดูป้าย' },
  boardPickHint: { en: 'Tap a stop to see where its buses go', th: 'แตะป้ายเพื่อดูว่ารถเมล์ไปไหน' },
  boardLoadingStops: { en: 'Loading stops…', th: 'กำลังโหลดป้าย…' },
  boardLoadingRoutes: { en: 'Loading routes…', th: 'กำลังโหลดเส้นทาง…' },
  boardNoRoutes: { en: 'No drawable routes from this stop.', th: 'ไม่มีเส้นทางที่วาดได้จากป้ายนี้' },
  routesCount: { en: '{n} routes', th: '{n} สาย' },
  routeOne: { en: '1 route', th: '1 สาย' },
  openInCheck: { en: 'Open in Bus Check', th: 'เปิดใน Bus Check' },
  inputPlaceholder: { en: 'Bus number', th: 'เลขสายรถเมล์' },
  clear: { en: 'Clear', th: 'ล้าง' },
  backspace: { en: 'Delete', th: 'ลบ' },
  recent: { en: 'Recent', th: 'ค้นหาล่าสุด' },
  noMatch: { en: 'No route matches', th: 'ไม่พบสาย' },
  formerly: { en: 'formerly', th: 'เดิม' },
  operator: { en: 'Operator', th: 'ผู้ให้บริการ' },
  vehicles: { en: 'Buses', th: 'รถที่ให้บริการ' },
  stops: { en: 'stops', th: 'ป้าย' },
  stopOne: { en: 'stop', th: 'ป้าย' },
  noStops: { en: 'No stop list for this direction yet.', th: 'ยังไม่มีรายการป้ายสำหรับทิศทางนี้' },
  hailAndRide: { en: 'Hail-and-ride:', th: 'จุดขึ้นลงตามทาง' },
  boardingPoints: { en: 'boarding points along the way', th: 'จุด' },
  hailAndRideOnly: { en: 'Hail-and-ride route:', th: 'รถจอดรับส่งตามทาง มีจุดขึ้นลง' },
  boardingPointsShort: { en: 'boarding points', th: 'จุดขึ้นลง' },
  boardingPointsOnly: { en: 'boarding points, no named stops.', th: 'จุด ไม่มีป้ายที่มีชื่อ' },
  noDirections: { en: 'No per-direction detail for this route yet.', th: 'ยังไม่มีข้อมูลรายทิศทางของสายนี้' },
  notes: { en: 'Notes (Thai)', th: 'หมายเหตุ' },
  otherDirections: { en: 'Other directions', th: 'ทิศทางอื่น' },
  back: { en: 'Back', th: 'กลับ' },
  loading: { en: 'Loading…', th: 'กำลังโหลด…' },
  loadFailed: { en: 'Could not load route data.', th: 'โหลดข้อมูลไม่สำเร็จ' },
  retry: { en: 'Retry', th: 'ลองใหม่' },
  build: { en: 'Build', th: 'บิลด์' },
  buildOn: { en: 'on', th: 'เมื่อ' },
  switchLang: { en: 'ไทย', th: 'EN' },
  moreRoutes: { en: 'Type more digits to narrow down.', th: 'พิมพ์ตัวเลขเพิ่มเพื่อค้นหาให้แคบลง' },
  badgeExpressway: { en: 'Expressway', th: 'ทางด่วน' },
  badgeNight: { en: 'All night', th: 'ตลอดคืน' },
  badgeExtra: { en: 'Extra', th: 'เสริม' },
  badgeAirport: { en: 'Airport', th: 'สนามบิน' },
  badgeSuburban: { en: 'Suburban', th: 'ชานเมือง' },
  badgeVan: { en: 'Van', th: 'รถตู้' },
  badgeConflict: { en: 'Sources disagree', th: 'แหล่งข้อมูลไม่ตรงกัน' },
  badgeUnofficial: { en: 'Not in official feed', th: 'ไม่มีในข้อมูลทางการ' },
  hours: { en: 'Hours', th: 'เวลาเดินรถ' },
  variants: { en: 'Variants and other runs', th: 'เที่ยวเสริมและเส้นทางย่อย' },
  frontSign: { en: 'Front sign (Thai)', th: 'ป้ายหน้ารถ' },
  map: { en: 'Map', th: 'แผนที่' },
  mapLoading: { en: 'Loading the map…', th: 'กำลังโหลดแผนที่…' },
  stopOfTotal: { en: 'stop {i} of {n}', th: 'ป้ายที่ {i} จาก {n}' },
  awayFromYou: { en: '{d} away', th: 'ห่าง {d}' },
  stopsFromHere: { en: '{n} stops from here', th: 'อีก {n} ป้ายจากที่นี่' },
  stopFromHere: { en: '1 stop from here', th: 'อีก 1 ป้ายจากที่นี่' },
  stopsBack: { en: '{n} stops back', th: 'ย้อนกลับ {n} ป้าย' },
  stopBack: { en: '1 stop back', th: 'ย้อนกลับ 1 ป้าย' },
  yourNearestStop: { en: 'your nearest stop', th: 'ป้ายที่ใกล้คุณที่สุด' },
  mapLabelsHide: { en: 'Hide stop names', th: 'ซ่อนชื่อป้าย' },
  mapLabelsShow: { en: 'Show stop names', th: 'แสดงชื่อป้าย' },
  mapNoWebgl: { en: 'The map needs WebGL2, which this browser has turned off.', th: 'แผนที่ต้องใช้ WebGL2 ซึ่งเบราว์เซอร์นี้ปิดไว้' },
  loop: { en: 'Loop', th: 'วงกลม' },
  to: { en: 'to', th: 'ไป' },
  loopLeft: { en: 'Counter-clockwise', th: 'วนซ้าย' },
  loopRight: { en: 'Clockwise', th: 'วนขวา' },
  // Rotation marker after a place name, as the front sign shows it.
  senseLeft: { en: '\u21ba', th: 'วนซ้าย' },
  senseRight: { en: '\u21bb', th: 'วนขวา' },
  settings: { en: 'Settings', th: 'ตั้งค่า' },
  locationButton: { en: 'Use my location', th: 'ใช้ตำแหน่งของฉัน' },
  locationExplain: {
    en: 'Shows only the stops ahead of you. Your location is not sent anywhere.',
    th: 'แสดงเฉพาะป้ายที่อยู่ข้างหน้าคุณ ตำแหน่งของคุณจะไม่ถูกส่งไปที่ใด',
  },
  locationUse: { en: 'Use location', th: 'ใช้ตำแหน่ง' },
  turnOff: { en: 'Turn off', th: 'ปิด' },
  dontAsk: { en: 'No, don’t ask again', th: 'ไม่ ไม่ต้องถามอีก' },
  locating: { en: 'Finding your position\u2026', th: 'กำลังหาตำแหน่ง\u2026' },
  locationDenied: { en: 'Location is blocked for this site in your browser.', th: 'เบราว์เซอร์ไม่อนุญาตให้เว็บนี้ใช้ตำแหน่ง' },
  locationUnavailable: { en: 'Could not get a position right now.', th: 'ขณะนี้หาตำแหน่งไม่ได้' },
  locationUnsupported: { en: 'This browser cannot provide a location.', th: 'เบราว์เซอร์นี้ไม่รองรับตำแหน่ง' },
  nearestStop: { en: 'nearest stop', th: 'ป้ายใกล้ที่สุด' },
  nearestStopCard: { en: 'nearest stop', th: 'ป้ายใกล้สุด' },
  earlierStops: { en: 'earlier stops', th: 'ป้ายก่อนหน้า' },
  stopsAhead: { en: 'stops ahead', th: 'ป้ายข้างหน้า' },
  shown: { en: 'shown', th: 'แสดง' },
  showAllStops: { en: 'Show all stops', th: 'แสดงป้ายทั้งหมด' },
  showFewerStops: { en: 'Show fewer stops', th: 'แสดงป้ายน้อยลง' },
  locationSetting: { en: 'Location on route pages', th: 'ตำแหน่งในหน้าเส้นทาง' },
  vansSetting: { en: 'Vans in results (experimental)', th: 'รถตู้ในผลการค้นหา (ทดลอง)' },
  off: { en: 'Off', th: 'ปิด' },
  on: { en: 'On', th: 'เปิด' },
  testSection: { en: 'Test', th: 'ทดสอบ' },
  clearLocation: { en: 'Clear location', th: 'ล้างตำแหน่ง' },
  clearLocationHint: { en: 'Forgets the simulated position and the earlier "Use location" answer, so the prompt shows again.', th: 'ลบตำแหน่งจำลองและคำตอบ "ใช้ตำแหน่ง" ก่อนหน้า เพื่อให้ถามใหม่' },
  simulatedLocation: { en: 'Simulated location (test): Google Maps link or lat, lon', th: 'ตำแหน่งจำลอง (ทดสอบ): ลิงก์ Google Maps หรือ lat, lon' },
  simulatedNone: { en: 'none', th: 'ไม่มี' },
  simulatedInvalid: { en: 'Not recognised', th: 'อ่านไม่ออก' },
  theme: { en: 'Appearance', th: 'ธีม' },
  themeSystem: { en: 'System', th: 'ตามระบบ' },
  themeLight: { en: 'Light', th: 'สว่าง' },
  themeDark: { en: 'Dark', th: 'มืด' },
  accent: { en: 'Accent colour', th: 'สีหลัก' },
  accentBlue: { en: 'Blue', th: 'น้ำเงิน' },
  accentGreen: { en: 'Green', th: 'เขียว' },
  accentPurple: { en: 'Purple', th: 'ม่วง' },
  accentOrange: { en: 'Orange', th: 'ส้ม' },
  accentRed: { en: 'Red', th: 'แดง' },
  accentGray: { en: 'Gray', th: 'เทา' },
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
  ['van', 'badgeVan'],
  ['expressway', 'badgeExpressway'],
  ['night', 'badgeNight'],
  // `extra` (supplementary trips) stays in the data but not on cards: not actionable at the kerb, and noisy.
  ['airport', 'badgeAirport'],
  ['suburban', 'badgeSuburban'],
];

export function serviceBadges(lang: Lang, service: ServiceFlags): { flag: keyof ServiceFlags; label: string }[] {
  return BADGES.filter(([flag]) => service[flag]).map(([flag, key]) => ({ flag, label: t(lang, key) }));
}

/** Data-quality badges: shown so a stale or single-source answer never looks authoritative. */
export function agreementBadge(lang: Lang, agreement: SourceAgreement): string | undefined {
  if (agreement === 'conflict') return t(lang, 'badgeConflict');
  if (agreement === 'wikipedia-only') return t(lang, 'badgeUnofficial');
  return undefined;
}

export function detectLang(): Lang {
  return navigator.language.toLowerCase().startsWith('th') ? 'th' : 'en';
}
