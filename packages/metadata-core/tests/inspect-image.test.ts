import { describe, expect, it } from "vitest";
import { INSPECTION_ERROR_CODES, InspectionError, inspectImage } from "../src/index.js";

const ascii = (value: string): number[] => Array.from(value, (char) => char.charCodeAt(0));

function bmff(brand: string): Uint8Array {
  return Uint8Array.from([
    0x00,
    0x00,
    0x00,
    0x18,
    ...ascii("ftyp"),
    ...ascii(brand),
    0x00,
    0x00,
    0x00,
    0x00,
    ...ascii(brand),
  ]);
}

describe("inspectImage format detection", () => {
  it.each([
    ["jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])],
    ["png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["webp", Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")])],
    ["tiff", Uint8Array.from([0x49, 0x49, 0x2a, 0x00])],
    ["heic", bmff("heic")],
    ["heif", bmff("mif1")],
    ["avif", bmff("avif")],
  ] as const)("detects %s", async (format, bytes) => {
    const result = await inspectImage(bytes);
    expect(result.file.format).toBe(format);
    expect(result.schemaVersion).toBe("0.1.0");
  });

  it("rejects unsupported input", async () => {
    try {
      await inspectImage(Uint8Array.from([1, 2, 3, 4]));
      throw new Error("Expected inspectImage to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(InspectionError);
      expect((error as InspectionError).code).toBe(INSPECTION_ERROR_CODES.UNSUPPORTED_FORMAT);
    }
  });

  it("supports cancellation before inspection", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      inspectImage(Uint8Array.from([0xff, 0xd8]), { signal: controller.signal }),
    ).rejects.toMatchObject({ code: INSPECTION_ERROR_CODES.ABORTED });
  });
});
