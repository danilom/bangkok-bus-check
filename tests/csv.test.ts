import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCsv } from '../scripts/lib/csv.ts';

describe('parseCsv', () => {
  it('keys rows by the header and handles quoted fields with commas', () => {
    const rows = parseCsv('a,b\n"x, y",2\n');
    assert.deepEqual(rows, [{ a: 'x, y', b: '2' }]);
  });

  it('unescapes doubled quotes and accepts CRLF and a BOM', () => {
    const rows = parseCsv('﻿name,note\r\n"He said ""hi""",ok\r\n');
    assert.deepEqual(rows, [{ name: 'He said "hi"', note: 'ok' }]);
  });

  it('keeps Thai text and semicolons intact', () => {
    const rows = parseCsv('stop_name\n"ท่ารถสะพานพุทธ;Saphan Phut Bus Station"\n');
    assert.equal(rows[0]?.['stop_name'], 'ท่ารถสะพานพุทธ;Saphan Phut Bus Station');
  });

  it('fills missing trailing fields with empty strings and skips blank lines', () => {
    const rows = parseCsv('a,b,c\n1,2\n\n');
    assert.deepEqual(rows, [{ a: '1', b: '2', c: '' }]);
  });
});
