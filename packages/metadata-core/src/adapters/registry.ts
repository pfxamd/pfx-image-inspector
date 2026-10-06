import type { InspectionWarning } from "../model/public.js";
import type {
  AdapterExtractionResult,
  InspectionContext,
  MetadataAdapter,
} from "./adapter.js";

export interface RegistryExtraction {
  results: AdapterExtractionResult[];
  warnings: InspectionWarning[];
}

export class AdapterRegistry {
  readonly #adapters: readonly MetadataAdapter[];

  constructor(adapters: readonly MetadataAdapter[]) {
    this.#adapters = adapters;
  }

  async extract(context: InspectionContext): Promise<RegistryExtraction> {
    const matching = this.#adapters.filter((adapter) => adapter.supportsFormat(context.format));

    if (matching.length === 0) {
      return {
        results: [],
        warnings: [
          {
            code: "NO_METADATA_ADAPTER",
            message: `No metadata adapter supports ${context.format} yet.`,
          },
        ],
      };
    }

    const results: AdapterExtractionResult[] = [];
    const warnings: InspectionWarning[] = [];

    for (const adapter of matching) {
      if (context.signal?.aborted) break;

      try {
        const result = await adapter.extract(context);
        results.push(result);
        warnings.push(...result.warnings);
      } catch (error) {
        warnings.push({
          code: "METADATA_ADAPTER_FAILED",
          message: `${adapter.id} failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        });
      }
    }

    return { results, warnings };
  }
}
