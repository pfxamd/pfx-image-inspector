import exifr from "exifr";
import type { ImageFormat, InspectionWarning } from "../../model/public.js";
import type {
  AdapterExtractionResult,
  MetadataAdapter,
  MetadataCapabilities,
  SourceBlockKey,
} from "../adapter.js";

const SUPPORTED_FORMATS = new Set<ImageFormat>([
  "jpeg",
  "png",
  "tiff",
  "heic",
  "heif",
  "avif",
]);

const CAPABILITIES: Record<Exclude<ImageFormat, "webp">, MetadataCapabilities> = {
  jpeg: { exif: true, xmp: true, iptc: true, icc: true, jfif: true },
  tiff: { exif: true, xmp: true, iptc: true, icc: true, jfif: false },
  png: { exif: true, xmp: true, iptc: false, icc: false, jfif: false },
  heic: { exif: true, xmp: false, iptc: false, icc: true, jfif: false },
  heif: { exif: true, xmp: false, iptc: false, icc: true, jfif: false },
  avif: { exif: true, xmp: false, iptc: false, icc: true, jfif: false },
};

export const exifrAdapter: MetadataAdapter = {
  id: "exifr",

  supportsFormat(format) {
    return SUPPORTED_FORMATS.has(format);
  },

  async extract(context): Promise<AdapterExtractionResult> {
    const capabilities = getCapabilities(context.format);

    try {
      const parsed: unknown = await exifr.parse(context.bytes, {
        tiff: capabilities.exif,
        exif: capabilities.exif,
        gps: capabilities.exif,
        xmp: capabilities.xmp,
        iptc: capabilities.iptc,
        icc: capabilities.icc,
        jfif: capabilities.jfif,
        ihdr: context.format === "png",
        makerNote: false,
        userComment: true,
        sanitize: true,
        mergeOutput: false,
      });

      const raw = toRecord(parsed);

      return {
        adapterId: "exifr",
        state: "success",
        capabilities,
        sources: pickSources(raw),
        raw,
        warnings: [],
      };
    } catch (error) {
      const warning: InspectionWarning = {
        code: "EXIFR_PARSE_FAILED",
        message:
          error instanceof Error ? error.message : "exifr could not parse image metadata.",
      };

      return {
        adapterId: "exifr",
        state: "failed",
        capabilities,
        sources: {},
        raw: {},
        warnings: [warning],
      };
    }
  },
};

function getCapabilities(format: ImageFormat): MetadataCapabilities {
  if (format === "webp") {
    return { exif: false, xmp: false, iptc: false, icc: false, jfif: false };
  }

  return CAPABILITIES[format];
}

function pickSources(
  raw: Record<string, unknown>,
): Partial<Record<SourceBlockKey, Record<string, unknown>>> {
  const pairs: Array<[SourceBlockKey, string]> = [
    ["image", "ifd0"],
    ["photo", "exif"],
    ["gps", "gps"],
    ["xmp", "xmp"],
    ["iptc", "iptc"],
    ["icc", "icc"],
    ["jfif", "jfif"],
    ["header", "ihdr"],
  ];

  const sources: Partial<Record<SourceBlockKey, Record<string, unknown>>> = {};

  for (const [target, source] of pairs) {
    const entries = toEntries(raw[source]);
    if (Object.keys(entries).length > 0) sources[target] = entries;
  }

  return sources;
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function toEntries(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (value === undefined || value === null) return {};
  return { value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
