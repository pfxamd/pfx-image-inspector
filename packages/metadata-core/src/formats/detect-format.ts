import { INSPECTION_ERROR_CODES } from "../errors/error-codes.js";
import { InspectionError } from "../errors/inspection-error.js";
import type { ImageFormat } from "../model/public.js";

export interface DetectedFormat {
  format: ImageFormat;
  mime: string;
}

const JPEG = [0xff, 0xd8] as const;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
};

const AVIF_BRANDS = new Set(["avif", "avis"]);
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx"]);
const HEIF_BRANDS = new Set(["heif", "mif1", "msf1", "heim", "heis", "hevm", "hevs"]);

export function detectFormat(bytes: Uint8Array): DetectedFormat {
  let format: ImageFormat | null = null;

  if (startsWith(bytes, JPEG)) {
    format = "jpeg";
  } else if (startsWith(bytes, PNG)) {
    format = "png";
  } else if (isWebP(bytes)) {
    format = "webp";
  } else if (isTiff(bytes)) {
    format = "tiff";
  } else {
    const isoBmff = detectIsoBmffImage(bytes);
    if (isoBmff !== null) return isoBmff;
  }

  if (format === null) {
    throw new InspectionError(
      INSPECTION_ERROR_CODES.UNSUPPORTED_FORMAT,
      "The input is not a supported image format.",
    );
  }

  return { format, mime: MIME_BY_FORMAT[format] };
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.byteLength < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function isWebP(bytes: Uint8Array): boolean {
  return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
}

function isTiff(bytes: Uint8Array): boolean {
  const littleClassic =
    bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00;
  const bigClassic =
    bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a;
  const littleBigTiff =
    bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2b && bytes[3] === 0x00;
  const bigBigTiff =
    bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2b;
  return littleClassic || bigClassic || littleBigTiff || bigBigTiff;
}

function detectIsoBmffImage(bytes: Uint8Array): DetectedFormat | null {
  if (bytes.byteLength < 12 || ascii(bytes, 4, 8) !== "ftyp") return null;

  const majorBrand = ascii(bytes, 8, 12);
  const brands = new Set<string>([majorBrand]);
  const limit = Math.min(bytes.byteLength, 64);

  for (let offset = 16; offset + 4 <= limit; offset += 4) {
    brands.add(ascii(bytes, offset, offset + 4));
  }

  if (hasAny(brands, AVIF_BRANDS)) {
    return {
      format: "avif",
      mime: isoBmffMime(majorBrand, "avif"),
    };
  }

  if (hasAny(brands, HEIC_BRANDS)) {
    return {
      format: "heic",
      mime: isoBmffMime(majorBrand, "heic"),
    };
  }

  if (hasAny(brands, HEIF_BRANDS)) {
    return {
      format: "heif",
      mime: isoBmffMime(majorBrand, "heif"),
    };
  }

  return null;
}

function isoBmffMime(
  majorBrand: string,
  format: "avif" | "heic" | "heif",
): string {
  if (majorBrand === "avis") return "image/avif-sequence";
  if (majorBrand === "avif") return "image/avif";

  if (majorBrand === "hevc" || majorBrand === "hevx") {
    return "image/heic-sequence";
  }
  if (majorBrand === "heic" || majorBrand === "heix") {
    return "image/heic";
  }

  if (
    majorBrand === "msf1" ||
    majorBrand === "hevs" ||
    majorBrand === "hevm"
  ) {
    return "image/heif-sequence";
  }
  if (
    majorBrand === "mif1" ||
    majorBrand === "heif" ||
    majorBrand === "heim" ||
    majorBrand === "heis"
  ) {
    return "image/heif";
  }

  return MIME_BY_FORMAT[format];
}

function hasAny(values: Set<string>, candidates: Set<string>): boolean {
  for (const candidate of candidates) {
    if (values.has(candidate)) return true;
  }
  return false;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  if (end > bytes.byteLength) return "";
  let value = "";
  for (let index = start; index < end; index += 1) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }
  return value;
}
