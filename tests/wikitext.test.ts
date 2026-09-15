import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cleanWikitext, parseSections, parseTables } from '../scripts/lib/wikitext.ts';

describe('parseTables', () => {
  it('expands rowspan so hanging cells reappear in later rows', () => {
    const table = parseTables(`{|
|-
! A !! B !! C
|-
| a1 || rowspan="2" | shared || c1
|-
| a2 || c2
|}`);
    assert.deepEqual(table[0]?.rows, [
      ['a1', 'shared', 'c1'],
      ['a2', 'shared', 'c2'],
    ]);
  });

  it('expands colspan in header and body rows so column indexes line up', () => {
    const table = parseTables(`{|
|-
! colspan="2" | Number !! Old
|-
| colspan="2" style="color:red" | 1 - 1 || 29
|}`);
    assert.deepEqual(table[0]?.headers, ['Number', 'Number', 'Old']);
    assert.deepEqual(table[0]?.rows, [['1 - 1', '1 - 1', '29']]);
  });

  it('treats a pipe inside a wiki link as content, not an attribute separator', () => {
    const table = parseTables(`{|
|-
! A
|-
|[[องค์การขนส่งมวลชนกรุงเทพ|ขสมก.]]
|}`);
    assert.equal(table[0]?.rows[0]?.[0], '[[องค์การขนส่งมวลชนกรุงเทพ|ขสมก.]]');
  });

  it('appends continuation lines to the previous cell', () => {
    const table = parseTables(`{|
|-
! A !! B
|-
|1.first
2.second
|b
|}`);
    assert.deepEqual(table[0]?.rows, [['1.first\n2.second', 'b']]);
  });

  it('places cells after a rowspan gap in the right column', () => {
    const table = parseTables(`{|
|-
! A !! B !! C !! D
|-
| a1 || rowspan="2" | b || rowspan="2" | c || d1
|-
| a2 || d2
|}`);
    assert.deepEqual(table[0]?.rows[1], ['a2', 'b', 'c', 'd2']);
  });
});

describe('parseSections', () => {
  it('returns heading level and title with markup stripped', () => {
    const sections = parseSections('== Top ==\ntext\n=== Sub <ref>x</ref> ===\n');
    assert.deepEqual(sections, [
      { level: 2, title: 'Top', line: 1 },
      { level: 3, title: 'Sub', line: 3 },
    ]);
  });
});

describe('cleanWikitext', () => {
  it('removes templates, refs, files and link targets but keeps link labels', () => {
    const cleaned = cleanWikitext('{{Rint|bus}} [[สถานีขนส่ง|หมอชิต 2]] {{rint|wheelchair|1}}<ref>src</ref> [[ไฟล์:x.svg|16px]]');
    assert.equal(cleaned, 'หมอชิต 2');
  });

  it('turns <br> into line breaks and drops zero-width characters', () => {
    assert.equal(cleanWikitext('บจก.บ้านทองบัส<br>บจก.รูธ 45'), 'บจก.บ้านทองบัส\nบจก.รูธ 45');
    assert.equal(cleanWikitext('120\u200B'), '120');
  });
});
