import type {
  AdapterExtractionResult,
  MetadataBlockKey,
  SourceBlockKey,
} from "../adapters/adapter.js";
import { detectStandards } from "../standards/detect-standards.js";
import type {
  CameraInfo,
  ColorInfo,
  ImageInfo,
  LocationInfo,
  MetadataBlock,
  MetadataCollection,
  RawMetadata,
  SoftwareInfo,
  StandardsInfo,
  TimestampInfo,
} from "../model/public.js";

export interface NormalizedExtractionData {
  image: ImageInfo;
  camera: CameraInfo | null;
  location: LocationInfo | null;
  color: ColorInfo | null;
  timestamps: TimestampInfo;
  software: SoftwareInfo | null;
  metadata: MetadataCollection;
  standards: StandardsInfo;
  raw: RawMetadata;
}

export function normalizeExtractions(
  results: readonly AdapterExtractionResult[],
): NormalizedExtractionData {
  const sources = mergeSources(results);
  const blocks: Record<MetadataBlockKey, Record<string, unknown>> = {
    exif: mergeRecords(sources.image, sources.photo, sources.gps),
    xmp: sources.xmp ?? {},
    iptc: sources.iptc ?? {},
    icc: sources.icc ?? {},
    jfif: sources.jfif ?? {},
  };

  const metadata = {} as MetadataCollection;

  for (const key of Object.keys(blocks) as MetadataBlockKey[]) {
    const status = resolveStatus(key, blocks[key], results);
    const block: MetadataBlock = { status, entries: blocks[key] };
    metadata[key] = block;
  }

  const standards = detectStandards(metadata);

  const imageSource = mergeRecords(sources.header, sources.image, sources.photo);
  const cameraSource = mergeRecords(sources.image, sources.photo);

  return {
    image: normalizeImage(imageSource),
    camera: normalizeCamera(cameraSource),
    location: normalizeLocation(sources.gps ?? {}),
    color: normalizeColor(mergeRecords(sources.photo, sources.icc)),
    timestamps: normalizeTimestamps(
      mergeRecords(sources.image, sources.photo, sources.xmp),
    ),
    software: normalizeSoftware(
      mergeRecords(sources.image, sources.photo, sources.xmp),
    ),
    metadata,
    standards,
    raw: Object.fromEntries(results.map((result) => [result.adapterId, result.raw])),
  };
}

function mergeSources(
  results: readonly AdapterExtractionResult[],
): Partial<Record<SourceBlockKey, Record<string, unknown>>> {
  const merged: Partial<Record<SourceBlockKey, Record<string, unknown>>> = {};

  for (const result of results) {
    for (const [key, entries] of Object.entries(result.sources) as Array<
      [SourceBlockKey, Record<string, unknown>]
    >) {
      merged[key] = mergeRecords(merged[key], entries);
    }
  }

  return merged;
}

function resolveStatus(
  key: MetadataBlockKey,
  entries: Record<string, unknown>,
  results: readonly AdapterExtractionResult[],
): MetadataBlock["status"] {
  const supporting = results.filter((result) => result.capabilities[key]);
  if (supporting.length === 0) return "unsupported";

  const states = supporting.map(
    (result) => result.blockStates?.[key] ?? result.state,
  );
  const hasSuccess = states.includes("success");
  const hasPartial = states.includes("partial");
  const hasFailure = states.includes("failed");

  if (Object.keys(entries).length > 0) {
    return hasPartial || hasFailure ? "partial" : "present";
  }

  if (hasSuccess) return "absent";
  if (hasPartial) return "partial";
  return "malformed";
}

function normalizeImage(source: Record<string, unknown>): ImageInfo {
  return {
    width: firstNumber(source, [
      "ImageWidth",
      "ExifImageWidth",
      "PixelXDimension",
      "Width",
      "width",
    ]),
    height: firstNumber(source, [
      "ImageHeight",
      "ExifImageHeight",
      "PixelYDimension",
      "Height",
      "height",
    ]),
    orientation: normalizeOrientation(firstValue(source, ["Orientation"])),
    dpi: normalizeDpi(source),
    bitDepth: normalizeBitDepth(firstValue(source, ["BitDepth", "BitsPerSample"])),
  };
}

function normalizeCamera(source: Record<string, unknown>): CameraInfo | null {
  const camera: CameraInfo = {
    make: firstString(source, ["Make"]),
    model: firstString(source, ["Model"]),
    lens: firstString(source, ["LensModel", "Lens"]),
    iso: firstNumber(source, ["ISO", "PhotographicSensitivity", "ISOSpeedRatings"]),
    aperture: firstNumber(source, ["FNumber"]),
    focalLength: firstNumber(source, ["FocalLength"]),
    exposureTime: firstNumber(source, ["ExposureTime"]),
  };

  return Object.values(camera).every((value) => value === null) ? null : camera;
}

function normalizeLocation(source: Record<string, unknown>): LocationInfo | null {
  const latitude = coordinate(source, "latitude", "GPSLatitude", "GPSLatitudeRef");
  const longitude = coordinate(
    source,
    "longitude",
    "GPSLongitude",
    "GPSLongitudeRef",
  );

  let altitude = firstNumber(source, ["GPSAltitude", "altitude"]);
  const altitudeRef = firstNumber(source, ["GPSAltitudeRef"]);
  if (altitude !== null && altitudeRef === 1) altitude = -Math.abs(altitude);

  if (latitude === null && longitude === null && altitude === null) return null;
  return { latitude, longitude, altitude };
}

function normalizeColor(source: Record<string, unknown>): ColorInfo | null {
  const color: ColorInfo = {
    colorSpace: findDeepString(source, ["ColorSpace", "ColorSpaceData"]),
    profileName: findDeepString(source, [
      "ProfileDescription",
      "ProfileName",
      "DeviceModelDesc",
    ]),
  };

  return color.colorSpace === null && color.profileName === null ? null : color;
}

function normalizeTimestamps(source: Record<string, unknown>): TimestampInfo {
  return {
    takenAt: firstDate(source, ["DateTimeOriginal", "DateCreated"]),
    digitizedAt: firstDate(source, ["CreateDate", "DateTimeDigitized"]),
    modifiedAt: firstDate(source, ["ModifyDate", "DateTime"]),
  };
}

function normalizeSoftware(source: Record<string, unknown>): SoftwareInfo | null {
  const name = findDeepString(source, [
    "Software",
    "CreatorTool",
    "ProcessingSoftware",
  ]);

  return name === null ? null : { name, version: null };
}

const ORIENTATION_BY_LABEL: Readonly<Record<string, number>> = {
  "Horizontal (normal)": 1,
  "Mirror horizontal": 2,
  "Rotate 180": 3,
  "Mirror vertical": 4,
  "Mirror horizontal and rotate 270 CW": 5,
  "Rotate 90 CW": 6,
  "Mirror horizontal and rotate 90 CW": 7,
  "Rotate 270 CW": 8,
};

function normalizeOrientation(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 8) {
    return value;
  }

  if (typeof value === "string") {
    const translated = ORIENTATION_BY_LABEL[value.trim()];
    if (translated !== undefined) return translated;

    const numeric = Number(value);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 8) return numeric;
  }

  return null;
}

function normalizeDpi(source: Record<string, unknown>): ImageInfo["dpi"] {
  let x = firstNumber(source, ["XResolution"]);
  let y = firstNumber(source, ["YResolution"]);
  if (x === null && y === null) return null;

  const unit = firstValue(source, ["ResolutionUnit"]);
  if (
    unit === 3 ||
    (typeof unit === "string" && unit.toLowerCase().includes("cm"))
  ) {
    if (x !== null) x *= 2.54;
    if (y !== null) y *= 2.54;
  }

  return { x, y };
}

function normalizeBitDepth(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!Array.isArray(value) || value.length === 0) return null;

  const numbers = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );

  if (numbers.length !== value.length) return null;
  return numbers.every((item) => item === numbers[0]) ? (numbers[0] ?? null) : null;
}

function coordinate(
  source: Record<string, unknown>,
  decimalKey: string,
  dmsKey: string,
  refKey: string,
): number | null {
  const decimal = firstNumber(source, [decimalKey]);
  if (decimal !== null) return decimal;

  const dms = source[dmsKey];
  if (!Array.isArray(dms) || dms.length < 3) return null;

  const [degrees, minutes, seconds] = dms;
  if (
    ![degrees, minutes, seconds].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
  ) {
    return null;
  }

  let result =
    (degrees as number) +
    (minutes as number) / 60 +
    (seconds as number) / 3600;

  const ref = firstString(source, [refKey]);
  if (ref === "S" || ref === "W") result = -Math.abs(result);
  return result;
}

function mergeRecords(
  ...records: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
  return Object.assign(
    {},
    ...records.filter(
      (record): record is Record<string, unknown> => record !== undefined,
    ),
  );
}

function firstValue(
  source: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }

  return undefined;
}

function firstNumber(
  source: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  const value = firstValue(source, keys);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstString(
  source: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  const value = firstValue(source, keys);
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function firstDate(
  source: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  const value = firstValue(source, keys);

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

function findDeepString(
  source: Record<string, unknown>,
  keys: readonly string[],
  depth = 0,
): string | null {
  if (depth > 5) return null;

  const direct = firstString(source, keys);
  if (direct !== null) return direct;

  for (const value of Object.values(source)) {
    if (isRecord(value)) {
      const found = findDeepString(value, keys, depth + 1);
      if (found !== null) return found;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}
