import type {
  LocationInfo,
  MetadataCollection,
  PrivacyAnalysis,
  PrivacyFinding,
  SoftwareInfo,
  TimestampInfo,
} from "../../model/public.js";
import { PRIVACY_FINDING_CODES } from "./privacy-codes.js";

export interface PrivacyAnalysisInput {
  location: LocationInfo | null;
  timestamps: TimestampInfo;
  software: SoftwareInfo | null;
  metadata: MetadataCollection;
}

interface MetadataLeaf {
  key: string;
  path: string;
}

const DEVICE_IDENTIFIER_KEYS = [
  "serialnumber",
  "bodyserialnumber",
  "cameraserialnumber",
  "internalserialnumber",
  "lensserialnumber",
  "deviceid",
  "deviceidentifier",
];

const IDENTITY_KEYS = [
  "artist",
  "author",
  "creator",
  "ownername",
  "cameraownername",
  "byline",
  "credit",
  "copyright",
  "copyrightnotice",
];

const CONTACT_KEYS = [
  "email",
  "emailwork",
  "ciemailwork",
  "phone",
  "telephone",
  "citelwork",
  "ciurlwork",
  "creatorcontactinfo",
  "creatorscontactinfo",
  "creatoremail",
  "creatorphone",
  "creatoraddress",
  "creatorcity",
  "creatorregion",
  "creatorpostalcode",
  "creatorcountry",
  "ciadr",
  "ciadrcity",
  "ciadrcountry",
  "ciadrpcode",
  "ciadrregion",
  "ciadresextadr",
];

export function analyzePrivacy(input: PrivacyAnalysisInput): PrivacyAnalysis {
  const findings: PrivacyFinding[] = [];
  const leaves = flattenMetadata(input.metadata);

  if (
    input.location?.latitude !== null &&
    input.location?.latitude !== undefined &&
    input.location.longitude !== null
  ) {
    findings.push({
      code: PRIVACY_FINDING_CODES.PRECISE_GPS_LOCATION,
      severity: "high",
      path: "location",
      explanation:
        "Precise latitude and longitude are embedded in the image metadata and can reveal where the image was captured.",
    });
  }

  const deviceIdentifierPath = firstMatchingPath(leaves, DEVICE_IDENTIFIER_KEYS);
  if (deviceIdentifierPath !== null) {
    findings.push({
      code: PRIVACY_FINDING_CODES.DEVICE_SERIAL_IDENTIFIER,
      severity: "high",
      path: deviceIdentifierPath,
      explanation:
        "A camera, lens, or device identifier is embedded and may allow images from the same equipment to be correlated.",
    });
  }

  const contactPath = firstMatchingPath(leaves, CONTACT_KEYS);
  if (contactPath !== null) {
    findings.push({
      code: PRIVACY_FINDING_CODES.CREATOR_CONTACT_INFORMATION,
      severity: "high",
      path: contactPath,
      explanation:
        "Creator contact information is embedded in the metadata and may expose personal contact details when the image is shared.",
    });
  }

  const identityPath = firstMatchingPath(leaves, IDENTITY_KEYS);
  if (identityPath !== null) {
    findings.push({
      code: PRIVACY_FINDING_CODES.OWNER_OR_CREATOR_IDENTITY,
      severity: "medium",
      path: identityPath,
      explanation:
        "Owner, author, creator, or copyright identity metadata is present and may identify a person or organization.",
    });
  }

  if (input.timestamps.takenAt !== null) {
    findings.push({
      code: PRIVACY_FINDING_CODES.PRECISE_CAPTURE_TIME,
      severity: "medium",
      path: "timestamps.takenAt",
      explanation:
        "The original capture timestamp is embedded and can reveal when the image was taken.",
    });
  }

  if (input.software?.name !== null && input.software?.name !== undefined) {
    findings.push({
      code: PRIVACY_FINDING_CODES.SOFTWARE_TRACE,
      severity: "low",
      path: "software.name",
      explanation:
        "Software or processing-tool metadata is present and can reveal part of the image creation or editing workflow.",
    });
  }

  if (findings.length > 0) {
    return { status: "findings_detected", findings };
  }

  return {
    status: hasInspectableMetadata(input.metadata)
      ? "no_findings"
      : "insufficient_metadata",
    findings: [],
  };
}

function hasInspectableMetadata(metadata: MetadataCollection): boolean {
  return Object.values(metadata).some(
    (block) =>
      block.status === "present" ||
      block.status === "absent" ||
      block.status === "partial",
  );
}

function firstMatchingPath(
  leaves: readonly MetadataLeaf[],
  aliases: readonly string[],
): string | null {
  for (const leaf of leaves) {
    const normalizedKey = normalizeKey(leaf.key);
    const normalizedPath = normalizeKey(leaf.path);

    if (
      aliases.some(
        (alias) =>
          normalizedKey === alias ||
          normalizedKey.endsWith(alias) ||
          normalizedPath.endsWith(alias),
      )
    ) {
      return leaf.path;
    }
  }

  return null;
}

function flattenMetadata(metadata: MetadataCollection): MetadataLeaf[] {
  const leaves: MetadataLeaf[] = [];

  for (const [section, block] of Object.entries(metadata)) {
    walkValue(block.entries, `metadata.${section}.entries`, leaves);
  }

  return leaves;
}

function walkValue(
  value: unknown,
  path: string,
  output: MetadataLeaf[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkValue(item, `${path}[${index}]`, output));
    return;
  }

  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;

      if (isRecord(child) || Array.isArray(child)) {
        walkValue(child, childPath, output);
      } else if (hasMeaningfulValue(child)) {
        output.push({ key, path: childPath });
      }
    }
  }
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
