import type {
  ImageInspectionResult,
} from "../../contracts/inspection.js";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unitIndex]}`;
}

export function formatDimensions(
  image: ImageInspectionResult["image"],
): string {
  if (image.width === null || image.height === null) return "— × —";
  return `${image.width} × ${image.height}`;
}

export function formatFormat(format: string): string {
  return format.toUpperCase();
}

export function formatOrientation(value: number | null): string {
  if (value === null) return "—";

  const labels: Record<number, string> = {
    1: "Normal",
    2: "Mirrored horizontal",
    3: "Rotated 180°",
    4: "Mirrored vertical",
    5: "Mirrored + 90° CW",
    6: "90° CW",
    7: "Mirrored + 90° CCW",
    8: "90° CCW",
  };

  return labels[value] ?? `Value ${value}`;
}

export function formatResolution(
  dpi: ImageInspectionResult["image"]["dpi"],
): string {
  if (dpi === null || (dpi.x === null && dpi.y === null)) return "—";

  if (dpi.x !== null && dpi.y !== null) {
    return dpi.x === dpi.y
      ? `${formatNumber(dpi.x, 1)} PPI`
      : `${formatNumber(dpi.x, 1)} × ${formatNumber(dpi.y, 1)} PPI`;
  }

  return `${formatNumber(dpi.x ?? dpi.y ?? 0, 1)} PPI`;
}

export function formatIso(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `ISO ${value}`;
}

export function formatAperture(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : `f/${formatNumber(value, 2)}`;
}

export function formatFocalLength(
  value: number | null | undefined,
): string {
  return value === null || value === undefined
    ? "—"
    : `${formatNumber(value, 2)} mm`;
}

export function formatExposure(
  value: number | null | undefined,
): string {
  if (value === null || value === undefined) return "—";
  if (value > 0 && value < 1) {
    const denominator = Math.round(1 / value);
    return `1/${denominator} s`;
  }
  return `${formatNumber(value, 3)} s`;
}

export function formatTimestamp(value: string | null): string {
  return value?.trim() || "—";
}

export function formatCoordinate(value: number | null): string {
  return value === null ? "—" : formatNumber(value, 6);
}

export function formatNumber(value: number, places: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(places).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value || "—";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function buildExtractionTokens(
  result: ImageInspectionResult,
): string[] {
  const tokens = [
    result.camera?.iso === null || result.camera?.iso === undefined
      ? null
      : `ISO ${result.camera.iso}`,
    result.camera?.aperture === null ||
    result.camera?.aperture === undefined
      ? null
      : `f/${formatNumber(result.camera.aperture, 2)}`,
    result.camera?.focalLength === null ||
    result.camera?.focalLength === undefined
      ? null
      : `${formatNumber(result.camera.focalLength, 1)} mm`,
    result.location === null ? null : "GPS",
    result.metadata.exif.status === "present" ? "EXIF" : null,
    result.metadata.xmp.status === "present" ? "XMP" : null,
    result.metadata.icc.status === "present" ? "ICC" : null,
    result.timestamps.takenAt,
    formatDimensions(result.image),
  ];

  return tokens.filter((value): value is string => Boolean(value));
}
