import type { InspectionWarning } from "../model/public.js";

export interface IccParseResult {
  entries: Record<string, unknown>;
  warnings: InspectionWarning[];
}

export function parseIccProfile(bytes: Uint8Array): IccParseResult {
  const warnings: InspectionWarning[] = [];
  if (bytes.length < 128) {
    return {
      entries: {},
      warnings: [
        {
          code: "ICC_PROFILE_TRUNCATED",
          message: "ICC profile is shorter than the required 128-byte header.",
        },
      ],
    };
  }

  const entries: Record<string, unknown> = {
    ProfileSize: readU32BE(bytes, 0),
    ProfileCMMType: ascii(bytes, 4, 8).trim() || null,
    ProfileVersion: parseVersion(bytes),
    ProfileClass: ascii(bytes, 12, 16).trim() || null,
    ColorSpaceData: ascii(bytes, 16, 20).trim() || null,
    ProfileConnectionSpace: ascii(bytes, 20, 24).trim() || null,
    ProfileFileSignature: ascii(bytes, 36, 40),
    PrimaryPlatform: ascii(bytes, 40, 44).trim() || null,
    DeviceManufacturer: ascii(bytes, 48, 52).trim() || null,
    DeviceModel: ascii(bytes, 52, 56).trim() || null,
    RenderingIntent: readU32BE(bytes, 64),
    ProfileCreator: ascii(bytes, 80, 84).trim() || null,
  };

  if (entries.ProfileFileSignature !== "acsp") {
    warnings.push({
      code: "ICC_SIGNATURE_INVALID",
      message: "ICC profile header does not contain the required acsp signature.",
    });
  }

  const declaredSize = entries.ProfileSize;
  if (
    typeof declaredSize === "number" &&
    declaredSize !== 0 &&
    declaredSize !== bytes.length
  ) {
    warnings.push({
      code: "ICC_SIZE_MISMATCH",
      message: "ICC profile size field does not match the embedded profile length.",
    });
  }

  const description = parseDescriptionTag(bytes, warnings);
  if (description !== null) entries.ProfileDescription = description;

  for (const key of Object.keys(entries)) {
    if (entries[key] === null) delete entries[key];
  }

  return { entries, warnings };
}

function parseDescriptionTag(
  bytes: Uint8Array,
  warnings: InspectionWarning[],
): string | null {
  if (bytes.length < 132) return null;

  const count = readU32BE(bytes, 128);
  if (count > 4096 || 132 + count * 12 > bytes.length) {
    warnings.push({
      code: "ICC_TAG_TABLE_INVALID",
      message: "ICC tag table is truncated or has an unreasonable entry count.",
    });
    return null;
  }

  for (let index = 0; index < count; index += 1) {
    const recordOffset = 132 + index * 12;
    const signature = ascii(bytes, recordOffset, recordOffset + 4);
    if (signature !== "desc") continue;

    const dataOffset = readU32BE(bytes, recordOffset + 4);
    const dataSize = readU32BE(bytes, recordOffset + 8);
    if (dataOffset + dataSize > bytes.length || dataSize < 12) {
      warnings.push({
        code: "ICC_DESCRIPTION_INVALID",
        message: "ICC profile description tag points outside the embedded profile.",
      });
      return null;
    }

    const type = ascii(bytes, dataOffset, dataOffset + 4);
    if (type === "desc") return parseDesc(bytes, dataOffset, dataSize);
    if (type === "mluc") return parseMluc(bytes, dataOffset, dataSize);
  }

  return null;
}

function parseDesc(
  bytes: Uint8Array,
  offset: number,
  size: number,
): string | null {
  if (size < 12) return null;
  const length = readU32BE(bytes, offset + 8);
  if (length === 0 || offset + 12 + length > offset + size) return null;

  const text = ascii(bytes, offset + 12, offset + 12 + length - 1).trim();
  return text.length > 0 ? text : null;
}

function parseMluc(
  bytes: Uint8Array,
  offset: number,
  size: number,
): string | null {
  if (size < 28) return null;

  const count = readU32BE(bytes, offset + 8);
  const recordSize = readU32BE(bytes, offset + 12);
  if (
    count === 0 ||
    recordSize < 12 ||
    offset + 16 + count * recordSize > offset + size
  ) {
    return null;
  }

  const records: Array<{
    language: string;
    country: string;
    text: string;
  }> = [];

  for (let index = 0; index < count; index += 1) {
    const record = offset + 16 + index * recordSize;
    const language = ascii(bytes, record, record + 2).toLowerCase();
    const country = ascii(bytes, record + 2, record + 4).toUpperCase();
    const length = readU32BE(bytes, record + 4);
    const relativeOffset = readU32BE(bytes, record + 8);
    const textOffset = offset + relativeOffset;

    if (
      length === 0 ||
      length % 2 !== 0 ||
      textOffset < offset ||
      textOffset + length > offset + size
    ) {
      continue;
    }

    const chars: number[] = [];
    for (let cursor = textOffset; cursor < textOffset + length; cursor += 2) {
      chars.push(((bytes[cursor] ?? 0) << 8) | (bytes[cursor + 1] ?? 0));
    }

    const text = String.fromCharCode(...chars).trim();
    if (text.length > 0) records.push({ language, country, text });
  }

  if (records.length === 0) return null;

  return (
    records.find(
      (record) => record.language === "en" && record.country === "US",
    )?.text ??
    records.find((record) => record.language === "en")?.text ??
    records[0]?.text ??
    null
  );
}

function parseVersion(bytes: Uint8Array): string {
  const major = bytes[8] ?? 0;
  const minor = (bytes[9] ?? 0) >> 4;
  const bugfix = (bytes[9] ?? 0) & 0x0f;
  return `${major}.${minor}.${bugfix}`;
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

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let value = "";
  for (let index = start; index < end; index += 1) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }
  return value;
}
