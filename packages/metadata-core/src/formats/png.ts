export interface PngDimensions {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  evidenceOffset: number;
}

const PNG_SIGNATURE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function detectPngDimensions(bytes: Uint8Array): PngDimensions | null {
  if (!matchesAt(bytes, 0, PNG_SIGNATURE) || bytes.length < 33) return null;

  const length = readU32BE(bytes, 8);
  if (length !== 13 || ascii(bytes, 12, 16) !== "IHDR") return null;

  const width = readU32BE(bytes, 16);
  const height = readU32BE(bytes, 20);
  const bitDepth = bytes[24] ?? 0;
  const colorType = bytes[25] ?? 0;

  if (width <= 0 || height <= 0) return null;

  return {
    width,
    height,
    bitDepth,
    colorType,
    evidenceOffset: 8,
  };
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

function matchesAt(
  bytes: Uint8Array,
  offset: number,
  expected: Uint8Array,
): boolean {
  if (offset + expected.length > bytes.length) return false;

  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected[index]) return false;
  }

  return true;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let value = "";
  for (let index = start; index < end; index += 1) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }
  return value;
}
