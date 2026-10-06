import { describe, expect, it } from "vitest";
import { detectJpegDimensions } from "../src/formats/jpeg.js";
import { detectPngDimensions } from "../src/formats/png.js";

describe("structural image dimensions", () => {
  it("reads JPEG SOF dimensions", () => {
    const bytes = Uint8Array.from([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11,
      0x08,
      0x01, 0xe0,
      0x02, 0x80,
      0x03,
      0x01, 0x11, 0x00,
      0x02, 0x11, 0x00,
      0x03, 0x11, 0x00,
      0xff, 0xd9,
    ]);

    expect(detectJpegDimensions(bytes)).toMatchObject({
      width: 640,
      height: 480,
      precision: 8,
    });
  });

  it("reads PNG IHDR dimensions", () => {
    const bytes = new Uint8Array(33);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    writeU32BE(bytes, 8, 13);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    writeU32BE(bytes, 16, 1024);
    writeU32BE(bytes, 20, 768);
    bytes[24] = 8;
    bytes[25] = 6;

    expect(detectPngDimensions(bytes)).toMatchObject({
      width: 1024,
      height: 768,
      bitDepth: 8,
      colorType: 6,
    });
  });
});

function writeU32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}
