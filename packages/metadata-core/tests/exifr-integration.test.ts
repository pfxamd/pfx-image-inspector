import { describe, expect, it } from "vitest";
import { inspectImage } from "../src/index.js";

describe("exifr adapter integration", () => {
  it("reads a minimal TIFF through the public PFx API", async () => {
    const result = await inspectImage(createMinimalTiff());

    expect(result.file.format).toBe("tiff");
    expect(result.image.width).toBe(640);
    expect(result.image.height).toBe(480);
    expect(result.image.orientation).toBe(1);
    expect(result.camera?.make).toBe("Canon");
    expect(result.metadata.exif.status).toBe("present");
    expect(result.privacy.status).toBe("no_findings");
  });
});

function createMinimalTiff(): Uint8Array {
  const make = new TextEncoder().encode("Canon\0");
  const entryCount = 4;
  const ifdOffset = 8;
  const entriesOffset = ifdOffset + 2;
  const nextIfdOffset = entriesOffset + entryCount * 12;
  const makeOffset = nextIfdOffset + 4;

  const bytes = new Uint8Array(makeOffset + make.byteLength);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);
  view.setUint16(ifdOffset, entryCount, true);

  writeLongEntry(view, entriesOffset, 0x0100, 640);
  writeLongEntry(view, entriesOffset + 12, 0x0101, 480);
  writeShortEntry(view, entriesOffset + 24, 0x0112, 1);
  writeOffsetEntry(view, entriesOffset + 36, 0x010f, 2, make.byteLength, makeOffset);

  view.setUint32(nextIfdOffset, 0, true);
  bytes.set(make, makeOffset);

  return bytes;
}

function writeLongEntry(
  view: DataView,
  offset: number,
  tag: number,
  value: number,
): void {
  writeOffsetEntry(view, offset, tag, 4, 1, value);
}

function writeShortEntry(
  view: DataView,
  offset: number,
  tag: number,
  value: number,
): void {
  view.setUint16(offset, tag, true);
  view.setUint16(offset + 2, 3, true);
  view.setUint32(offset + 4, 1, true);
  view.setUint16(offset + 8, value, true);
  view.setUint16(offset + 10, 0, true);
}

function writeOffsetEntry(
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
