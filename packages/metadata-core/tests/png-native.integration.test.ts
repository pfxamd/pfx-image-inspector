import { describe, expect, it } from "vitest";
import { inspectImage } from "../src/index.js";

describe("native PNG metadata adapter", () => {
  it("reads tEXt software and compressed iCCP metadata", async () => {
    const icc = createIccProfile();
    const compressed = await deflate(icc);
    const iccpData = concat([
      new TextEncoder().encode("PFx profile"),
      Uint8Array.of(0, 0),
      compressed,
    ]);

    const bytes = png([
      chunk("IHDR", ihdr(320, 240)),
      chunk("tEXt", new TextEncoder().encode("Software\0PFx PNG")),
      chunk("iCCP", iccpData),
      chunk("IEND", new Uint8Array()),
    ]);

    const result = await inspectImage(bytes);

    expect(result.image.width).toBe(320);
    expect(result.image.height).toBe(240);
    expect(result.software?.name).toBe("PFx PNG");
    expect(result.metadata.icc.status).toBe("present");
    expect(result.standards.icc.version).toBe("4.3.0");
    expect(result.color?.colorSpace).toBe("RGB");
  });
});

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const compressed = new Blob([bytes.slice()])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

function createIccProfile(): Uint8Array {
  const bytes = new Uint8Array(132);
  writeU32BE(bytes, 0, bytes.length);
  bytes[8] = 4;
  bytes[9] = 0x30;
  writeAscii(bytes, 12, "mntr");
  writeAscii(bytes, 16, "RGB ");
  writeAscii(bytes, 20, "XYZ ");
  writeAscii(bytes, 36, "acsp");
  writeU32BE(bytes, 128, 0);
  return bytes;
}

function ihdr(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  writeU32BE(data, 0, width);
  writeU32BE(data, 4, height);
  data[8] = 8;
  data[9] = 6;
  return data;
}

function png(chunks: readonly Uint8Array[]): Uint8Array {
  return concat([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...chunks,
  ]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const output = new Uint8Array(12 + data.length);
  writeU32BE(output, 0, data.length);
  writeAscii(output, 4, type);
  output.set(data, 8);
  return output;
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

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, item) => sum + item.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;

  for (const item of chunks) {
    output.set(item, offset);
    offset += item.length;
  }

  return output;
}
