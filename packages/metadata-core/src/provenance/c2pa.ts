import type {
  C2paEmbedding,
  ImageFormat,
  ProvenanceInfo,
} from "../model/public.js";

type C2paInfo = ProvenanceInfo["c2pa"];

const C2PA_MANIFEST_STORE_UUID = Uint8Array.from([
  0x63, 0x32, 0x70, 0x61, 0x00, 0x11, 0x00, 0x10,
  0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71,
]);

const BMFF_C2PA_UUID = Uint8Array.from([
  0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0e, 0x48, 0x3c,
  0x92, 0x97, 0x58, 0x28, 0x87, 0x7e, 0xc4, 0x81,
]);

export function detectC2paPresence(
  bytes: Uint8Array,
  format: ImageFormat,
): C2paInfo {
  switch (format) {
    case "jpeg":
      return detectJpeg(bytes);
    case "png":
      return detectPng(bytes);
    case "webp":
      return detectWebP(bytes);
    case "tiff":
      return detectTiff(bytes);
    case "heic":
    case "heif":
    case "avif":
      return detectBmff(bytes);
  }
}

function detected(embedding: C2paEmbedding, evidenceOffset: number): C2paInfo {
  return {
    status: "detected",
    verification: "not_attempted",
    embedding,
    evidenceOffset,
  };
}

function notDetected(): C2paInfo {
  return {
    status: "not_detected",
    verification: "not_attempted",
    embedding: null,
    evidenceOffset: null,
  };
}

function malformed(): C2paInfo {
  return {
    status: "malformed",
    verification: "not_attempted",
    embedding: null,
    evidenceOffset: null,
  };
}

function detectJpeg(bytes: Uint8Array): C2paInfo {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return malformed();

  const app11Payloads: Uint8Array[] = [];
  const offsets: number[] = [];
  let offset = 2;

  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return malformed();
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return malformed();

    const marker = bytes[offset] ?? 0;
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return malformed();

    const length = readU16BE(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return malformed();

    const payloadStart = offset + 2;
    const payloadEnd = offset + length;

    if (marker === 0xeb) {
      app11Payloads.push(bytes.subarray(payloadStart, payloadEnd));
      offsets.push(payloadStart);
    }

    offset = payloadEnd;
  }

  for (let index = 0; index < app11Payloads.length; index += 1) {
    const local = indexOfBytes(app11Payloads[index]!, C2PA_MANIFEST_STORE_UUID);
    if (local >= 0) return detected("jpeg_app11", (offsets[index] ?? 0) + local);
  }

  if (app11Payloads.length > 1) {
    const combined = concat(app11Payloads);
    if (indexOfBytes(combined, C2PA_MANIFEST_STORE_UUID) >= 0) {
      return detected("jpeg_app11", offsets[0] ?? 0);
    }
  }

  return notDetected();
}

function detectPng(bytes: Uint8Array): C2paInfo {
  if (bytes.length < 8) return malformed();
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = readU32BE(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const end = dataOffset + length + 4;
    if (end > bytes.length) return malformed();

    const type = ascii(bytes, typeOffset, typeOffset + 4);
    if (type === "caBX") return detected("png_caBX", typeOffset);
    if (type === "IEND") return notDetected();

    offset = end;
  }

  return offset === bytes.length ? notDetected() : malformed();
}

function detectWebP(bytes: Uint8Array): C2paInfo {
  if (
    bytes.length < 12 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 12) !== "WEBP"
  ) {
    return malformed();
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, offset + 4);
    const size = readU32LE(bytes, offset + 4);
    const dataEnd = offset + 8 + size;
    if (dataEnd > bytes.length) return malformed();

    if (type === "C2PA") return detected("webp_C2PA", offset);

    offset = dataEnd + (size % 2);
  }

  return offset === bytes.length ? notDetected() : malformed();
}

function detectTiff(bytes: Uint8Array): C2paInfo {
  if (bytes.length < 8) return malformed();

  const little =
    bytes[0] === 0x49 && bytes[1] === 0x49
      ? true
      : bytes[0] === 0x4d && bytes[1] === 0x4d
        ? false
        : null;

  if (little === null) return malformed();

  const magic = readU16(bytes, 2, little);
  if (magic === 42) return detectClassicTiff(bytes, little);
  if (magic === 43) return detectBigTiff(bytes, little);
  return malformed();
}

function detectClassicTiff(bytes: Uint8Array, little: boolean): C2paInfo {
  let ifdOffset = readU32(bytes, 4, little);
  const visited = new Set<number>();

  for (let depth = 0; ifdOffset !== 0 && depth < 64; depth += 1) {
    if (visited.has(ifdOffset) || ifdOffset + 2 > bytes.length) return malformed();
    visited.add(ifdOffset);

    const count = readU16(bytes, ifdOffset, little);
    const entriesStart = ifdOffset + 2;
    const entriesEnd = entriesStart + count * 12;
    if (entriesEnd + 4 > bytes.length) return malformed();

    for (let index = 0; index < count; index += 1) {
      const entryOffset = entriesStart + index * 12;
      if (readU16(bytes, entryOffset, little) === 0xcd41) {
        return detected("tiff_tag_0xcd41", entryOffset);
      }
    }

    ifdOffset = readU32(bytes, entriesEnd, little);
  }

  return ifdOffset === 0 ? notDetected() : malformed();
}

function detectBigTiff(bytes: Uint8Array, little: boolean): C2paInfo {
  if (bytes.length < 16) return malformed();
  if (readU16(bytes, 4, little) !== 8 || readU16(bytes, 6, little) !== 0) {
    return malformed();
  }

  let ifdOffset = readU64(bytes, 8, little);
  const visited = new Set<number>();

  for (let depth = 0; ifdOffset !== 0 && depth < 64; depth += 1) {
    if (ifdOffset === null || visited.has(ifdOffset) || ifdOffset + 8 > bytes.length) {
      return malformed();
    }
    visited.add(ifdOffset);

    const count = readU64(bytes, ifdOffset, little);
    if (count === null || count > 100000) return malformed();

    const entriesStart = ifdOffset + 8;
    const entriesEnd = entriesStart + count * 20;
    if (entriesEnd + 8 > bytes.length) return malformed();

    for (let index = 0; index < count; index += 1) {
      const entryOffset = entriesStart + index * 20;
      if (readU16(bytes, entryOffset, little) === 0xcd41) {
        return detected("tiff_tag_0xcd41", entryOffset);
      }
    }

    ifdOffset = readU64(bytes, entriesEnd, little);
    if (ifdOffset === null) return malformed();
  }

  return ifdOffset === 0 ? notDetected() : malformed();
}

function detectBmff(bytes: Uint8Array): C2paInfo {
  let offset = 0;

  while (offset + 8 <= bytes.length) {
    const size32 = readU32BE(bytes, offset);
    const type = ascii(bytes, offset + 4, offset + 8);
    let headerSize = 8;
    let size = size32;

    if (size32 === 1) {
      if (offset + 16 > bytes.length) return malformed();
      const large = readU64BE(bytes, offset + 8);
      if (large === null) return malformed();
      size = large;
      headerSize = 16;
    } else if (size32 === 0) {
      size = bytes.length - offset;
    }

    if (size < headerSize || offset + size > bytes.length) return malformed();

    if (type === "uuid") {
      const uuidOffset = offset + headerSize;
      if (uuidOffset + 20 > offset + size) return malformed();

      if (matchesAt(bytes, uuidOffset, BMFF_C2PA_UUID)) {
        const purposeStart = uuidOffset + 16 + 4;
        const purposeEnd = findNull(bytes, purposeStart, offset + size);
        if (purposeEnd < 0) return malformed();

        const purpose = ascii(bytes, purposeStart, purposeEnd);
        if (purpose === "manifest" || purpose === "original" || purpose === "update") {
          return detected("bmff_uuid", offset);
        }
      }
    }

    offset += size;
  }

  return offset === bytes.length ? notDetected() : malformed();
}

function readU16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) * 0x1000000) +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) +
      ((bytes[offset + 1] ?? 0) << 8) +
      ((bytes[offset + 2] ?? 0) << 16) +
      ((bytes[offset + 3] ?? 0) * 0x1000000)) >>>
    0
  );
}

function readU16(bytes: Uint8Array, offset: number, little: boolean): number {
  return little
    ? (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)
    : readU16BE(bytes, offset);
}

function readU32(bytes: Uint8Array, offset: number, little: boolean): number {
  return little ? readU32LE(bytes, offset) : readU32BE(bytes, offset);
}

function readU64(bytes: Uint8Array, offset: number, little: boolean): number | null {
  if (offset + 8 > bytes.length) return null;

  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    const byteIndex = little ? offset + 7 - index : offset + index;
    value = (value << 8n) | BigInt(bytes[byteIndex] ?? 0);
  }

  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

function readU64BE(bytes: Uint8Array, offset: number): number | null {
  return readU64(bytes, offset, false);
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.length === 0 || haystack.length < needle.length) return -1;

  outer: for (let offset = 0; offset <= haystack.length - needle.length; offset += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[offset + index] !== needle[index]) continue outer;
    }
    return offset;
  }

  return -1;
}

function matchesAt(bytes: Uint8Array, offset: number, expected: Uint8Array): boolean {
  if (offset + expected.length > bytes.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected[index]) return false;
  }
  return true;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let value = "";
  for (let index = start; index < end; index += 1) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }
  return value;
}

function findNull(bytes: Uint8Array, start: number, end: number): number {
  for (let index = start; index < end; index += 1) {
    if (bytes[index] === 0) return index;
  }
  return -1;
}
