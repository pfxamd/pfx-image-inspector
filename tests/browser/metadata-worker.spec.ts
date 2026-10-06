import { expect, test } from "@playwright/test";

test("inspects an image through the dedicated metadata worker", async ({
  page,
}) => {
  await page.goto("/");

  const result = await page.evaluate(async () => {
    const runtime = await import(
      "/src/services/metadata-worker-client.ts"
    );

    try {
      const bytes = createSmallWebP(123, 77);
      const inspected = await runtime.inspectImageInWorker(
        new Blob([bytes], { type: "image/webp" }),
      );

      return {
        format: inspected.file.format,
        mime: inspected.file.mime,
        width: inspected.image.width,
        height: inspected.image.height,
        rawIncluded: inspected.raw !== undefined,
      };
    } finally {
      runtime.disposeMetadataWorker();
    }

    function createSmallWebP(width: number, height: number): Uint8Array {
      const payload = new Uint8Array(5);
      payload[0] = 0x2f;
      const bits =
        ((width - 1) & 0x3fff) |
        (((height - 1) & 0x3fff) << 14);
      writeU32LE(payload, 1, bits >>> 0);

      const chunk = new Uint8Array(14);
      writeAscii(chunk, 0, "VP8L");
      writeU32LE(chunk, 4, payload.length);
      chunk.set(payload, 8);

      const output = new Uint8Array(12 + chunk.length);
      writeAscii(output, 0, "RIFF");
      writeU32LE(output, 4, output.length - 8);
      writeAscii(output, 8, "WEBP");
      output.set(chunk, 12);
      return output;
    }

    function writeU32LE(
      bytes: Uint8Array,
      offset: number,
      value: number,
    ): void {
      bytes[offset] = value & 0xff;
      bytes[offset + 1] = (value >>> 8) & 0xff;
      bytes[offset + 2] = (value >>> 16) & 0xff;
      bytes[offset + 3] = (value >>> 24) & 0xff;
    }

    function writeAscii(
      bytes: Uint8Array,
      offset: number,
      value: string,
    ): void {
      for (let index = 0; index < value.length; index += 1) {
        bytes[offset + index] = value.charCodeAt(index);
      }
    }
  });

  expect(result).toEqual({
    format: "webp",
    mime: "image/webp",
    width: 123,
    height: 77,
    rawIncluded: false,
  });
});

test("cancels an in-flight worker inspection", async ({ page }) => {
  await page.goto("/");

  const outcome = await page.evaluate(async () => {
    const runtime = await import(
      "/src/services/metadata-worker-client.ts"
    );

    const controller = new AbortController();

    try {
      const blob = createLargeWebPBlob(32 * 1024 * 1024);
      const pending = runtime
        .inspectImageInWorker(blob, { signal: controller.signal })
        .then(() => ({ status: "completed", code: null }))
        .catch((error: unknown) => ({
          status: "rejected",
          code:
            typeof error === "object" &&
            error !== null &&
            "code" in error
              ? String((error as { code?: unknown }).code)
              : null,
        }));

      setTimeout(() => controller.abort(), 0);
      return await pending;
    } finally {
      runtime.disposeMetadataWorker();
    }

    function createLargeWebPBlob(payloadSize: number): Blob {
      const junkHeader = new Uint8Array(8);
      writeAscii(junkHeader, 0, "JUNK");
      writeU32LE(junkHeader, 4, payloadSize);

      const imageChunk = new Uint8Array(14);
      writeAscii(imageChunk, 0, "VP8L");
      writeU32LE(imageChunk, 4, 5);
      imageChunk[8] = 0x2f;

      const bits = ((2 - 1) & 0x3fff) | (((2 - 1) & 0x3fff) << 14);
      writeU32LE(imageChunk, 9, bits >>> 0);

      const fileSize =
        12 + junkHeader.length + payloadSize + imageChunk.length;
      const riff = new Uint8Array(12);
      writeAscii(riff, 0, "RIFF");
      writeU32LE(riff, 4, fileSize - 8);
      writeAscii(riff, 8, "WEBP");

      return new Blob(
        [riff, junkHeader, new Uint8Array(payloadSize), imageChunk],
        { type: "image/webp" },
      );
    }

    function writeU32LE(
      bytes: Uint8Array,
      offset: number,
      value: number,
    ): void {
      bytes[offset] = value & 0xff;
      bytes[offset + 1] = (value >>> 8) & 0xff;
      bytes[offset + 2] = (value >>> 16) & 0xff;
      bytes[offset + 3] = (value >>> 24) & 0xff;
    }

    function writeAscii(
      bytes: Uint8Array,
      offset: number,
      value: string,
    ): void {
      for (let index = 0; index < value.length; index += 1) {
        bytes[offset + index] = value.charCodeAt(index);
      }
    }
  });

  expect(outcome).toEqual({
    status: "rejected",
    code: "ABORTED",
  });
});

test("keeps the main thread responsive while inspecting 32 MiB", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  const metrics = await page.evaluate(async () => {
    const { MetadataWorkerClient } = await import(
      "/src/services/metadata-worker-client.ts"
    );
    const client = new MetadataWorkerClient();

    try {
      const blob = createLargeWebPBlob(32 * 1024 * 1024);
      let ticks = 0;
      const timer = setInterval(() => {
        ticks += 1;
      }, 4);

      const started = performance.now();
      const result = await client.inspect(blob);
      const durationMs = performance.now() - started;
      clearInterval(timer);

      return {
        durationMs,
        ticks,
        width: result.image.width,
        height: result.image.height,
        size: result.file.size,
      };
    } finally {
      client.dispose();
    }

    function createLargeWebPBlob(payloadSize: number): Blob {
      const junkHeader = new Uint8Array(8);
      writeAscii(junkHeader, 0, "JUNK");
      writeU32LE(junkHeader, 4, payloadSize);

      const imageChunk = new Uint8Array(14);
      writeAscii(imageChunk, 0, "VP8L");
      writeU32LE(imageChunk, 4, 5);
      imageChunk[8] = 0x2f;

      const width = 640;
      const height = 480;
      const bits =
        ((width - 1) & 0x3fff) |
        (((height - 1) & 0x3fff) << 14);
      writeU32LE(imageChunk, 9, bits >>> 0);

      const fileSize =
        12 + junkHeader.length + payloadSize + imageChunk.length;
      const riff = new Uint8Array(12);
      writeAscii(riff, 0, "RIFF");
      writeU32LE(riff, 4, fileSize - 8);
      writeAscii(riff, 8, "WEBP");

      return new Blob(
        [riff, junkHeader, new Uint8Array(payloadSize), imageChunk],
        { type: "image/webp" },
      );
    }

    function writeU32LE(
      bytes: Uint8Array,
      offset: number,
      value: number,
    ): void {
      bytes[offset] = value & 0xff;
      bytes[offset + 1] = (value >>> 8) & 0xff;
      bytes[offset + 2] = (value >>> 16) & 0xff;
      bytes[offset + 3] = (value >>> 24) & 0xff;
    }

    function writeAscii(
      bytes: Uint8Array,
      offset: number,
      value: string,
    ): void {
      for (let index = 0; index < value.length; index += 1) {
        bytes[offset + index] = value.charCodeAt(index);
      }
    }
  });

  await testInfo.attach("large-file-metrics.json", {
    body: Buffer.from(JSON.stringify(metrics, null, 2)),
    contentType: "application/json",
  });

  expect(metrics.width).toBe(640);
  expect(metrics.height).toBe(480);
  expect(metrics.size).toBeGreaterThan(32 * 1024 * 1024);
  expect(metrics.durationMs).toBeLessThan(15_000);
  expect(metrics.ticks > 0 || metrics.durationMs < 50).toBe(true);
});
