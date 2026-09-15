/**
 * Minimal MediaWiki table parser: enough for `{| ... |}` tables with
 * `rowspan`/`colspan`, cells on one line (`a || b`) or one per line, and
 * multi-line cell bodies. Cell content is returned as raw wikitext; see
 * `cleanWikitext` for turning it into plain text.
 */

export interface WikiTable {
  /** 1-based line number of the `{|` in the source, for error messages. */
  line: number;
  headers: string[];
  /** Cell text per column, rowspan/colspan already expanded. */
  rows: string[][];
}

export interface WikiSection {
  level: number;
  title: string;
  line: number;
}

interface Cell {
  text: string;
  rowspan: number;
  colspan: number;
}

const HEADING = /^(={2,6})\s*(.*?)\s*\1\s*$/;

/** Returns every heading in document order, with its nesting level. */
export function parseSections(wikitext: string): WikiSection[] {
  const sections: WikiSection[] = [];
  wikitext.split('\n').forEach((line, index) => {
    const match = HEADING.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      sections.push({ level: match[1].length, title: stripMarkup(match[2]).trim(), line: index + 1 });
    }
  });
  return sections;
}

/** Parses every top-level table in the document. */
export function parseTables(wikitext: string): WikiTable[] {
  const lines = wikitext.split('\n');
  const tables: WikiTable[] = [];
  let index = 0;
  while (index < lines.length) {
    if (lines[index]?.startsWith('{|')) {
      const end = findTableEnd(lines, index);
      tables.push(parseTable(lines.slice(index + 1, end), index + 1));
      index = end + 1;
    } else {
      index += 1;
    }
  }
  return tables;
}

function findTableEnd(lines: string[], start: number): number {
  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.startsWith('{|')) depth += 1;
    if (line.startsWith('|}')) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`Unterminated table starting at line ${start + 1}`);
}

function parseTable(lines: string[], line: number): WikiTable {
  const rawRows = splitRows(lines);
  const headers: string[] = [];
  const grid: string[][] = [];
  // Cells hanging down from earlier rows via rowspan, keyed by column.
  const pending = new Map<number, { text: string; remaining: number }>();

  for (const rawRow of rawRows) {
    if (rawRow.header && grid.length === 0) {
      // Header colspans must widen the header row so column indexes line up
      // with the data rows; header rowspans never hang into data rows.
      headers.push(...expandRow(rawRow.cells, new Map()));
      continue;
    }
    grid.push(expandRow(rawRow.cells, pending));
  }
  return { line, headers, rows: grid };
}

function expandRow(cells: Cell[], pending: Map<number, { text: string; remaining: number }>): string[] {
  const row: string[] = [];
  let column = 0;
  const fillPending = (): void => {
    let hanging = pending.get(column);
    while (hanging) {
      row[column] = hanging.text;
      hanging.remaining -= 1;
      if (hanging.remaining === 0) pending.delete(column);
      column += 1;
      hanging = pending.get(column);
    }
  };

  for (const cell of cells) {
    fillPending();
    for (let span = 0; span < cell.colspan; span += 1) {
      row[column] = cell.text;
      if (cell.rowspan > 1) pending.set(column, { text: cell.text, remaining: cell.rowspan - 1 });
      column += 1;
    }
  }
  fillPending();
  return row;
}

interface RawRow {
  header: boolean;
  cells: Cell[];
}

function splitRows(lines: string[]): RawRow[] {
  const rows: RawRow[] = [];
  let current: RawRow | undefined;
  let lastCell: Cell | undefined;

  const startRow = (): void => {
    current = { header: false, cells: [] };
    rows.push(current);
  };

  for (const line of lines) {
    if (line.startsWith('|-')) {
      startRow();
      lastCell = undefined;
    } else if (line.startsWith('|+')) {
      // Caption: ignore.
    } else if (line.startsWith('!') || line.startsWith('|')) {
      if (!current) startRow();
      const isHeader = line.startsWith('!');
      const parts = line.slice(1).split(isHeader ? /\s*!!\s*|\s*\|\|\s*/ : /\s*\|\|\s*/);
      const cells = parts.map(parseCell);
      if (current) {
        if (isHeader && current.cells.length === 0) current.header = true;
        current.cells.push(...cells);
      }
      lastCell = cells.at(-1);
    } else if (lastCell) {
      lastCell.text += `\n${line}`;
    }
  }
  return rows.filter((row) => row.cells.length > 0);
}

/**
 * Splits `attr="x" | content` from plain `content`. A leading pipe belongs to
 * an attribute block only when the text before it looks like attributes
 * (contains `=`, no link/template markup).
 */
function parseCell(raw: string): Cell {
  const pipe = raw.indexOf('|');
  const head = pipe === -1 ? '' : raw.slice(0, pipe);
  const hasAttributes = pipe !== -1 && head.includes('=') && !/\[\[|\{\{/.test(head);
  const attributes = hasAttributes ? head : '';
  const text = (hasAttributes ? raw.slice(pipe + 1) : raw).trim();
  return {
    text,
    rowspan: readSpan(attributes, 'rowspan'),
    colspan: readSpan(attributes, 'colspan'),
  };
}

function readSpan(attributes: string, name: 'rowspan' | 'colspan'): number {
  const match = new RegExp(`${name}\\s*=\\s*"?(\\d+)`).exec(attributes);
  const value = match?.[1] === undefined ? 1 : Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * Reduces cell wikitext to plain text. Lines are preserved (`<br>` becomes a
 * newline) because several columns hold numbered lists.
 */
export function cleanWikitext(raw: string): string {
  return stripMarkup(raw)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

function stripMarkup(raw: string): string {
  let text = raw
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[(?:ไฟล์|File|Image):[^\]]*\]\]/g, '')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/&nbsp;/g, ' ');
  // Templates may nest one level ({{a|{{b}}}}); loop until none remain.
  let previous: string;
  do {
    previous = text;
    text = text.replace(/\{\{[^{}]*\}\}/g, '');
  } while (text !== previous);
  return text
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:[^\s\]]*\s*([^\]]*)\]/g, '$1')
    .replace(/'{2,}/g, '');
}
