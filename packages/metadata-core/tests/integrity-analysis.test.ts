import { describe, expect, it } from "vitest";
import { analyzeIntegrity } from "../src/analysis/integrity/analyze-integrity.js";
import { INTEGRITY_FINDING_CODES } from "../src/analysis/integrity/integrity-codes.js";
import type {
  ImageInfo,
  MetadataBlock,
  MetadataCollection,
} from "../src/model/public.js";

const cleanImage: ImageInfo = {
  width: 4000,
  height: 3000,
  orientation: 1,
  dpi: null,
  bitDepth: 8,
};

describe("integrity analysis", () => {
  it("detects malformed blocks and invalid normalized values", () => {
    const metadata = baseMetadata();
    metadata.xmp = { status: "malformed", entries: {} };
    metadata.exif = {
      status: "present",
      entries: { Orientation: 99 },
    };

    const result = analyzeIntegrity({
      image: { ...cleanImage, orientation: null, width: 0 },
      location: { latitude: 91, longitude: -181, altitude: null },
      timestamps: { takenAt: null, digitizedAt: null, modifiedAt: null },
      metadata,
    });

    expect(result.status).toBe("issues_detected");
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        INTEGRITY_FINDING_CODES.MALFORMED_METADATA_BLOCK,
        INTEGRITY_FINDING_CODES.INVALID_GPS_COORDINATES,
        INTEGRITY_FINDING_CODES.INVALID_ORIENTATION_VALUE,
        INTEGRITY_FINDING_CODES.INVALID_IMAGE_DIMENSIONS,
      ]),
    );
  });

  it("detects conflicting equivalent timestamps across metadata sections", () => {
    const metadata = baseMetadata();
    metadata.exif = {
      status: "present",
      entries: { DateTimeOriginal: "2026-01-01T10:00:00Z" },
    };
    metadata.xmp = {
      status: "present",
      entries: { DateTimeOriginal: "2026-01-01T11:00:00Z" },
    };

    const result = analyzeIntegrity({
      image: cleanImage,
      location: null,
      timestamps: {
        takenAt: "2026-01-01T10:00:00Z",
        digitizedAt: null,
        modifiedAt: null,
      },
      metadata,
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        code: INTEGRITY_FINDING_CODES.TIMESTAMP_CONFLICT,
      }),
    ]);
  });

  it("detects conflicting stable identity metadata", () => {
    const metadata = baseMetadata();
    metadata.exif = {
      status: "present",
      entries: { Make: "Canon", Model: "EOS R5" },
    };
    metadata.xmp = {
      status: "present",
      entries: { Make: "Sony", Model: "EOS R5" },
    };

    const result = analyzeIntegrity({
      image: cleanImage,
      location: null,
      timestamps: { takenAt: null, digitizedAt: null, modifiedAt: null },
      metadata,
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        code: INTEGRITY_FINDING_CODES.IDENTITY_METADATA_CONFLICT,
      }),
    ]);
  });

  it("does not flag matching equivalent fields", () => {
    const metadata = baseMetadata();
    metadata.exif = {
      status: "present",
      entries: {
        Make: "Canon",
        DateTimeOriginal: "2026-01-01T10:00:00Z",
      },
    };
    metadata.xmp = {
      status: "present",
      entries: {
        Make: "canon",
        DateTimeOriginal: "2026-01-01T10:00:00Z",
      },
    };

    const result = analyzeIntegrity({
      image: cleanImage,
      location: null,
      timestamps: {
        takenAt: "2026-01-01T10:00:00Z",
        digitizedAt: null,
        modifiedAt: null,
      },
      metadata,
    });

    expect(result).toEqual({ status: "no_issues_detected", findings: [] });
  });

  it("returns insufficient_metadata when nothing was inspectable", () => {
    const result = analyzeIntegrity({
      image: {
        width: null,
        height: null,
        orientation: null,
        dpi: null,
        bitDepth: null,
      },
      location: null,
      timestamps: { takenAt: null, digitizedAt: null, modifiedAt: null },
      metadata: unsupportedMetadata(),
    });

    expect(result).toEqual({
      status: "insufficient_metadata",
      findings: [],
    });
  });
});

function baseMetadata(): MetadataCollection {
  const block = (): MetadataBlock => ({ status: "absent", entries: {} });

  return {
    exif: block(),
    xmp: block(),
    iptc: block(),
    icc: block(),
    jfif: block(),
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
