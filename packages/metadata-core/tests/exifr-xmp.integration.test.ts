import { describe, expect, it } from "vitest";
import { inspectImage } from "../src/index.js";

describe("exifr XMP namespace collection", () => {
  it("keeps parsed XMP namespaces in the PFx XMP metadata block", async () => {
    const result = await inspectImage(createXmpOnlyJpeg());

    expect(result.metadata.xmp.status).toBe("present");
    expect(result.timestamps.digitizedAt).toBe("2026-01-02T03:04:05Z");
    expect(result.metadata.xmp.entries).toHaveProperty("xap");
  });
});

function createXmpOnlyJpeg(): Uint8Array {
  const header = new TextEncoder().encode("http://ns.adobe.com/xap/1.0/\0");
  const xml = new TextEncoder().encode(
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description xmlns:xap="http://ns.adobe.com/xap/1.0/" ' +
      'xap:CreateDate="2026-01-02T03:04:05Z"/>' +
      "</rdf:RDF></x:xmpmeta>",
  );

  const payload = concat([header, xml]);
  const segmentLength = payload.length + 2;

  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe1,
    (segmentLength >>> 8) & 0xff,
    segmentLength & 0xff,
    ...payload,
    0xff,
    0xd9,
  ]);
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
