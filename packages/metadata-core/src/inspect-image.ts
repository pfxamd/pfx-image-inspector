import { INSPECTION_ERROR_CODES } from "./errors/error-codes.js";
import { InspectionError } from "./errors/inspection-error.js";
import { detectFormat } from "./formats/detect-format.js";
import { normalizeInput } from "./input/normalize-input.js";
import type {
  ImageInput,
  ImageInspectionResult,
  InspectOptions,
  MetadataBlock,
} from "./model/public.js";

const SCHEMA_VERSION = "0.1.0";
const ENGINE_VERSION = "0.1.0-alpha.0";

const DEFAULT_OPTIONS = {
  includeRaw: false,
  analyzePrivacy: true,
  analyzeIntegrity: true,
  detectProvenance: true,
} as const;

export async function inspectImage(
  input: ImageInput,
  options: InspectOptions = {},
): Promise<ImageInspectionResult> {
  assertNotAborted(options.signal);

  const normalized = await normalizeInput(input);
  assertNotAborted(options.signal);

  const detected = detectFormat(normalized.bytes);
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const unsupportedBlock = (): MetadataBlock => ({ status: "unsupported", entries: {} });

  const result: ImageInspectionResult = {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    file: {
      name: normalized.name,
      format: detected.format,
      mime: detected.mime,
      declaredMime: normalized.declaredMime,
      size: normalized.size,
    },
    image: {
      width: null,
      height: null,
      orientation: null,
      dpi: null,
      bitDepth: null,
    },
    camera: null,
    location: null,
    color: null,
    timestamps: {
      takenAt: null,
      digitizedAt: null,
      modifiedAt: null,
    },
    software: null,
    metadata: {
      exif: unsupportedBlock(),
      xmp: unsupportedBlock(),
      iptc: unsupportedBlock(),
      icc: unsupportedBlock(),
      jfif: unsupportedBlock(),
    },
    privacy: {
      status: resolved.analyzePrivacy ? "insufficient_metadata" : "not_analyzed",
      findings: [],
    },
    integrity: {
      status: resolved.analyzeIntegrity ? "insufficient_metadata" : "not_analyzed",
      findings: [],
    },
    standards: {
      exif: "unsupported",
      xmp: "unsupported",
      iptc: "unsupported",
      icc: "unsupported",
      jfif: "unsupported",
    },
    provenance: {
      c2pa: {
        status: resolved.detectProvenance ? "unsupported" : "not_checked",
        verification: "not_attempted",
      },
    },
    warnings: [
      {
        code: "METADATA_ADAPTERS_NOT_CONNECTED",
        message: "Format inspection is active; metadata adapters are not connected yet.",
      },
    ],
  };

  if (resolved.includeRaw) result.raw = {};
  return result;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new InspectionError(INSPECTION_ERROR_CODES.ABORTED, "Image inspection was aborted.");
  }
}
