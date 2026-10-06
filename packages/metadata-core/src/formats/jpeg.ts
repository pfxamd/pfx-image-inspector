export interface JpegDimensions {
  width: number;
  height: number;
  precision: number;
  evidenceOffset: number;
}

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

export function detectJpegDimensions(bytes: Uint8Array): JpegDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset + 1 < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;

    const marker = bytes[offset] ?? 0;
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) return null;

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (offset + 2 > bytes.length) return null;
    const length = readU16BE(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return null;

    if (SOF_MARKERS.has(marker)) {
      if (length < 8) return null;

      const precision = bytes[offset + 2] ?? 0;
      const height = readU16BE(bytes, offset + 3);
      const width = readU16BE(bytes, offset + 5);

      if (width <= 0 || height <= 0) return null;

      return {
        width,
        height,
        precision,
        evidenceOffset: offset - 2,
      };
    }

    offset += length;
  }

  return null;
}

function readU16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}
