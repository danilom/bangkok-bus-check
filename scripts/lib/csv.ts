/**
 * RFC 4180-style CSV parser for GTFS tables: quoted fields, doubled quotes,
 * CRLF or LF, optional BOM. Returns one object per row keyed by the header.
 */

export function parseCsv(text: string): Record<string, string>[] {
  const rows = splitRows(text.replace(/^﻿/, ''));
  const header = rows.shift();
  if (!header) return [];
  return rows
    .filter((row) => row.length > 1 || (row[0] ?? '') !== '')
    .map((row) => Object.fromEntries(header.map((column, index) => [column, row[index] ?? ''])));
}

function splitRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
