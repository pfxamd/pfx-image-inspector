import { expect, test } from "@playwright/test";

test("independent Raster Core verifies valid PNG without changing metadata", async ({page}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { inspectImageInWorker, disposeMetadataWorker } = await import(
      "/src/services/metadata-worker-client.ts"
    );
    const canvas = document.createElement("canvas");
    canvas.width = 137;
    canvas.height = 83;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No Canvas 2D");
    ctx.fillStyle = "#d07038";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("PNG unavailable")), "image/png");
    });
    try {
      const inspected = await inspectImageInWorker(blob);
      return {
        format: inspected.file.format,
        width: inspected.image.width,
        height: inspected.image.height,
        raster: inspected.raster,
      };
    } finally {
      disposeMetadataWorker();
    }
  });
  expect(result.format).toBe("png");
  expect(result.width).toBe(137);
  expect(result.height).toBe(83);
  expect(result.raster).toMatchObject({
    status: "checked", agreement: "match",
    format: "png", width: 137, height: 83,
    hasIccProfile: false,
  });
  expect(typeof result.raster?.hasAlpha).toBe("boolean");
});

test("Color tab shows independent raster check with no new UI settings", async ({ page }) => {
  await page.goto("/");
  const png = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 99; canvas.height = 61;
    canvas.getContext("2d")!.fillRect(0, 0, 99, 61);
    return (await new Promise<Blob>(r => canvas.toBlob(blob => r(blob!), "image/png")))
      .arrayBuffer().then(b => Array.from(new Uint8Array(b)));
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: "raster-valid.png",
    mimeType: "image/png",
    buffer: Buffer.from(png),
  });
  await expect(page.getByText("INSPECTION COMPLETE")).toBeVisible();
  await page.locator(".inspector-sections button", {hasText:"Color"}).click();
  await expect(page.getByText("Raster check", {exact:true})).toBeVisible();
  await expect(page.getByText("Independent match", {exact:true})).toBeVisible();
  await expect(page.getByText("Alpha channel", {exact:true})).toBeVisible();
});
