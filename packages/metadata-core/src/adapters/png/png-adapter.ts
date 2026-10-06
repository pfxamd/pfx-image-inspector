import type {
  AdapterExtractionResult,
  MetadataAdapter,
  MetadataCapabilities,
  MetadataBlockKey,
} from "../adapter.js";
import { parseIccProfile } from "../../parsers/icc.js";

const CAPABILITIES: MetadataCapabilities = {
  exif: false,
  xmp: false,
  iptc: false,
  icc: true,
  jfif: false,
};

export const pngAdapter: MetadataAdapter = {
  id: "png-native",

  supportsFormat(format) {
    return format === "png";
  },

  async extract(context): Promise<AdapterExtractionResult> {
    const blockStates: Partial<Record<MetadataBlockKey, "success" | "partial" | "failed">> = {
      icc: "success",
    };

    try {
      const parsed = parsePngChunks(context.bytes);
      const sources: AdapterExtractionResult["sources"] = {};

      if (Object.keys(parsed.text).length > 0) {
        sources.header = parsed.text;
      }

      if (parsed.iccp !== null) {
        try {
          const profileBytes = await inflateZlib(parsed.iccp.compressed);
          const icc = parseIccProfile(profileBytes);
          sources.icc = icc.entries;

          if (icc.warnings.length > 0) {
            blockStates.icc = "partial";
            parsed.warnings.push(...icc.warnings);
          }
        } catch (error) {
          blockStates.icc = "failed";
          parsed.warnings.push({
            code: "PNG_ICCP_PARSE_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "PNG ICC profile could not be decompressed or parsed.",
          });
        }
      }

      return {
        adapterId: "png-native",
        state: "success",
        capabilities: CAPABILITIES,
        blockStates,
        sources,
        raw: {
          container: {
            chunks: parsed.chunks,
            iccProfileName: parsed.iccp?.name ?? null,
          },
        },
        warnings: parsed.warnings,
      };
    } catch (error) {
      return {
        adapterId: "png-native",
        state: "failed",
        capabilities: CAPABILITIES,
        blockStates: { icc: "failed" },
        sources: {},
        raw: {},
        warnings: [
          {
            code: "PNG_CONTAINER_PARSE_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "PNG container could not be parsed.",
          },
        ],
      };
    }
  },
};

interface ParsedPng {
  chunks: Array<{ type: string; offset: number; size: number }>;
  text: Record<string, unknown>;
  iccp: { name: string; compressed: Uint8Array } | null;
  warnings: Array<{ code: string; message: string }>;
}

function parsePngChunks(bytes: Uint8Array): ParsedPng {
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    throw new Error("Invalid PNG signature.");
  }

  const chunks: ParsedPng["chunks"] = [];
  const text: Record<string, unknown> = {};
  const warnings: ParsedPng["warnings"] = [];
  let iccp: ParsedPng["iccp"] = null;
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const size = readU32BE(bytes, offset);
    const type = ascii(bytes, offset + 4, offset + 8);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + size;
    const chunkEnd = dataEnd + 4;

    if (chunkEnd > bytes.length) {
      throw new Error(`PNG chunk ${type} exceeds the file boundary.`);
    }

    chunks.push({ type, offset, size });

    if (type === "tEXt") {
      const separator = findByte(bytes, dataOffset, dataEnd, 0);
      if (separator > dataOffset) {
        const key = ascii(bytes, dataOffset, separator);
        const value = ascii(bytes, separator + 1, dataEnd);
        if (key.length > 0 && text[key] === undefined) text[key] = value;
      }
    } else if (type === "iCCP" && iccp === null) {
      const separator = findByte(bytes, dataOffset, dataEnd, 0);

      if (separator < dataOffset || separator + 2 > dataEnd) {
        warnings.push({
          code: "PNG_ICCP_HEADER_INVALID",
          message: "PNG iCCP chunk has an invalid profile-name header.",
        });
      } else {
        const compressionMethod = bytes[separator + 1] ?? 255;

        if (compressionMethod !== 0) {
          warnings.push({
            code: "PNG_ICCP_COMPRESSION_UNSUPPORTED",
            message: "PNG iCCP chunk uses an unsupported compression method.",
          });
        } else {
          iccp = {
            name: ascii(bytes, dataOffset, separator),
            compressed: bytes.subarray(separator + 2, dataEnd),
          };
        }
      }
    }

    offset = chunkEnd;
    if (type === "IEND") break;
  }

  return { chunks, text, iccp, warnings };
}

async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Deflate decompression is not available in this runtime.");
  }

  const input = new Blob([bytes.slice()]);
  const decompressed = input.stream().pipeThrough(
    new DecompressionStream("deflate"),
  );
  const buffer = await new Response(decompressed).arrayBuffer();
  return new Uint8Array(buffer);
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

function findByte(
  bytes: Uint8Array,
  start: number,
  end: number,
  target: number,
): number {
  for (let index = start; index < end; index += 1) {
    if (bytes[index] === target) return index;
  }
  return -1;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let value = "";
  for (let index = start; index < end; index += 1) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }
  return value;
}
