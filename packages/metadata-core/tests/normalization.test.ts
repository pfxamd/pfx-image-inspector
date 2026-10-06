import { describe, expect, it } from "vitest";
import type { AdapterExtractionResult } from "../src/adapters/adapter.js";
import { normalizeExtractions } from "../src/normalize/normalize-extractions.js";

describe("metadata normalization", () => {
  it("maps adapter data into the PFx canonical model", () => {
    const extraction: AdapterExtractionResult = {
      adapterId: "fixture",
      state: "success",
      capabilities: {
        exif: true,
        xmp: true,
        iptc: true,
        icc: true,
        jfif: false,
      },
      sources: {
        image: {
          ImageWidth: 4032,
          ImageHeight: 3024,
          Orientation: "Horizontal (normal)",
          Make: "Canon",
          Model: "EOS R5",
          XResolution: 72,
          YResolution: 72,
          ResolutionUnit: "inches",
          Software: "Camera Firmware",
        },
        photo: {
          ExifVersion: "0310",
          ISO: 100,
          FNumber: 2.8,
          FocalLength: 50,
          ExposureTime: 0.008,
          DateTimeOriginal: new Date("2026-01-02T03:04:05Z"),
          ColorSpace: "sRGB",
        },
        gps: {
          latitude: 35.57,
          longitude: -5.37,
          GPSAltitude: 18,
        },
        xmp: {
          CreatorTool: "PFx Test",
        },
        icc: {
          ProfileVersion: "4.3.0",
          ProfileDescription: "sRGB IEC61966-2.1",
        },
        iptc: {
          ApplicationRecordVersion: 4,
          CopyrightNotice: "Example",
        },
      },
      raw: { fixture: true },
      warnings: [],
    };

    const result = normalizeExtractions([extraction]);

    expect(result.image).toMatchObject({
      width: 4032,
      height: 3024,
      orientation: 1,
      dpi: { x: 72, y: 72 },
    });
    expect(result.camera).toMatchObject({
      make: "Canon",
      model: "EOS R5",
      iso: 100,
      aperture: 2.8,
      focalLength: 50,
    });
    expect(result.location).toEqual({
      latitude: 35.57,
      longitude: -5.37,
      altitude: 18,
    });
    expect(result.color).toEqual({
      colorSpace: "sRGB",
      profileName: "sRGB IEC61966-2.1",
    });
    expect(result.timestamps.takenAt).toBe("2026-01-02T03:04:05.000Z");
    expect(result.metadata.exif.status).toBe("present");
    expect(result.metadata.xmp.status).toBe("present");
    expect(result.metadata.iptc.status).toBe("present");
    expect(result.metadata.icc.status).toBe("present");
    expect(result.metadata.jfif.status).toBe("unsupported");
    expect(result.standards.exif.version).toBe("3.1");
    expect(result.standards.iptc.version).toBe("4");
    expect(result.standards.icc.version).toBe("4.3.0");
  });

  it("marks supported metadata malformed when its adapter fails", () => {
    const extraction: AdapterExtractionResult = {
      adapterId: "fixture",
      state: "failed",
      capabilities: {
        exif: true,
        xmp: true,
        iptc: false,
        icc: false,
        jfif: false,
      },
      sources: {},
      raw: {},
      warnings: [],
    };

    const result = normalizeExtractions([extraction]);

    expect(result.metadata.exif.status).toBe("malformed");
    expect(result.metadata.xmp.status).toBe("malformed");
    expect(result.metadata.iptc.status).toBe("unsupported");
  });
});
