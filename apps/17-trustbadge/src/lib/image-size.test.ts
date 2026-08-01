/**
 * Image-header parsing tests.
 *
 * Dimensions are what make the widget's zero-CLS claim true, and they are read
 * from six bytes of a header — exactly the kind of code that silently returns
 * 0x0 and is never noticed until a merchant's product page jumps. Each case
 * builds a real, minimal header rather than mocking the parser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACCEPTED_PHOTO_TYPES, imageSize } from "@/lib/image-size";

function pngHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

/** SOI, an APP0 segment to skip over, then a SOF0 carrying the dimensions. */
function jpegHeader(width: number, height: number): Buffer {
  const app0 = Buffer.alloc(2 + 16);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(16, 2);
  app0.write("JFIF\0", 4, "ascii");

  const sof = Buffer.alloc(2 + 11);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(11, 2);
  sof.writeUInt8(8, 4); // precision
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof.writeUInt8(3, 9); // components

  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(8)]);
}

function webpLossyHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(34);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(26, 4);
  buf.write("WEBP", 8, "ascii");
  buf.write("VP8 ", 12, "ascii");
  buf.writeUInt32LE(14, 16);
  buf.writeUInt8(0x9d, 23);
  buf.writeUInt8(0x01, 24);
  buf.writeUInt8(0x2a, 25);
  buf.writeUInt16LE(width, 26);
  buf.writeUInt16LE(height, 28);
  return buf;
}

function webpExtendedHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(40);
  buf.write("RIFF", 0, "ascii");
  buf.write("WEBP", 8, "ascii");
  buf.write("VP8X", 12, "ascii");
  buf.writeUInt32LE(10, 16);
  buf.writeUIntLE(width - 1, 24, 3);
  buf.writeUIntLE(height - 1, 27, 3);
  return buf;
}

function gifHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(13);
  buf.write("GIF89a", 0, "ascii");
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

describe("imageSize", () => {
  it("reads a PNG IHDR", () => {
    assert.deepEqual(imageSize(pngHeader(1200, 1600)), {
      format: "png",
      width: 1200,
      height: 1600,
    });
  });

  it("reads a JPEG SOF0 past an APP0 segment", () => {
    assert.deepEqual(imageSize(jpegHeader(2048, 1365)), {
      format: "jpeg",
      width: 2048,
      height: 1365,
    });
  });

  it("does not confuse a JPEG's height and width", () => {
    // The SOF payload is height-then-width, which is the classic transposition.
    const info = imageSize(jpegHeader(800, 1200));
    assert.equal(info?.width, 800);
    assert.equal(info?.height, 1200);
  });

  it("reads lossy and extended WebP", () => {
    assert.deepEqual(imageSize(webpLossyHeader(640, 480)), {
      format: "webp",
      width: 640,
      height: 480,
    });
    assert.deepEqual(imageSize(webpExtendedHeader(1000, 750)), {
      format: "webp",
      width: 1000,
      height: 750,
    });
  });

  it("reads a GIF screen descriptor", () => {
    assert.deepEqual(imageSize(gifHeader(320, 240)), {
      format: "gif",
      width: 320,
      height: 240,
    });
  });

  it("rejects anything that is not an image", () => {
    assert.equal(imageSize(Buffer.from("<?php system($_GET[0]); ?>")), null);
    assert.equal(imageSize(Buffer.alloc(0)), null);
    assert.equal(imageSize(Buffer.alloc(64)), null);
    assert.equal(imageSize(Buffer.from("GIF", "ascii")), null);
  });

  it("rejects a truncated PNG rather than reporting 0x0", () => {
    assert.equal(imageSize(pngHeader(100, 100).subarray(0, 18)), null);
  });

  it("rejects a PNG whose first chunk is not IHDR", () => {
    const buf = pngHeader(100, 100);
    buf.write("cHRM", 12, "ascii");
    assert.equal(imageSize(buf), null);
  });

  it("rejects zero dimensions", () => {
    assert.equal(imageSize(pngHeader(0, 100)), null);
    assert.equal(imageSize(pngHeader(100, 0)), null);
  });

  it("rejects a decompression bomb's declared size", () => {
    assert.equal(imageSize(pngHeader(65_535, 65_535)), null);
  });

  it("accepts only the three photo types the review form offers", () => {
    assert.deepEqual(Object.keys(ACCEPTED_PHOTO_TYPES).sort(), [
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    // GIF parses, but is not an accepted upload — animated photo reviews are not
    // a feature, and an accidental 30MB GIF on a storefront is a real cost.
    assert.equal(ACCEPTED_PHOTO_TYPES["image/gif"], undefined);
  });
});
