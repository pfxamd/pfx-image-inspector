import type { ImageInspectionResult } from "../contracts/inspection.js";

const MAX_RASTER_CHECK_BYTES = 8 * 1024 * 1024;

/**
 * Non-authoritative, bounded structural header second opinion. Never replace
 * metadata-core's existing values or require a decoded bitmap.
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
    const { inspectRasterHeader } = await import("@pfxamd/raster-core/browser/header");
    if (signal.aborted) return { ...unsupported, status: "skipped", detail: "Raster check cancelled." };
    const bytes = new Uint8Array(input instanceof Blob ? await input.arrayBuffer() : input);
    if (signal.aborted) return { ...unsupported, status: "skipped", detail: "Raster check cancelled." };

    // Structural cross-check only. No bitmap decoding or RGBA allocation.
    // The existing metadata engine retains authority for full metadata parsing.
    const image = inspectRasterHeader(bytes, {
      maxInputBytes: MAX_RASTER_CHECK_BYTES,
    });
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
          ? "Raster header and metadata parsers disagree on declared format or dimensions."
          : "Independent raster header and metadata parsers agree on declared format and dimensions.",
    };
  } catch {
    // Unsupported animation, invalid header structure or unreadable payload
    // must never erase a valid metadata result.
    return {
      ...unsupported,
      status: "unavailable",
      detail: "Independent raster header inspection was unavailable; metadata results were retained.",
    };
  }
}
