/**
 * Minimal ZIP reader: lists entries from the central directory and inflates
 * one on demand. Enough for a GTFS feed (stored or deflated files, no
 * encryption, no ZIP64). Node ships inflate but no archive reader.
 */

import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  localHeaderOffset: number;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

export function listZipEntries(archive: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(archive);
  const count = archive.readUInt16LE(eocd + 10);
  let offset = archive.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(offset) !== CENTRAL_FILE_HEADER) throw new Error(`Bad central directory entry at ${offset}`);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    entries.push({
      method: archive.readUInt16LE(offset + 10),
      compressedSize: archive.readUInt32LE(offset + 20),
      uncompressedSize: archive.readUInt32LE(offset + 24),
      localHeaderOffset: archive.readUInt32LE(offset + 42),
      name: archive.toString('utf8', offset + 46, offset + 46 + nameLength),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function readZipEntry(archive: Buffer, entry: ZipEntry): Buffer {
  const header = entry.localHeaderOffset;
  if (archive.readUInt32LE(header) !== LOCAL_FILE_HEADER) throw new Error(`Bad local header for ${entry.name}`);
  const nameLength = archive.readUInt16LE(header + 26);
  const extraLength = archive.readUInt16LE(header + 28);
  const start = header + 30 + nameLength + extraLength;
  const data = archive.subarray(start, start + entry.compressedSize);
  if (entry.method === METHOD_STORE) return data;
  if (entry.method === METHOD_DEFLATE) return inflateRawSync(data);
  throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
}

function findEndOfCentralDirectory(archive: Buffer): number {
  // The record is at the end, followed only by an optional comment (≤ 64 KiB).
  const floor = Math.max(0, archive.length - 22 - 0xffff);
  for (let offset = archive.length - 22; offset >= floor; offset -= 1) {
    if (archive.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error('Not a ZIP archive: end of central directory not found');
}
