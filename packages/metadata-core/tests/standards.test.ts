import { describe, expect, it } from "vitest";
import { detectStandards } from "../src/standards/detect-standards.js";
import type {
  MetadataBlock,
  MetadataCollection,
} from "../src/model/public.js";

describe("standards detection", () => {
  it("extracts available embedded standard versions", () => {
    const metadata = baseMetadata();

    metadata.exif = {
      status: "present",
      entries: { ExifVersion: "0310" },
    };
    metadata.xmp = {
      status: "present",
      entries: { CreatorTool: "Example" },
    };
    metadata.iptc = {
      status: "present",
      entries: { ApplicationRecordVersion: 4 },
    };
    metadata.icc = {
      status: "present",
      entries: { ProfileVersion: "4.3.0" },
    };
    metadata.jfif = {
      status: "present",
      entries: { JFIFVersion: 0x0102 },
    };

    const result = detectStandards(metadata);

    expect(result.exif).toEqual({
      status: "present",
      version: "3.1",
      evidence: ["metadata.exif.entries.ExifVersion"],
    });
    expect(result.xmp).toEqual({
      status: "present",
      version: null,
      evidence: ["metadata.xmp"],
    });
    expect(result.iptc.version).toBe("4");
    expect(result.icc.version).toBe("4.3.0");
    expect(result.jfif.version).toBe("1.02");
  });

  it("preserves absent, malformed, and unsupported states", () => {
    const metadata = baseMetadata();
    metadata.exif = { status: "malformed", entries: {} };
    metadata.icc = { status: "unsupported", entries: {} };

    const result = detectStandards(metadata);

    expect(result.exif).toEqual({
      status: "malformed",
      version: null,
      evidence: [],
    });
    expect(result.icc).toEqual({
      status: "unsupported",
      version: null,
      evidence: [],
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
