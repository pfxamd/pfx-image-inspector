export interface IsoBmffDimensions {
  width: number;
  height: number;
  evidenceOffset: number;
}

const CONTAINER_BOXES = new Set([
  "moov",
  "trak",
  "mdia",
  "minf",
  "stbl",
  "dinf",
  "edts",
  "udta",
  "meta",
  "iprp",
  "ipco",
]);

export function detectIsoBmffDimensions(
  bytes: Uint8Array,
): IsoBmffDimensions | null {
  const candidates: IsoBmffDimensions[] = [];
  walkBoxes(bytes, 0, bytes.length, 0, candidates);

  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) =>
    current.width * current.height > best.width * best.height ? current : best,
  );
}

function walkBoxes(
  bytes: Uint8Array,
  start: number,
  end: number,
  depth: number,
  output: IsoBmffDimensions[],
): void {
  if (depth > 12 || start < 0 || end > bytes.length || start >= end) return;

  let offset = start;

  while (offset + 8 <= end) {
    const size32 = readU32BE(bytes, offset);
    const type = ascii(bytes, offset + 4, offset + 8);

    let headerSize = 8;
    let size = size32;

    if (size32 === 1) {
      if (offset + 16 > end) return;
      const largeSize = readU64BE(bytes, offset + 8);
      if (largeSize === null) return;
      size = largeSize;
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }

    if (size < headerSize || offset + size > end) return;

    const dataStart = offset + headerSize;
    const boxEnd = offset + size;

    if (type === "ispe") {
      const fullBoxData = dataStart + 4;
      if (fullBoxData + 8 <= boxEnd) {
        const width = readU32BE(bytes, fullBoxData);
        const height = readU32BE(bytes, fullBoxData + 4);

        if (isSaneDimension(width) && isSaneDimension(height)) {
          output.push({
            width,
            height,
            evidenceOffset: offset,
          });
        }
      }
    } else if (CONTAINER_BOXES.has(type)) {
      const childStart = type === "meta" ? dataStart + 4 : dataStart;
      if (childStart < boxEnd) {
        walkBoxes(bytes, childStart, boxEnd, depth + 1, output);
      }
    }

    offset = boxEnd;
  }
}

function isSaneDimension(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 1_000_000;
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

function readU64BE(bytes: Uint8Array, offset: number): number | null {
  if (offset + 8 > bytes.length) return null;

  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    value = (value << 8n) | BigInt(bytes[offset + index] ?? 0);
  }

  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let value = "";
  for (let index = start; index < end; index += 1) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }
  return value;
}
