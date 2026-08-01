/**
 * Intrinsic image dimensions, read from the file header.
 *
 * The widget's zero-CLS promise depends on every `<img>` carrying real `width`
 * and `height` attributes, so dimensions have to be known at upload time. A
 * decoder would be the obvious way to get them and is the wrong dependency: it
 * would put an image codec in a serverless function to read six bytes.
 *
 * This reads the header only. It also doubles as the format check — a file whose
 * header we cannot parse is not an image we are willing to serve, whatever its
 * declared content type says.
 */

export type ImageFormat = "png" | "jpeg" | "webp" | "gif";

export interface ImageInfo {
  format: ImageFormat;
  width: number;
  height: number;
}

/** JPEG start-of-frame markers. SOF0/1/2/3/5/6/7/9/10/11/13/14/15 carry size. */
const JPEG_SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function ascii(buf: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(buf[offset + i] ?? 0);
  return out;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) =>
  ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

function png(b: Uint8Array): ImageInfo | null {
  if (b.length < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((byte, i) => b[i] === byte)) return null;
  // The first chunk must be IHDR; anything else is not a conformant PNG.
  if (ascii(b, 12, 4) !== "IHDR") return null;
  return { format: "png", width: u32be(b, 16), height: u32be(b, 20) };
}

function jpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++; // resynchronise rather than give up: some encoders pad with fill bytes
      continue;
    }
    const marker = b[i + 1];
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const length = u16be(b, i + 2);
    if (length < 2) return null;
    if (JPEG_SOF.has(marker)) {
      return { format: "jpeg", height: u16be(b, i + 5), width: u16be(b, i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

function webp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30) return null;
  if (ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const chunk = ascii(b, 12, 4);

  if (chunk === "VP8 ") {
    // Lossy: 3-byte frame tag, 3-byte sync code, then 14-bit dimensions.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { format: "webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    // Lossless: 1 signature byte, then 14 bits width and 14 bits height, minus one.
    if (b[20] !== 0x2f) return null;
    const bits = u32be(b, 21);
    // The field is little-endian bit-packed, so read from the low end.
    const packed = ((bits >>> 24) | (((bits >>> 16) & 0xff) << 8) | (((bits >>> 8) & 0xff) << 16) | ((bits & 0xff) << 24)) >>> 0;
    return {
      format: "webp",
      width: (packed & 0x3fff) + 1,
      height: ((packed >>> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === "VP8X") {
    // Extended: 24-bit canvas dimensions minus one, at offset 24.
    return { format: "webp", width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  }
  return null;
}

function gif(b: Uint8Array): ImageInfo | null {
  if (b.length < 10) return null;
  if (ascii(b, 0, 6) !== "GIF87a" && ascii(b, 0, 6) !== "GIF89a") return null;
  return { format: "gif", width: u16le(b, 6), height: u16le(b, 8) };
}

/**
 * Read dimensions from an image header. Returns null when the bytes are not a
 * format we recognise, or when the parsed dimensions are impossible — a 0-wide
 * image would make the widget's aspect-ratio reservation collapse.
 */
export function imageSize(bytes: Uint8Array | Buffer): ImageInfo | null {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const info = png(b) ?? jpeg(b) ?? webp(b) ?? gif(b);
  if (!info) return null;
  if (!Number.isFinite(info.width) || !Number.isFinite(info.height)) return null;
  if (info.width < 1 || info.height < 1) return null;
  // 20,000px in either direction is not a product photo; it is a decompression bomb.
  if (info.width > 20_000 || info.height > 20_000) return null;
  return info;
}

/** The content types the review form accepts, mapped to their expected format. */
export const ACCEPTED_PHOTO_TYPES: Record<string, ImageFormat> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
};
