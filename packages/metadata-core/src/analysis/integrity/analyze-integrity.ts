import type {
  ImageInfo,
  IntegrityAnalysis,
  IntegrityFinding,
  LocationInfo,
  MetadataCollection,
  TimestampInfo,
} from "../../model/public.js";
import { INTEGRITY_FINDING_CODES } from "./integrity-codes.js";

export interface IntegrityAnalysisInput {
  image: ImageInfo;
  location: LocationInfo | null;
  timestamps: TimestampInfo;
  metadata: MetadataCollection;
}

interface MetadataLeaf {
  section: keyof MetadataCollection;
  key: string;
  path: string;
  value: unknown;
}

const TIMESTAMP_KEYS = new Set([
  "datetimeoriginal",
  "datetime",
  "datetimecreated",
  "datecreated",
  "createdate",
  "datetimedigitized",
  "modifydate",
  "datetimemodified",
]);

const IDENTITY_KEYS = new Set([
  "make",
  "model",
  "bodyserialnumber",
  "cameraserialnumber",
  "lensserialnumber",
  "imageuniqueid",
]);

export function analyzeIntegrity(input: IntegrityAnalysisInput): IntegrityAnalysis {
  const findings: IntegrityFinding[] = [];
  const leaves = flattenMetadata(input.metadata);

  for (const [section, block] of Object.entries(input.metadata) as Array<
    [keyof MetadataCollection, MetadataCollection[keyof MetadataCollection]]
  >) {
    if (block.status === "malformed") {
      findings.push({
        code: INTEGRITY_FINDING_CODES.MALFORMED_METADATA_BLOCK,
        severity: "warning",
        paths: [`metadata.${section}`],
        explanation:
          "A metadata block could not be parsed cleanly. Other recovered fields may still be usable, but this block should not be treated as complete.",
      });
    }
  }

  if (
    input.location !== null &&
    ((input.location.latitude !== null &&
      (input.location.latitude < -90 || input.location.latitude > 90)) ||
      (input.location.longitude !== null &&
        (input.location.longitude < -180 || input.location.longitude > 180)))
  ) {
    findings.push({
      code: INTEGRITY_FINDING_CODES.INVALID_GPS_COORDINATES,
      severity: "high",
      paths: ["location.latitude", "location.longitude"],
      explanation:
        "The recovered GPS coordinates fall outside valid geographic latitude or longitude ranges.",
    });
  }

  const orientationLeaves = leaves.filter(
    (leaf) => normalizeKey(leaf.key) === "orientation",
  );
  if (
    orientationLeaves.length > 0 &&
    input.image.orientation === null &&
    orientationLeaves.some((leaf) => hasMeaningfulValue(leaf.value))
  ) {
    findings.push({
      code: INTEGRITY_FINDING_CODES.INVALID_ORIENTATION_VALUE,
      severity: "warning",
      paths: orientationLeaves.map((leaf) => leaf.path),
      explanation:
        "An orientation tag is present but its value is not a valid EXIF orientation from 1 through 8.",
    });
  }

  if (
    (input.image.width !== null && input.image.width <= 0) ||
    (input.image.height !== null && input.image.height <= 0)
  ) {
    findings.push({
      code: INTEGRITY_FINDING_CODES.INVALID_IMAGE_DIMENSIONS,
      severity: "high",
      paths: ["image.width", "image.height"],
      explanation:
        "The recovered image dimensions contain a non-positive width or height.",
    });
  }

  findings.push(...detectTimestampConflicts(leaves));
  findings.push(...detectIdentityConflicts(leaves));

  if (findings.length > 0) {
    return { status: "issues_detected", findings };
  }

  return {
    status: hasInspectableMetadata(input.metadata)
      ? "no_issues_detected"
      : "insufficient_metadata",
    findings: [],
  };
}

function detectTimestampConflicts(
  leaves: readonly MetadataLeaf[],
): IntegrityFinding[] {
  const groups = groupComparableLeaves(
    leaves.filter((leaf) => TIMESTAMP_KEYS.has(normalizeKey(leaf.key))),
  );

  for (const [key, group] of groups) {
    if (group.length < 2) continue;

    const normalizedValues = new Map<string, MetadataLeaf[]>();

    for (const leaf of group) {
      const comparable = normalizeTimestampValue(leaf.value);
      if (comparable === null) continue;

      const existing = normalizedValues.get(comparable) ?? [];
      existing.push(leaf);
      normalizedValues.set(comparable, existing);
    }

    if (normalizedValues.size > 1) {
      return [
        {
          code: INTEGRITY_FINDING_CODES.TIMESTAMP_CONFLICT,
          severity: "warning",
          paths: group.map((leaf) => leaf.path),
          explanation:
            `Equivalent timestamp field "${key}" appears with conflicting values in different metadata sections.`,
        },
      ];
    }
  }

  return [];
}

function detectIdentityConflicts(
  leaves: readonly MetadataLeaf[],
): IntegrityFinding[] {
  const groups = groupComparableLeaves(
    leaves.filter((leaf) => IDENTITY_KEYS.has(normalizeKey(leaf.key))),
  );

  const findings: IntegrityFinding[] = [];

  for (const [key, group] of groups) {
    if (group.length < 2) continue;

    const values = new Set(
      group
        .map((leaf) => normalizePrimitiveValue(leaf.value))
        .filter((value): value is string => value !== null),
    );

    if (values.size > 1) {
      findings.push({
        code: INTEGRITY_FINDING_CODES.IDENTITY_METADATA_CONFLICT,
        severity: "warning",
        paths: group.map((leaf) => leaf.path),
        explanation:
          `Equivalent identity field "${key}" appears with conflicting values in different metadata sections.`,
      });
    }
  }

  return findings;
}

function groupComparableLeaves(
  leaves: readonly MetadataLeaf[],
): Map<string, MetadataLeaf[]> {
  const groups = new Map<string, MetadataLeaf[]>();

  for (const leaf of leaves) {
    const key = normalizeKey(leaf.key);
    const existing = groups.get(key) ?? [];

    if (!existing.some((item) => item.section === leaf.section)) {
      existing.push(leaf);
      groups.set(key, existing);
    }
  }

  return groups;
}

function normalizeTimestampValue(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value !== "string" || value.trim().length === 0) return null;

  const trimmed = value.trim();
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();

  return trimmed.replace(/\s+/g, " ");
}

function normalizePrimitiveValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function flattenMetadata(metadata: MetadataCollection): MetadataLeaf[] {
  const leaves: MetadataLeaf[] = [];

  for (const [section, block] of Object.entries(metadata) as Array<
    [keyof MetadataCollection, MetadataCollection[keyof MetadataCollection]]
  >) {
    walkValue(block.entries, section, `metadata.${section}.entries`, leaves);
  }

  return leaves;
}

function walkValue(
  value: unknown,
  section: keyof MetadataCollection,
  path: string,
  output: MetadataLeaf[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      walkValue(item, section, `${path}[${index}]`, output),
    );
    return;
  }

  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;

    if (isRecord(child) || Array.isArray(child)) {
      walkValue(child, section, childPath, output);
    } else if (hasMeaningfulValue(child)) {
      output.push({ section, key, path: childPath, value: child });
    }
  }
}

function hasInspectableMetadata(metadata: MetadataCollection): boolean {
  return Object.values(metadata).some(
    (block) =>
      block.status === "present" ||
      block.status === "absent" ||
      block.status === "partial",
  );
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function normalizeKey(value: string): string {
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
