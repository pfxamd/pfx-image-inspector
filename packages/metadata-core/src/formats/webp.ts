import type { InspectionWarning } from "../model/public.js";

export interface WebPChunk {
  fourCC: string;
  offset: number;
  dataOffset: number;
  size: number;
  data: Uint8Array;
}

export interface WebPFeatureFlags {
  icc: boolean;
  alpha: boolean;
  exif: boolean;
  xmp: boolean;
  animation: boolean;
}

export interface ParsedWebP {
  chunks: WebPChunk[];
  width: number | null;
  height: number | null;
  bitDepth: 8;
  flags: WebPFeatureFlags | null;
  warnings: InspectionWarning[];
}

export function parseWebP(bytes: Uint8Array): ParsedWebP {
  if (
    bytes.length < 12 ||
    ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 12) !== "WEBP"
  ) {
    throw new Error("Invalid WebP RIFF header.");
  }

  const declaredEnd = readU32LE(bytes, 4) + 8;
  if (declaredEnd < 12) throw new Error("Invalid WebP RIFF size.");
  if (declaredEnd > bytes.length) throw new Error("Truncated WebP RIFF container.");

  const warnings: InspectionWarning[] = [];
  if (declaredEnd < bytes.length) {
    warnings.push({
      code: "WEBP_TRAILING_DATA",
      message: "The WebP file contains trailing data beyond the declared RIFF size.",
    });
  }

  const chunks: WebPChunk[] = [];
  let offset = 12;

  while (offset < declaredEnd) {
    if (offset + 8 > declaredEnd) throw new Error("Truncated WebP chunk header.");

    const fourCC = ascii(bytes, offset, offset + 4);
    const size = readU32LE(bytes, offset + 4);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + size;
    const paddedEnd = dataEnd + (size & 1);

    if (dataEnd > declaredEnd || paddedEnd > declaredEnd) {
      throw new Error(`WebP chunk ${fourCC} exceeds the RIFF boundary.`);
    }

    if ((size & 1) === 1 && bytes[dataEnd] !== 0) {
      warnings.push({
        code: "WEBP_NONZERO_PADDING",
        message: `WebP chunk ${fourCC} uses a non-zero RIFF padding byte.`,
      });
    }

    chunks.push({
      fourCC,
      offset,
      dataOffset,
      size,
      data: bytes.subarray(dataOffset, dataEnd),
    });

    offset = paddedEnd;
  }

  const vp8x = firstChunk(chunks, "VP8X");
  const dimensions = vp8x
    ? parseVp8x(vp8x.data, warnings)
    : parseSimpleDimensions(chunks, warnings);

  const flags = vp8x ? parseFeatureFlags(vp8x.data) : null;
  checkDuplicates(chunks, warnings);
  checkFeatureConsistency(chunks, flags, warnings);

  return {
    chunks,
    width: dimensions.width,
    height: dimensions.height,
    bitDepth: 8,
    flags,
    warnings,
  };
}

export function firstChunk(
  chunks: readonly WebPChunk[],
  fourCC: string,
): WebPChunk | null {
  return chunks.find((chunk) => chunk.fourCC === fourCC) ?? null;
}

function parseVp8x(
  data: Uint8Array,
  warnings: InspectionWarning[],
): { width: number | null; height: number | null } {
  if (data.length < 10) {
    warnings.push({
      code: "WEBP_VP8X_TRUNCATED",
      message: "The VP8X chunk is shorter than the required 10-byte payload.",
    });
    return { width: null, height: null };
  }

  if ((data[0]! & 0xc1) !== 0 || data[1] !== 0 || data[2] !== 0 || data[3] !== 0) {
    warnings.push({
      code: "WEBP_VP8X_RESERVED_BITS",
      message: "Reserved VP8X feature bits are non-zero.",
    });
  }

  return {
    width: readU24LE(data, 4) + 1,
    height: readU24LE(data, 7) + 1,
  };
}

function parseFeatureFlags(data: Uint8Array): WebPFeatureFlags | null {
  if (data.length < 1) return null;
  const flags = data[0] ?? 0;

  return {
    icc: (flags & 0x20) !== 0,
    alpha: (flags & 0x10) !== 0,
    exif: (flags & 0x08) !== 0,
    xmp: (flags & 0x04) !== 0,
    animation: (flags & 0x02) !== 0,
  };
}

function parseSimpleDimensions(
  chunks: readonly WebPChunk[],
  warnings: InspectionWarning[],
): { width: number | null; height: number | null } {
  const vp8l = firstChunk(chunks, "VP8L");
  if (vp8l) return parseVp8lDimensions(vp8l.data, warnings);

  const vp8 = firstChunk(chunks, "VP8 ");
  if (vp8) return parseVp8Dimensions(vp8.data, warnings);

  warnings.push({
    code: "WEBP_IMAGE_DATA_NOT_FOUND",
    message: "No VP8X, VP8L, or VP8 image-dimension source was found.",
  });
  return { width: null, height: null };
}

function parseVp8lDimensions(
  data: Uint8Array,
  warnings: InspectionWarning[],
): { width: number | null; height: number | null } {
  if (data.length < 5 || data[0] !== 0x2f) {
    warnings.push({
      code: "WEBP_VP8L_HEADER_INVALID",
      message: "The VP8L bitstream header is missing or invalid.",
    });
    return { width: null, height: null };
  }

  const bits = readU32LE(data, 1);
  return {
    width: (bits & 0x3fff) + 1,
    height: ((bits >>> 14) & 0x3fff) + 1,
  };
}

function parseVp8Dimensions(
  data: Uint8Array,
  warnings: InspectionWarning[],
): { width: number | null; height: number | null } {
  if (
    data.length < 10 ||
    data[3] !== 0x9d ||
    data[4] !== 0x01 ||
    data[5] !== 0x2a
  ) {
    warnings.push({
      code: "WEBP_VP8_HEADER_INVALID",
      message: "The VP8 key-frame header is missing or invalid.",
    });
    return { width: null, height: null };
  }

  return {
    width: ((data[6] ?? 0) | ((data[7] ?? 0) << 8)) & 0x3fff,
    height: ((data[8] ?? 0) | ((data[9] ?? 0) << 8)) & 0x3fff,
  };
}

function checkDuplicates(
  chunks: readonly WebPChunk[],
  warnings: InspectionWarning[],
): void {
  for (const fourCC of ["VP8X", "ICCP", "EXIF", "XMP "]) {
    const count = chunks.filter((chunk) => chunk.fourCC === fourCC).length;
    if (count > 1) {
      warnings.push({
        code: "WEBP_DUPLICATE_CHUNK",
        message: `WebP contains ${count} ${fourCC} chunks; only the first is used.`,
      });
    }
  }
}

function checkFeatureConsistency(
  chunks: readonly WebPChunk[],
  flags: WebPFeatureFlags | null,
  warnings: InspectionWarning[],
): void {
  const actual = {
    icc: firstChunk(chunks, "ICCP") !== null,
    exif: firstChunk(chunks, "EXIF") !== null,
    xmp: firstChunk(chunks, "XMP ") !== null,
  };

  if (flags === null) {
    if (actual.icc || actual.exif || actual.xmp) {
      warnings.push({
        code: "WEBP_METADATA_WITHOUT_VP8X",
        message: "Metadata chunks are present without a VP8X feature header.",
      });
    }
    return;
  }

  for (const key of ["icc", "exif", "xmp"] as const) {
    if (flags[key] !== actual[key]) {
      warnings.push({
        code: "WEBP_FEATURE_FLAG_MISMATCH",
        message: `VP8X ${key.toUpperCase()} flag does not match the corresponding metadata chunk presence.`,
      });
    }
  }
}

function readU24LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
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

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let value = "";
  for (let index = start; index < end; index += 1) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }
  return value;
}
