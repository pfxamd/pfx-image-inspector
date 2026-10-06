import { expect, test } from "@playwright/test";

test("renders the fixed workspace and inspects a source image", async ({
  page,
}) => {
  await page.goto("/");

  for (const region of ["top", "left", "center", "bottom"]) {
    await expect(
      page.locator(`[data-layout-region="${region}"]`),
    ).toBeVisible();
  }

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();

  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
  }));

  expect(overflow.width).toBeLessThanOrEqual(overflow.clientWidth);
  expect(overflow.height).toBeLessThanOrEqual(overflow.clientHeight);

  await page.locator('input[type="file"]').setInputFiles({
    name: "inspection-sample.webp",
    mimeType: "image/webp",
    buffer: Buffer.from(createSmallWebP(123, 77)),
  });

  await expect(page.getByText("COMPLETE", { exact: true })).toBeVisible();
  await expect(page.getByText("123 × 77", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("WEBP", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("INSPECTION COMPLETE", { exact: true })).toBeVisible();
});

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
