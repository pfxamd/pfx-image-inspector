import { describe, expect, it } from "vitest";
import { analyzePrivacy } from "../src/analysis/privacy/analyze-privacy.js";
import { PRIVACY_FINDING_CODES } from "../src/analysis/privacy/privacy-codes.js";
import type {
  MetadataBlock,
  MetadataCollection,
} from "../src/model/public.js";

describe("privacy analysis", () => {
  it("detects precise location, capture time, and software traces", () => {
    const result = analyzePrivacy({
      location: { latitude: 35.57, longitude: -5.37, altitude: 12 },
      timestamps: {
        takenAt: "2026-01-02T03:04:05.000Z",
        digitizedAt: null,
        modifiedAt: null,
      },
      software: { name: "Example Editor", version: null },
      metadata: metadata({
        exif: { Make: "Canon" },
      }),
    });

    expect(result.status).toBe("findings_detected");
    expect(result.findings.map((finding) => finding.code)).toEqual([
      PRIVACY_FINDING_CODES.PRECISE_GPS_LOCATION,
      PRIVACY_FINDING_CODES.PRECISE_CAPTURE_TIME,
      PRIVACY_FINDING_CODES.SOFTWARE_TRACE,
    ]);
  });

  it("detects device identifiers, identity, and nested creator contact data", () => {
    const result = analyzePrivacy({
      location: null,
      timestamps: {
        takenAt: null,
        digitizedAt: null,
        modifiedAt: null,
      },
      software: null,
      metadata: metadata({
        exif: {
          BodySerialNumber: "hidden-from-finding",
          Artist: "Example Author",
        },
        xmp: {
          "Iptc4xmpCore:CreatorContactInfo": {
            "Iptc4xmpCore:CiEmailWork": "author@example.test",
          },
        },
      }),
    });

    expect(result.findings.map((finding) => finding.code)).toEqual([
      PRIVACY_FINDING_CODES.DEVICE_SERIAL_IDENTIFIER,
      PRIVACY_FINDING_CODES.CREATOR_CONTACT_INFORMATION,
      PRIVACY_FINDING_CODES.OWNER_OR_CREATOR_IDENTITY,
    ]);

    expect(JSON.stringify(result.findings)).not.toContain("hidden-from-finding");
    expect(JSON.stringify(result.findings)).not.toContain("author@example.test");
  });

  it("returns no_findings when supported metadata was inspected cleanly", () => {
    const result = analyzePrivacy({
      location: null,
      timestamps: {
        takenAt: null,
        digitizedAt: null,
        modifiedAt: null,
      },
      software: null,
      metadata: metadata({
        exif: { Make: "Canon", Model: "EOS R5" },
      }),
    });

    expect(result).toEqual({ status: "no_findings", findings: [] });
  });

  it("returns insufficient_metadata when nothing could be inspected", () => {
    const result = analyzePrivacy({
      location: null,
      timestamps: {
        takenAt: null,
        digitizedAt: null,
        modifiedAt: null,
      },
      software: null,
      metadata: unsupportedMetadata(),
    });

    expect(result).toEqual({
      status: "insufficient_metadata",
      findings: [],
    });
  });
});

function metadata(
  sections: Partial<Record<keyof MetadataCollection, Record<string, unknown>>>,
): MetadataCollection {
  const empty = (): MetadataBlock => ({ status: "absent", entries: {} });

  return {
    exif:
      sections.exif === undefined
        ? empty()
        : { status: "present", entries: sections.exif },
    xmp:
      sections.xmp === undefined
        ? empty()
        : { status: "present", entries: sections.xmp },
    iptc:
      sections.iptc === undefined
        ? empty()
        : { status: "present", entries: sections.iptc },
    icc:
      sections.icc === undefined
        ? empty()
        : { status: "present", entries: sections.icc },
    jfif:
      sections.jfif === undefined
        ? empty()
        : { status: "present", entries: sections.jfif },
  };
}

function unsupportedMetadata(): MetadataCollection {
  const block = (): MetadataBlock => ({ status: "unsupported", entries: {} });

  return {
    exif: block(),
    xmp: block(),
    iptc: block(),
    icc: block(),
    jfif: block(),
  };
}
