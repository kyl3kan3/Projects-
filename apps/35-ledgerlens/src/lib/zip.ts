/**
 * A minimal ZIP writer.
 *
 * The close package is a ZIP of a PDF, three CSVs, and every source image. That is
 * the whole requirement, and it is about eighty lines of well-specified binary
 * format (PKWARE APPNOTE 6.3.3, sections 4.3.7, 4.3.12, 4.3.16) using nothing but
 * `node:zlib`. Pulling in an archiver dependency to write five entries would add a
 * transitive tree to a financial-records path for no benefit.
 *
 * Deliberate simplifications, all legal:
 *  - no Zip64 (a close package is megabytes, not gigabytes; entries over 4 GB throw);
 *  - no encryption, no multi-disk, no data descriptors;
 *  - deflate for text, stored for entries that do not compress.
 */

import { deflateRawSync } from "node:zlib";

export interface ZipEntry {
  /** Forward-slash path inside the archive. */
  path: string;
  data: Uint8Array;
  /** Defaults to now. Written as the DOS date/time pair. */
  modified?: Date;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date/time: seconds have 2-second resolution, and the epoch is 1980. */
export function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const VERSION = 20; // 2.0 — the minimum that supports deflate.

export function createZip(entries: ZipEntry[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path.replace(/\\/g, "/"), "utf8");
    const raw = Buffer.from(entry.data);
    if (raw.byteLength > 0xffffffff) {
      throw new Error(`Entry too large for a non-Zip64 archive: ${entry.path}`);
    }
    const deflated = raw.byteLength > 0 ? deflateRawSync(raw, { level: 6 }) : Buffer.alloc(0);
    const useDeflate = deflated.byteLength > 0 && deflated.byteLength < raw.byteLength;
    const payload = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    const { time, date } = dosDateTime(entry.modified ?? new Date());
    // Bit 11: the filename is UTF-8. Cheap, and it is what keeps a vendor name with
    // an accent readable when the accountant opens the archive on Windows.
    const flags = 0x0800;

    const local = Buffer.alloc(30 + name.byteLength);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.byteLength, 18);
    local.writeUInt32LE(raw.byteLength, 22);
    local.writeUInt16LE(name.byteLength, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    locals.push(local, payload);

    const central = Buffer.alloc(46 + name.byteLength);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE(VERSION, 4);
    central.writeUInt16LE(VERSION, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.byteLength, 20);
    central.writeUInt32LE(raw.byteLength, 24);
    central.writeUInt16LE(name.byteLength, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);

    offset += local.byteLength + payload.byteLength;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.byteLength, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return new Uint8Array(Buffer.concat([...locals, centralBuf, eocd]));
}
