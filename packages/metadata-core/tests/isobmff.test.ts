import { describe, expect, it } from "vitest";
import { detectIsoBmffDimensions } from "../src/formats/isobmff.js";

describe("ISO BMFF image dimensions", () => {
  it("reads ispe dimensions nested under meta/iprp/ipco", () => {
    const small = fullBox("ispe", concat([u32(640), u32(480)]));
    const large = fullBox("ispe", concat([u32(4032), u32(3024)]));
    const ipco = box("ipco", concat([small, large]));
    const iprp = box("iprp", ipco);
    const meta = fullBox("meta", iprp);
    const ftyp = box(
      "ftyp",
      Uint8Array.from([
        ...ascii("avif"),
        0, 0, 0, 0,
        ...ascii("avif"),
      ]),
    );

    expect(detectIsoBmffDimensions(concat([ftyp, meta]))).toMatchObject({
      width: 4032,
      height: 3024,
    });
  });

  it("ignores malformed or impossible ispe dimensions", () => {
    const invalid = fullBox("ispe", concat([u32(0), u32(100)]));
    expect(detectIsoBmffDimensions(box("ipco", invalid))).toBeNull();
  });
});

function fullBox(type: string, payload: Uint8Array): Uint8Array {
  return box(type, concat([Uint8Array.of(0, 0, 0, 0), payload]));
}

function box(type: string, payload: Uint8Array): Uint8Array {
  const size = 8 + payload.length;
  return concat([u32(size), Uint8Array.from(ascii(type)), payload]);
}

function u32(value: number): Uint8Array {
  return Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
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
