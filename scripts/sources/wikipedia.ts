/**
 * Extracts routes from the Thai Wikipedia page
 * "รายการเส้นทางเดินรถโดยสารประจำทางในกรุงเทพมหานครและปริมณฑล".
 *
 * The page is one long article with route tables grouped under headings
 * (old-licence numbers, reform zones 1–4, airport, suburban, expressway and
 * all-night services) followed by a discontinued-routes section we skip, and a
 * separate "276 reform routes" table that maps new numbers to old ones.
 */

import { canonicalRouteNumber } from '../../src/lib/route-number.ts';
import { cleanWikitext, parseSections, parseTables, type WikiTable } from '../lib/wikitext.ts';

export type WikiCategory =
  | 'airport'
  | 'old-licence'
  | 'zone'
  | 'suburban'
  | 'other'
  | 'expressway'
  | 'night';

export interface WikiRoute {
  number: string;
  /** Other numbers named in the number cell (old numbers, comparable routes). */
  aliases: string[];
  /**
   * Single-digit parenthesised tokens: either an old route number ("3-1 (2)")
   * or a footnote marker ("2-36 (1)"). Confirmed against the reform mapping.
   */
  unconfirmedAliases: string[];
  from: string;
  to: string;
  vehicles: string[];
  operator?: string;
  notes?: string;
  category: WikiCategory;
  line: number;
}

export interface WikiParseResult {
  routes: WikiRoute[];
  /** new number → old numbers, from the 276-route reform table. */
  reformMapping: Map<string, string[]>;
  skipped: { line: number; reason: string }[];
}

const ROUTE_LIST_HEADING = 'รายชื่อสายรถโดยสารประจำทาง';
const REFORM_TABLE_HEADING = 'รายชื่อสายรถโดยสารประจำทางปฏิรูป';

const CATEGORY_KEYWORDS: [RegExp, WikiCategory][] = [
  [/ตลอดคืน/, 'night'],
  [/ทางด่วน/, 'expressway'],
  [/ท่าอากาศยาน/, 'airport'],
  [/ใบอนุญาตเดิม/, 'old-licence'],
  [/ใบอนุญาตใหม่|โซน/, 'zone'],
  [/หมวด 4/, 'suburban'],
  [/อื่น/, 'other'],
];

const SKIP_HEADINGS = /ยุติการให้บริการ|เขตการเดินรถ/;

export function parseWikipediaRoutes(wikitext: string): WikiParseResult {
  const tables = parseTables(wikitext);
  const categoryAt = buildCategoryLookup(wikitext);
  const routes: WikiRoute[] = [];
  const skipped: WikiParseResult['skipped'] = [];
  let reformMapping = new Map<string, string[]>();

  for (const table of tables) {
    const context = categoryAt(table.line);
    if (context === 'reform-mapping') {
      reformMapping = parseReformMapping(table);
    } else if (context !== undefined) {
      const parsed = parseRouteTable(table, context);
      routes.push(...parsed.routes);
      skipped.push(...parsed.skipped);
    }
  }
  return { routes, reformMapping, skipped };
}

type TableContext = WikiCategory | 'reform-mapping';

/** Maps a source line to the category of the heading chain above it. */
function buildCategoryLookup(wikitext: string): (line: number) => TableContext | undefined {
  const sections = parseSections(wikitext);
  return (line) => {
    const chain: string[] = [];
    for (const section of sections) {
      if (section.line > line) break;
      chain.length = Math.max(0, section.level - 2);
      chain[section.level - 2] = section.title;
    }
    return classify(chain);
  };
}

function classify(chain: string[]): TableContext | undefined {
  const [top, ...rest] = chain;
  if (rest.some((title) => title.startsWith(REFORM_TABLE_HEADING))) return 'reform-mapping';
  if (top !== ROUTE_LIST_HEADING) return undefined;
  const path = rest.join(' / ');
  if (SKIP_HEADINGS.test(path)) return undefined;
  return CATEGORY_KEYWORDS.find(([pattern]) => pattern.test(path))?.[1];
}

interface ColumnIndex {
  number: number;
  from: number;
  to: number;
  vehicles?: number;
  operator?: number;
  notes?: number;
}

function findColumns(headers: string[]): ColumnIndex | undefined {
  const cleaned = headers.map(cleanWikitext);
  const indexOf = (label: string): number | undefined => {
    const index = cleaned.findIndex((header) => header.startsWith(label));
    return index === -1 ? undefined : index;
  };
  const number = indexOf('สายที่');
  const from = indexOf('จุดเริ่มต้น');
  const to = indexOf('จุดสิ้นสุด');
  if (number === undefined || from === undefined || to === undefined) return undefined;
  const columns: ColumnIndex = { number, from, to };
  const vehicles = indexOf('ประเภทของรถ');
  const operator = indexOf('ผู้ให้บริการ');
  const notes = indexOf('หมายเหตุ');
  if (vehicles !== undefined) columns.vehicles = vehicles;
  if (operator !== undefined) columns.operator = operator;
  if (notes !== undefined) columns.notes = notes;
  return columns;
}

function parseRouteTable(
  table: WikiTable,
  category: WikiCategory,
): { routes: WikiRoute[]; skipped: WikiParseResult['skipped'] } {
  const columns = findColumns(table.headers);
  if (!columns) return { routes: [], skipped: [{ line: table.line, reason: 'unrecognised headers' }] };

  const routes: WikiRoute[] = [];
  const skipped: WikiParseResult['skipped'] = [];
  table.rows.forEach((row, offset) => {
    const line = table.line + offset;
    const numberCell = parseNumberCell(cleanWikitext(row[columns.number] ?? ''));
    if (!numberCell) {
      skipped.push({ line, reason: `not a route number: "${cleanWikitext(row[columns.number] ?? '')}"` });
      return;
    }
    const route: WikiRoute = {
      ...numberCell,
      from: cleanWikitext(row[columns.from] ?? ''),
      to: cleanWikitext(row[columns.to] ?? ''),
      vehicles: parseVehicles(columns.vehicles === undefined ? '' : (row[columns.vehicles] ?? '')),
      category,
      line,
    };
    const operator = columns.operator === undefined ? '' : cleanWikitext(row[columns.operator] ?? '');
    if (operator) route.operator = operator.replace(/\n/g, ' / ');
    const notes = columns.notes === undefined ? '' : cleanWikitext(row[columns.notes] ?? '');
    if (notes) route.notes = notes;
    routes.push(route);
  });
  return { routes, skipped };
}

function parseVehicles(raw: string): string[] {
  return cleanWikitext(raw)
    .split('\n')
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter((line) => line.length > 0);
}

/**
 * "1-2E (34E)" → number 1-2E, aliases [34E]
 * "1-8 (59 / 503) (3)" → number 1-8, aliases [59, 503], unconfirmed [3]
 * "1-31 (523 (เทียบเคียง))" → number 1-31, aliases [523]
 */
export function parseNumberCell(
  text: string,
): Pick<WikiRoute, 'number' | 'aliases' | 'unconfirmedAliases'> | undefined {
  const open = text.indexOf('(');
  const number = canonicalRouteNumber(open === -1 ? text : text.slice(0, open));
  if (!number) return undefined;

  const aliases: string[] = [];
  const unconfirmedAliases: string[] = [];
  for (const group of topLevelParenGroups(text)) {
    const inner = group.replace(/\(เทียบเคียง\)/g, '');
    for (const token of inner.split(/[/,]/)) {
      const alias = canonicalRouteNumber(token);
      if (!alias || alias === number) continue;
      (/^\d$/.test(alias) ? unconfirmedAliases : aliases).push(alias);
    }
  }
  return { number, aliases, unconfirmedAliases };
}

function topLevelParenGroups(text: string): string[] {
  const groups: string[] = [];
  let depth = 0;
  let start = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') {
      if (depth === 0) start = index + 1;
      depth += 1;
    } else if (char === ')' && depth > 0) {
      depth -= 1;
      if (depth === 0) groups.push(text.slice(start, index));
    }
  }
  return groups;
}

/** The 276-route table: "1 - 8 || 59, 503" → 1-8 → [59, 503]. */
function parseReformMapping(table: WikiTable): Map<string, string[]> {
  const mapping = new Map<string, string[]>();
  const cleaned = table.headers.map(cleanWikitext);
  const oldColumn = cleaned.findIndex((header) => header.startsWith('เส้นทางเทียบเคียง'));
  if (oldColumn === -1) return mapping;

  for (const row of table.rows) {
    const newNumber = canonicalRouteNumber(cleanWikitext(row[0] ?? ''));
    if (!newNumber) continue;
    const olds = cleanWikitext(row[oldColumn] ?? '')
      .split(/[/,]/)
      .map((token) => canonicalRouteNumber(token))
      .filter((token): token is string => token !== undefined);
    mapping.set(newNumber, olds);
  }
  return mapping;
}
