import { describe, expect, it } from "vitest";
import { detectFormat } from "../src/formats/detect-format.js";

describe("ISO BMFF MIME detection", () => {
  it("uses the major mif1 brand for MIME while retaining HEIC compatibility", () => {
    const bytes = ftyp("mif1", ["mif1", "heic"]);

    expect(detectFormat(bytes)).toEqual({
      format: "heic",
      mime: "image/heif",
    });
  });

  it("detects sequence MIME from a sequence major brand", () => {
    const bytes = ftyp("hevc", ["hevc", "mif1"]);

    expect(detectFormat(bytes)).toEqual({
      format: "heic",
      mime: "image/heic-sequence",
    });
  });
});

function ftyp(major: string, compatible: string[]): Uint8Array {
  const size = 16 + compatible.length * 4;
  const bytes = new Uint8Array(size);
  writeU32BE(bytes, 0, size);
  writeAscii(bytes, 4, "ftyp");
  writeAscii(bytes, 8, major);
  writeU32BE(bytes, 12, 0);

  compatible.forEach((brand, index) => {
    writeAscii(bytes, 16 + index * 4, brand);
  });

  return bytes;
}

function writeU32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}
