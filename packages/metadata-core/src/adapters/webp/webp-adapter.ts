import exifr from "exifr";
import { firstChunk, parseWebP } from "../../formats/webp.js";
import { parseIccProfile } from "../../parsers/icc.js";
import { parseXmpPacket } from "../../parsers/xmp.js";
import type {
  AdapterExtractionResult,
  AdapterState,
  MetadataAdapter,
  MetadataBlockKey,
  MetadataCapabilities,
  SourceBlockKey,
} from "../adapter.js";

const CAPABILITIES: MetadataCapabilities = {
  exif: true,
  xmp: true,
  iptc: false,
  icc: true,
  jfif: false,
};

export const webpAdapter: MetadataAdapter = {
  id: "webp-native",

  supportsFormat(format) {
    return format === "webp";
  },

  async extract(context): Promise<AdapterExtractionResult> {
    const blockStates: Partial<Record<MetadataBlockKey, AdapterState>> = {
      exif: "success",
      xmp: "success",
      icc: "success",
    };

    try {
      const container = parseWebP(context.bytes);
      const warnings = [...container.warnings];
      const sources: Partial<
        Record<SourceBlockKey, Record<string, unknown>>
      > = {
        header: {
          ImageWidth: container.width,
          ImageHeight: container.height,
          BitDepth: container.bitDepth,
        },
      };

      const raw: Record<string, unknown> = {
        container: {
          chunks: container.chunks.map((chunk) => ({
            fourCC: chunk.fourCC,
            offset: chunk.offset,
            size: chunk.size,
          })),
          flags: container.flags,
        },
      };

      const exifChunk = firstChunk(container.chunks, "EXIF");
      if (exifChunk !== null) {
        try {
          const parsed = await parseExifChunk(exifChunk.data);
          Object.assign(sources, parsed.sources);
          raw.exif = parsed.raw;

          if (
            Object.keys(parsed.sources.image ?? {}).length === 0 &&
            Object.keys(parsed.sources.photo ?? {}).length === 0 &&
            Object.keys(parsed.sources.gps ?? {}).length === 0
          ) {
            blockStates.exif = "partial";
            warnings.push({
              code: "WEBP_EXIF_EMPTY",
              message: "An EXIF chunk is present but no EXIF fields were recovered.",
            });
          }
        } catch (error) {
          blockStates.exif = "failed";
          warnings.push({
            code: "WEBP_EXIF_PARSE_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "WebP EXIF metadata could not be parsed.",
          });
        }
      }

      const xmpChunk = firstChunk(container.chunks, "XMP ");
      if (xmpChunk !== null) {
        try {
          const parsed = parseXmpPacket(xmpChunk.data);
          sources.xmp = parsed.entries;
          raw.xmpPacket = parsed.packet;
        } catch (error) {
          blockStates.xmp = "failed";
          warnings.push({
            code: "WEBP_XMP_PARSE_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "WebP XMP metadata could not be parsed.",
          });
        }
      }

      const iccChunk = firstChunk(container.chunks, "ICCP");
      if (iccChunk !== null) {
        const parsed = parseIccProfile(iccChunk.data);
        sources.icc = parsed.entries;
        raw.icc = parsed.entries;

        if (parsed.warnings.length > 0) {
          blockStates.icc = "partial";
          warnings.push(...parsed.warnings);
        }
      }

      return {
        adapterId: "webp-native",
        state: "success",
        capabilities: CAPABILITIES,
        blockStates,
        sources,
        raw,
        warnings,
      };
    } catch (error) {
      return {
        adapterId: "webp-native",
        state: "failed",
        capabilities: CAPABILITIES,
        blockStates: {
          exif: "failed",
          xmp: "failed",
          icc: "failed",
        },
        sources: {},
        raw: {},
        warnings: [
          {
            code: "WEBP_CONTAINER_PARSE_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "WebP container could not be parsed.",
          },
        ],
      };
    }
  },
};

async function parseExifChunk(data: Uint8Array): Promise<{
  sources: Partial<Record<SourceBlockKey, Record<string, unknown>>>;
  raw: Record<string, unknown>;
}> {
  const tiff = stripExifPrefix(data);
  const parsed: unknown = await exifr.parse(tiff, {
    tiff: true,
    exif: true,
    gps: true,
    xmp: false,
    iptc: false,
    icc: false,
    jfif: false,
    makerNote: false,
    userComment: true,
    sanitize: true,
    mergeOutput: false,
  });

  const raw = isRecord(parsed) ? parsed : {};

  return {
    sources: {
      image: toEntries(raw.ifd0),
      photo: toEntries(raw.exif),
      gps: toEntries(raw.gps),
    },
    raw,
  };
}

function stripExifPrefix(data: Uint8Array): Uint8Array {
  if (
    data.length >= 6 &&
    data[0] === 0x45 &&
    data[1] === 0x78 &&
    data[2] === 0x69 &&
    data[3] === 0x66 &&
    data[4] === 0 &&
    data[5] === 0
  ) {
    return data.subarray(6);
  }

  return data;
}

function toEntries(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (value === undefined || value === null) return {};
  return { value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
