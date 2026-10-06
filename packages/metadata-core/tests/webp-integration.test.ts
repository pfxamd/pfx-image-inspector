import { describe, expect, it } from "vitest";
import { inspectImage } from "../src/index.js";

describe("native WebP metadata adapter", () => {
  it("reads dimensions, EXIF, XMP, and ICC from extended WebP", async () => {
    const result = await inspectImage(createExtendedWebP(), { includeRaw: true });

    expect(result.file.format).toBe("webp");
    expect(result.image).toMatchObject({
      width: 320,
      height: 240,
      bitDepth: 8,
    });
    expect(result.camera?.make).toBe("Canon");
    expect(result.metadata.exif.status).toBe("present");
    expect(result.metadata.xmp.status).toBe("present");
    expect(result.metadata.icc.status).toBe("present");
    expect(result.metadata.iptc.status).toBe("unsupported");
    expect(result.standards.icc.version).toBe("4.3.0");
    expect(result.color?.colorSpace).toBe("RGB");
    expect(result.software?.name).toBe("PFx Lab");
    expect(result.privacy.status).toBe("findings_detected");
    expect(result.privacy.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "CREATOR_CONTACT_INFORMATION",
        "OWNER_OR_CREATOR_IDENTITY",
        "SOFTWARE_TRACE",
      ]),
    );
    expect(result.raw).toHaveProperty("webp-native");
  });

  it("reads dimensions from a simple VP8L WebP", async () => {
    const result = await inspectImage(
      riff([chunk("VP8L", vp8lPayload(123, 77))]),
    );

    expect(result.image.width).toBe(123);
    expect(result.image.height).toBe(77);
    expect(result.metadata.exif.status).toBe("absent");
    expect(result.metadata.xmp.status).toBe("absent");
    expect(result.metadata.icc.status).toBe("absent");
  });

  it("reports VP8X metadata flag mismatches without failing inspection", async () => {
    const vp8x = vp8xPayload(100, 50, 0x08);
    const result = await inspectImage(
      riff([
        chunk("VP8X", vp8x),
        chunk("VP8L", vp8lPayload(100, 50)),
      ]),
    );

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "WEBP_FEATURE_FLAG_MISMATCH" }),
      ]),
    );
  });
});

function createExtendedWebP(): Uint8Array {
  const xmp = new TextEncoder().encode(
    '<x:xmpmeta xmlns:x="adobe:ns:meta/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/"><rdf:RDF><rdf:Description xmp:CreatorTool="PFx Lab" photoshop:Credit="Example Author" Iptc4xmpCore:CiEmailWork="author@example.test"/></rdf:RDF></x:xmpmeta>',
  );

  return riff([
    chunk("VP8X", vp8xPayload(320, 240, 0x2c)),
    chunk("ICCP", iccProfile()),
    chunk("VP8L", vp8lPayload(320, 240)),
    chunk("EXIF", tiffExif()),
    chunk("XMP ", xmp),
  ]);
}

function vp8xPayload(width: number, height: number, flags: number): Uint8Array {
  const data = new Uint8Array(10);
  data[0] = flags;
  writeU24LE(data, 4, width - 1);
  writeU24LE(data, 7, height - 1);
  return data;
}

function vp8lPayload(width: number, height: number): Uint8Array {
  const data = new Uint8Array(5);
  data[0] = 0x2f;
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  writeU32LE(data, 1, bits >>> 0);
  return data;
}

function tiffExif(): Uint8Array {
  const make = new TextEncoder().encode("Canon\0");
  const entryCount = 3;
  const ifdOffset = 8;
  const entriesOffset = ifdOffset + 2;
  const nextIfdOffset = entriesOffset + entryCount * 12;
  const makeOffset = nextIfdOffset + 4;

  const bytes = new Uint8Array(makeOffset + make.length);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);
  view.setUint16(ifdOffset, entryCount, true);

  writeTiffLong(view, entriesOffset, 0x0100, 320);
  writeTiffLong(view, entriesOffset + 12, 0x0101, 240);
  writeTiffOffset(view, entriesOffset + 24, 0x010f, 2, make.length, makeOffset);
  view.setUint32(nextIfdOffset, 0, true);
  bytes.set(make, makeOffset);
  return bytes;
}

function iccProfile(): Uint8Array {
  const bytes = new Uint8Array(132);
  writeU32BE(bytes, 0, bytes.length);
  writeAscii(bytes, 4, "PFx ");
  bytes[8] = 4;
  bytes[9] = 0x30;
  writeAscii(bytes, 12, "mntr");
  writeAscii(bytes, 16, "RGB ");
  writeAscii(bytes, 20, "XYZ ");
  writeAscii(bytes, 36, "acsp");
  writeAscii(bytes, 40, "APPL");
  writeAscii(bytes, 48, "PFx ");
  writeAscii(bytes, 52, "0001");
  writeAscii(bytes, 80, "PFx ");
  writeU32BE(bytes, 128, 0);
  return bytes;
}

function riff(chunks: readonly Uint8Array[]): Uint8Array {
  const payloadSize = 4 + chunks.reduce((sum, item) => sum + item.length, 0);
  const bytes = new Uint8Array(8 + payloadSize);
  writeAscii(bytes, 0, "RIFF");
  writeU32LE(bytes, 4, payloadSize);
  writeAscii(bytes, 8, "WEBP");

  let offset = 12;
  for (const item of chunks) {
    bytes.set(item, offset);
    offset += item.length;
  }
  return bytes;
}

function chunk(fourCC: string, data: Uint8Array): Uint8Array {
  const padded = data.length + (data.length & 1);
  const bytes = new Uint8Array(8 + padded);
  writeAscii(bytes, 0, fourCC);
  writeU32LE(bytes, 4, data.length);
  bytes.set(data, 8);
  return bytes;
}

function writeTiffLong(
  view: DataView,
  offset: number,
  tag: number,
  value: number,
): void {
  writeTiffOffset(view, offset, tag, 4, 1, value);
}

function writeTiffOffset(
  view: DataView,
  offset: number,
  tag: number,
  type: number,
  count: number,
  value: number,
): void {
  view.setUint16(offset, tag, true);
  view.setUint16(offset + 2, type, true);
  view.setUint32(offset + 4, count, true);
  view.setUint32(offset + 8, value, true);
}

function writeU24LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

function writeU32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
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
