/**
 * Run AFTER GitHub Pages deploys, against the actual public URL.
 * Exercises independent Raster Core integration inside the published
 * metadata worker, including a narrow mobile viewport. No user files.
 */
import { chromium, expect } from "@playwright/test";

const url = "https://pfxamd.github.io/pfx-image-inspector/";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (!response?.ok()) throw new Error("Published inspector HTTP status is not OK");
  await expect(page.getByRole("button", { name: "Open Image" })).toBeVisible();

  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 137;
    canvas.height = 83;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    ctx.fillStyle = "#e7a34f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#162c4d";
    ctx.fillRect(20, 15, 45, 30);
    return canvas.toDataURL("image/png").split(",")[1];
  });

  await page.locator('input[type="file"]').setInputFiles({
    name: "local-published-check.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await expect(page.getByText("INSPECTION COMPLETE", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.locator(".inspector-sections button", { hasText: "Color" }).click();
  await expect(page.getByText("Raster check", { exact: true })).toBeVisible();
  await expect(page.getByText("Independent match", { exact: true })).toBeVisible();
  await expect(page.getByText("Alpha channel", { exact: true })).toBeVisible();
  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  if (width.document > width.viewport) throw new Error("Mobile horizontal overflow");
  if (pageErrors.length > 0) throw new Error("Published page script errors: " + pageErrors.join("; "));
  console.log("PUBLISHED_RASTER_INSPECTION_VERIFIED", JSON.stringify({
    url, width: 390, image: "137x83 PNG", rasterCheck: "Independent match",
    mobileHorizontalOverflow: false,
  }));
} finally {
  await browser.close();
}
