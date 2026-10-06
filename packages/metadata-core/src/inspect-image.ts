import { analyzeIntegrity } from "./analysis/integrity/analyze-integrity.js";
import { analyzePrivacy } from "./analysis/privacy/analyze-privacy.js";
import { defaultAdapterRegistry } from "./adapters/default-registry.js";
import type { InspectionContext } from "./adapters/adapter.js";
import { INSPECTION_ERROR_CODES } from "./errors/error-codes.js";
import { InspectionError } from "./errors/inspection-error.js";
import { detectFormat } from "./formats/detect-format.js";
import { normalizeInput } from "./input/normalize-input.js";
import type {
  ImageInput,
  ImageInspectionResult,
  InspectOptions,
} from "./model/public.js";
import { normalizeExtractions } from "./normalize/normalize-extractions.js";

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

  const context: InspectionContext = {
    bytes: normalized.bytes,
    format: detected.format,
  };

  if (options.signal !== undefined) context.signal = options.signal;

  const extraction = await defaultAdapterRegistry.extract(context);
  assertNotAborted(options.signal);

  const canonical = normalizeExtractions(extraction.results);

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
    image: canonical.image,
    camera: canonical.camera,
    location: canonical.location,
    color: canonical.color,
    timestamps: canonical.timestamps,
    software: canonical.software,
    metadata: canonical.metadata,
    privacy: resolved.analyzePrivacy
      ? analyzePrivacy({
          location: canonical.location,
          timestamps: canonical.timestamps,
          software: canonical.software,
          metadata: canonical.metadata,
        })
      : {
          status: "not_analyzed",
          findings: [],
        },
    integrity: resolved.analyzeIntegrity
      ? analyzeIntegrity({
          image: canonical.image,
          location: canonical.location,
          timestamps: canonical.timestamps,
          metadata: canonical.metadata,
        })
      : {
          status: "not_analyzed",
          findings: [],
        },
    standards: canonical.standards,
    provenance: {
      c2pa: {
        status: "not_checked",
        verification: "not_attempted",
      },
    },
    warnings: extraction.warnings,
  };

  if (resolved.includeRaw) result.raw = canonical.raw;
  return result;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new InspectionError(
      INSPECTION_ERROR_CODES.ABORTED,
      "Image inspection was aborted.",
    );
  }
}
