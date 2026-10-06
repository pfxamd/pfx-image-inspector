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
    image: normalizeImage(imageSource, sources.jfif ?? {}),
    camera: normalizeCamera(cameraSource),
    location: normalizeLocation(sources.gps ?? {}),
    color: normalizeColor(mergeRecords(sources.photo, sources.icc)),
    timestamps: normalizeTimestamps({
      image: sources.image ?? {},
      photo: sources.photo ?? {},
      xmp: sources.xmp ?? {},
      iptc: sources.iptc ?? {},
    }),
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

function normalizeImage(
  source: Record<string, unknown>,
  jfif: Record<string, unknown>,
): ImageInfo {
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
    dpi: normalizeDpi(source, jfif),
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
  const altitudeRef = firstValue(source, ["GPSAltitudeRef"]);
  if (altitude !== null && isBelowSeaLevel(altitudeRef)) {
    altitude = -Math.abs(altitude);
  }

  if (latitude === null && longitude === null && altitude === null) return null;
  return { latitude, longitude, altitude };
}

function normalizeColor(source: Record<string, unknown>): ColorInfo | null {
  const color: ColorInfo = {
    colorSpace: normalizeColorSpace(
      findDeepValue(source, ["ColorSpace", "ColorSpaceData"]),
    ),
    profileName: findDeepString(source, [
      "ProfileDescription",
      "ProfileName",
      "DeviceModelDesc",
    ]),
  };

  return color.colorSpace === null && color.profileName === null ? null : color;
}

interface TimestampSources {
  image: Record<string, unknown>;
  photo: Record<string, unknown>;
  xmp: Record<string, unknown>;
  iptc: Record<string, unknown>;
}

function normalizeTimestamps(source: TimestampSources): TimestampInfo {
  const iptcCreated = combineIptcDateTime(
    source.iptc,
    "DateCreated",
    "TimeCreated",
  );
  const iptcDigitized = combineIptcDateTime(
    source.iptc,
    "DigitalCreationDate",
    "DigitalCreationTime",
  );

  return {
    takenAt:
      firstDateFromSources([
        [source.photo, ["DateTimeOriginal"]],
        [source.xmp, ["DateTimeOriginal"]],
      ]) ??
      iptcCreated ??
      firstDateFromSources([[source.xmp, ["DateCreated"]]]),
    digitizedAt:
      firstDateFromSources([
        [source.photo, ["CreateDate", "DateTimeDigitized"]],
        [source.xmp, ["CreateDate", "DateTimeDigitized", "DigitalCreationDate"]],
      ]) ?? iptcDigitized,
    modifiedAt: firstDateFromSources([
      [source.image, ["ModifyDate", "DateTime"]],
      [source.xmp, ["ModifyDate", "MetadataDate"]],
    ]),
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

function normalizeDpi(
  source: Record<string, unknown>,
  jfif: Record<string, unknown>,
): ImageInfo["dpi"] {
  let x = firstNumber(source, ["XResolution"]);
  let y = firstNumber(source, ["YResolution"]);
  let unit = firstValue(source, ["ResolutionUnit"]);

  if (x === null && y === null) {
    x = firstNumber(jfif, ["XResolution"]);
    y = firstNumber(jfif, ["YResolution"]);
    unit = firstValue(jfif, ["ResolutionUnit"]);
  }

  if (x === null && y === null) return null;

  if (
    unit === 3 ||
    unit === 2 ||
    (typeof unit === "string" && unit.toLowerCase().includes("cm"))
  ) {
    if (x !== null) x *= 2.54;
    if (y !== null) y *= 2.54;
  }

  return { x, y };
}

function isBelowSeaLevel(value: unknown): boolean {
  if (value === 1) return true;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === "1" ||
      normalized.includes("below") ||
      normalized.includes("negative")
    );
  }

  if (value instanceof Uint8Array) return value[0] === 1;
  if (Array.isArray(value)) return value[0] === 1;

  return false;
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

function combineIptcDateTime(
  source: Record<string, unknown>,
  dateKey: string,
  timeKey: string,
): string | null {
  const dateValue = findDeepValue(source, [dateKey]);
  const timeValue = findDeepValue(source, [timeKey]);

  if (typeof dateValue !== "string") return null;

  const dateMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(dateValue.trim());
  if (!dateMatch) return normalizeDateValue(dateValue);

  const [, year, month, day] = dateMatch;

  if (typeof timeValue !== "string" || timeValue.trim().length === 0) {
    return `${year}-${month}-${day}`;
  }

  const time = timeValue.trim();
  const timeMatch =
    /^(\d{2}):?(\d{2}):?(\d{2})(?:([+-])(\d{2}):?(\d{2}))?$/.exec(time);

  if (!timeMatch) return `${year}-${month}-${day}`;

  const [, hour, minute, second, sign, offsetHour, offsetMinute] = timeMatch;
  const offset =
    sign && offsetHour && offsetMinute
      ? `${sign}${offsetHour}:${offsetMinute}`
      : "";

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

function firstDateFromSources(
  candidates: ReadonlyArray<
    readonly [Record<string, unknown>, readonly string[]]
  >,
): string | null {
  for (const [source, keys] of candidates) {
    const value = findDeepValue(source, keys);
    const normalized = normalizeDateValue(value);
    if (normalized !== null) return normalized;
  }

  return null;
}

function normalizeDateValue(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatFloatingDate(value);
  }

  if (typeof value !== "string" || value.trim().length === 0) return null;

  const raw = value.trim();
  const exif = /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(.*)$/.exec(raw);

  if (exif) {
    const [, year, month, day, hour, minute, second, suffixRaw] = exif;
    const suffix = (suffixRaw ?? "").trim();

    if (suffix === "" || suffix.toUpperCase() === "UTC") {
      return `${year}-${month}-${day}T${hour}:${minute}:${second}${suffix ? "Z" : ""}`;
    }

    if (/^[+-]\d{2}:?\d{2}$/.test(suffix)) {
      const normalizedOffset =
        suffix.includes(":")
          ? suffix
          : `${suffix.slice(0, 3)}:${suffix.slice(3)}`;
      return `${year}-${month}-${day}T${hour}:${minute}:${second}${normalizedOffset}`;
    }
  }

  return raw;
}

function formatFloatingDate(value: Date): string {
  const pad = (part: number): string => String(part).padStart(2, "0");

  return (
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
    `T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  );
}

function normalizeColorSpace(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 1) return "sRGB";
    if (value === 65535) return "Uncalibrated";
    return String(value);
  }

  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized === "1") return "sRGB";
  if (normalized === "65535") return "Uncalibrated";
  if (normalized === "RGB") return "RGB";
  return normalized;
}

function findDeepValue(
  source: Record<string, unknown>,
  keys: readonly string[],
  depth = 0,
): unknown {
  if (depth > 6) return undefined;

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }

  for (const [candidateKey, value] of Object.entries(source)) {
    if (
      value !== undefined &&
      value !== null &&
      keys.some((key) => metadataKeyMatches(candidateKey, key))
    ) {
      return value;
    }
  }

  for (const value of Object.values(source)) {
    if (!isRecord(value)) continue;
    const found = findDeepValue(value, keys, depth + 1);
    if (found !== undefined && found !== null) return found;
  }

  return undefined;
}

function findDeepString(
  source: Record<string, unknown>,
  keys: readonly string[],
  depth = 0,
): string | null {
  if (depth > 5) return null;

  const value = findDeepValue(source, keys, depth);
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function metadataKeyMatches(candidate: string, expected: string): boolean {
  const localName = candidate.includes(":")
    ? (candidate.split(":").at(-1) ?? candidate)
    : candidate;

  return normalizeMetadataKey(localName) === normalizeMetadataKey(expected);
}

function normalizeMetadataKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}
