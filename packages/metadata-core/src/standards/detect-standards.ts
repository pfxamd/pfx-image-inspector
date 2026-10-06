import type {
  MetadataBlock,
  MetadataCollection,
  StandardDescriptor,
  StandardsInfo,
} from "../model/public.js";

interface LocatedValue {
  value: unknown;
  path: string;
}

export function detectStandards(metadata: MetadataCollection): StandardsInfo {
  return {
    exif: describe(
      metadata.exif,
      "metadata.exif",
      locate(metadata.exif.entries, ["ExifVersion"], "metadata.exif.entries"),
      normalizeExifVersion,
    ),
    xmp: describe(metadata.xmp, "metadata.xmp", null, () => null),
    iptc: describe(
      metadata.iptc,
      "metadata.iptc",
      locate(
        metadata.iptc.entries,
        ["ApplicationRecordVersion", "RecordVersion"],
        "metadata.iptc.entries",
      ),
      normalizeSimpleVersion,
    ),
    icc: describe(
      metadata.icc,
      "metadata.icc",
      locate(metadata.icc.entries, ["ProfileVersion"], "metadata.icc.entries"),
      normalizeSimpleVersion,
    ),
    jfif: describe(
      metadata.jfif,
      "metadata.jfif",
      locate(metadata.jfif.entries, ["JFIFVersion"], "metadata.jfif.entries"),
      normalizeJfifVersion,
    ),
  };
}

function describe(
  block: MetadataBlock,
  sectionPath: string,
  located: LocatedValue | null,
  normalizeVersion: (value: unknown) => string | null,
): StandardDescriptor {
  const version = located === null ? null : normalizeVersion(located.value);
  const evidence =
    located !== null
      ? [located.path]
      : block.status === "present" || block.status === "partial"
        ? [sectionPath]
        : [];

  return {
    status: block.status,
    version,
    evidence,
  };
}

function locate(
  source: Record<string, unknown>,
  keys: readonly string[],
  basePath: string,
  depth = 0,
): LocatedValue | null {
  if (depth > 6) return null;

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return { value: source[key], path: `${basePath}.${key}` };
    }
  }

  for (const [key, value] of Object.entries(source)) {
    if (!isRecord(value)) continue;
    const nested = locate(value, keys, `${basePath}.${key}`, depth + 1);
    if (nested !== null) return nested;
  }

  return null;
}

function normalizeExifVersion(value: unknown): string | null {
  const raw = toAscii(value);
  if (raw === null) return null;

  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length !== 4) return raw.trim() || null;

  const major = Number.parseInt(digits.slice(0, 2), 10);
  const minorRaw = digits.slice(2);
  if (!Number.isFinite(major)) return raw.trim() || null;

  const minor = minorRaw === "00" ? "0" : minorRaw.replace(/0+$/, "");
  return `${major}.${minor || "0"}`;
}

function normalizeSimpleVersion(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (Array.isArray(value) && value.every((part) => typeof part === "number")) {
    return value.join(".");
  }

  return null;
}

function normalizeJfifVersion(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    const major = (value >> 8) & 0xff;
    const minor = value & 0xff;
    return `${major}.${String(minor).padStart(2, "0")}`;
  }

  return normalizeSimpleVersion(value);
}

function toAscii(value: unknown): string | null {
  if (typeof value === "string") return value;

  if (value instanceof Uint8Array) {
    return String.fromCharCode(...value);
  }

  if (
    Array.isArray(value) &&
    value.every((item) => typeof item === "number" && item >= 0 && item <= 255)
  ) {
    return String.fromCharCode(...(value as number[]));
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Uint8Array)
  );
}
