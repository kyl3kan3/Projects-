import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";
import { createZip, crc32, dosDateTime } from "./zip";

/** Read the archive back the way a ZIP reader would: from the central directory. */
function readZip(archive: Uint8Array): { path: string; data: Buffer }[] {
  const buf = Buffer.from(archive);
  const eocdOffset = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocdOffset >= 0, "no end-of-central-directory record");
  const count = buf.readUInt16LE(eocdOffset + 10);
  const cdSize = buf.readUInt32LE(eocdOffset + 12);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  assert.equal(cdOffset + cdSize, eocdOffset, "central directory does not abut the EOCD");

  const entries: { path: string; data: Buffer }[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, "bad central header signature");
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const localOffset = buf.readUInt32LE(p + 42);
    const path = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");

    assert.equal(buf.readUInt32LE(localOffset), 0x04034b50, "bad local header signature");
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const payload = buf.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(payload) : Buffer.from(payload);

    assert.equal(data.byteLength, uncompressedSize, `${path}: size mismatch`);
    assert.equal(crc32(new Uint8Array(data)), crc, `${path}: CRC mismatch`);
    entries.push({ path, data });
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return entries;
}

test("crc32 matches the well-known check value", () => {
  // The ZIP/PNG CRC-32 of "123456789" is 0xCBF43926.
  assert.equal(crc32(new Uint8Array(Buffer.from("123456789"))), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test("dosDateTime encodes the 1980 epoch and 2-second resolution", () => {
  const { time, date } = dosDateTime(new Date("2026-03-12T14:35:47Z"));
  assert.equal((date >> 9) + 1980, 2026);
  assert.equal((date >> 5) & 0x0f, 3);
  assert.equal(date & 0x1f, 12);
  assert.equal(time >> 11, 14);
  assert.equal((time >> 5) & 0x3f, 35);
  assert.equal((time & 0x1f) * 2, 46);
  // Anything before 1980 is clamped rather than written as a negative year.
  assert.ok(dosDateTime(new Date("1970-01-01T00:00:00Z")).date >= 0);
});

test("a close-package-shaped archive round-trips every entry", () => {
  const csv = "Date,Description,Amount\r\n03/12/2026,Home Depot,-79.08\r\n".repeat(40);
  const image = new Uint8Array(2048);
  for (let i = 0; i < image.length; i++) image[i] = (i * 7 + 13) % 251;

  const archive = createZip([
    { path: "ledgerlens-2026-03-summary.pdf", data: new Uint8Array(Buffer.from("%PDF-1.7\n%%EOF\n")) },
    { path: "ledgerlens-2026-03-quickbooks.csv", data: new Uint8Array(Buffer.from(csv)) },
    { path: "sources/2026-03-12-home-depot-9f3a1c2b.jpg", data: image },
    { path: "README.txt", data: new Uint8Array(Buffer.from("Prepared with LedgerLens.\n")) },
  ]);

  const entries = readZip(archive);
  assert.deepEqual(entries.map((e) => e.path), [
    "ledgerlens-2026-03-summary.pdf",
    "ledgerlens-2026-03-quickbooks.csv",
    "sources/2026-03-12-home-depot-9f3a1c2b.jpg",
    "README.txt",
  ]);
  assert.equal(entries[1].data.toString("utf8"), csv);
  assert.deepEqual(new Uint8Array(entries[2].data), image);
});

test("repetitive text is actually compressed, and a zero-byte entry is legal", () => {
  const text = new Uint8Array(Buffer.from("total 79.08\n".repeat(500)));
  const archive = createZip([
    { path: "big.txt", data: text },
    { path: "empty.txt", data: new Uint8Array(0) },
  ]);
  assert.ok(archive.byteLength < text.byteLength / 2, "deflate should have engaged");
  const entries = readZip(archive);
  assert.equal(entries[0].data.byteLength, text.byteLength);
  assert.equal(entries[1].data.byteLength, 0);
});

test("a UTF-8 filename survives the round trip", () => {
  const entries = readZip(
    createZip([{ path: "sources/2026-03-12-café-münchen-abcd1234.jpg", data: new Uint8Array([1, 2, 3]) }]),
  );
  assert.equal(entries[0].path, "sources/2026-03-12-café-münchen-abcd1234.jpg");
});

test("an empty archive is still a readable ZIP", () => {
  assert.deepEqual(readZip(createZip([])), []);
});
