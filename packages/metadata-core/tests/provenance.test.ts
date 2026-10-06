import { describe, expect, it } from "vitest";
import { detectC2paPresence } from "../src/provenance/c2pa.js";

const MANIFEST_UUID = Uint8Array.from([
  0x63, 0x32, 0x70, 0x61, 0x00, 0x11, 0x00, 0x10,
  0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71,
]);

const BMFF_UUID = Uint8Array.from([
  0xd8, 0xfe, 0xc3, 0xd6, 0x1b, 0x0e, 0x48, 0x3c,
  0x92, 0x97, 0x58, 0x28, 0x87, 0x7e, 0xc4, 0x81,
]);

describe("C2PA presence detection", () => {
  it("detects JPEG APP11 C2PA JUMBF", () => {
    const length = MANIFEST_UUID.length + 2;
    const bytes = Uint8Array.from([
      0xff, 0xd8,
      0xff, 0xeb, (length >> 8) & 0xff, length & 0xff,
      ...MANIFEST_UUID,
      0xff, 0xd9,
    ]);

    expect(detectC2paPresence(bytes, "jpeg")).toMatchObject({
      status: "detected",
      embedding: "jpeg_app11",
    });
  });

  it("detects PNG caBX chunk", () => {
    const bytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 0, 0x63, 0x61, 0x42, 0x58, 0, 0, 0, 0,
    ]);

    expect(detectC2paPresence(bytes, "png")).toMatchObject({
      status: "detected",
      embedding: "png_caBX",
    });
  });

  it("detects WebP C2PA chunk", () => {
    const bytes = Uint8Array.from([
      ...ascii("RIFF"), 12, 0, 0, 0, ...ascii("WEBP"),
      ...ascii("C2PA"), 4, 0, 0, 0, 1, 2, 3, 4,
    ]);

    expect(detectC2paPresence(bytes, "webp")).toMatchObject({
      status: "detected",
      embedding: "webp_C2PA",
    });
  });

  it("detects TIFF C2PA tag 0xCD41", () => {
    const bytes = new Uint8Array(26);
    const view = new DataView(bytes.buffer);
    bytes[0] = 0x49;
    bytes[1] = 0x49;
    view.setUint16(2, 42, true);
    view.setUint32(4, 8, true);
    view.setUint16(8, 1, true);
    view.setUint16(10, 0xcd41, true);
    view.setUint16(12, 7, true);
    view.setUint32(14, 1, true);
    bytes[18] = 1;
    view.setUint32(22, 0, true);

    expect(detectC2paPresence(bytes, "tiff")).toMatchObject({
      status: "detected",
      embedding: "tiff_tag_0xcd41",
    });
  });

  it("detects BMFF C2PA uuid manifest box", () => {
    const ftyp = box("ftyp", Uint8Array.from([...ascii("avif"), 0, 0, 0, 0]));
    const purpose = Uint8Array.from([...ascii("manifest"), 0]);
    const payload = Uint8Array.from([
      ...BMFF_UUID,
      0, 0, 0, 0,
      ...purpose,
      0, 0, 0, 0, 0, 0, 0, 0,
      ...MANIFEST_UUID,
    ]);
    const uuid = box("uuid", payload);
    const bytes = concat([ftyp, uuid]);

    expect(detectC2paPresence(bytes, "avif")).toMatchObject({
      status: "detected",
      embedding: "bmff_uuid",
    });
  });

  it("returns not_detected for a valid container without C2PA", () => {
    const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    expect(detectC2paPresence(bytes, "jpeg").status).toBe("not_detected");
  });

  it("returns malformed when the container cannot be scanned safely", () => {
    const bytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 20, ...ascii("caBX"), 1, 2,
    ]);

    expect(detectC2paPresence(bytes, "png").status).toBe("malformed");
  });
});

function box(type: string, payload: Uint8Array): Uint8Array {
  const size = 8 + payload.length;
  return Uint8Array.from([
    (size >>> 24) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 8) & 0xff,
    size & 0xff,
    ...ascii(type),
    ...payload,
  ]);
}

function ascii(value: string): number[] {
  return Array.from(value, (character) => character.charCodeAt(0));
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}
