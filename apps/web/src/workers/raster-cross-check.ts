import type { ImageInspectionResult } from "../contracts/inspection.js";

const MAX_RASTER_CHECK_BYTES = 8 * 1024 * 1024;

/**
 * Non-authoritative, bounded second opinion. Never replace metadata-core's
 * existing values or fail the metadata inspection because raster decode fails.
 * Raster Core 0.5.x browser inspection supports still JPEG, PNG and WebP only.
 */
export async function crossCheckRaster(
  input: Blob | ArrayBuffer,
  result: ImageInspectionResult,
  signal: AbortSignal,
): Promise<NonNullable<ImageInspectionResult["raster"]>> {
  const unsupported = {
    status: "unsupported" as const,
    agreement: null,
    format: null, width: null, height: null,
    hasAlpha: null, hasIccProfile: null,
    detail: "Raster Core browser supports still JPEG, PNG and WebP only.",
  };
  if (!["jpeg", "png", "webp"].includes(result.file.format)) {
    return unsupported;
  }

  const size = input instanceof Blob ? input.size : input.byteLength;
  if (size > MAX_RASTER_CHECK_BYTES) {
    return {
      ...unsupported,
      status: "skipped",
      detail: "Secondary raster validation skipped above 8 MiB; metadata inspection remains available.",
    };
  }
  if (signal.aborted) {
    return {
      ...unsupported,
      status: "skipped",
      detail: "Raster check cancelled.",
    };
  }

  try {
    const { createRasterCore } = await import("@pfxamd/raster-core/browser");
    if (signal.aborted) return { ...unsupported, status: "skipped", detail: "Raster check cancelled." };
    const bytes = new Uint8Array(input instanceof Blob ? await input.arrayBuffer() : input);
    if (signal.aborted) return { ...unsupported, status: "skipped", detail: "Raster check cancelled." };

    // Only the dedicated metadata worker uses the Raster Core runtime.
    const image = await createRasterCore().inspect(bytes);
    const metadataComparable = result.image.width !== null && result.image.height !== null
      && (result.image.orientation === null || result.image.orientation === 1);
    const agreement = metadataComparable
      ? image.format === result.file.format &&
        image.width === result.image.width && image.height === result.image.height
        ? "match" as const : "mismatch" as const
      : "not_comparable" as const;

    return {
      status: "checked",
      agreement,
      format: image.format,
      width: image.width,
      height: image.height,
      hasAlpha: image.hasAlpha,
      hasIccProfile: image.hasIccProfile,
      detail: agreement === "not_comparable"
        ? "Different orientation conventions may apply; dimensions were not compared."
        : agreement === "mismatch"
          ? "Raster and metadata parsers disagree on format or dimensions."
          : "Independent raster and metadata parsers agree on format and dimensions.",
    };
  } catch {
    // Unsupported animation, browser decoder limitations or broken payload
    // must never erase a valid metadata result.
    return {
      ...unsupported,
      status: "unavailable",
      detail: "Independent raster decode was unavailable; metadata results were retained.",
    };
  }
}
