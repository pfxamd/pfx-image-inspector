import { resolveRelease } from "../../scripts/pfx-release.mjs";
import { expect, test } from "@playwright/test";

test("renders the fixed workspace and inspects a source image", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator(".version-badge")).toHaveText(resolveRelease().label);

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme", "dark");

  await page.locator("[data-theme-toggle]").click();
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(page.locator("[data-theme-toggle]")).toContainText("DARK");

  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "light");

  await page.locator("[data-theme-toggle]").click();
  await expect(root).toHaveAttribute("data-theme", "dark");

  const sectionFontSize = await page
    .locator(".inspector-sections button")
    .first()
    .evaluate((element) => getComputedStyle(element).fontSize);
  expect(Number.parseFloat(sectionFontSize)).toBeGreaterThanOrEqual(12);

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


for (const width of [320, 390, 768]) {
  test(`mobile workspace supports image inspection at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.goto("/");

    await expect(page.getByText("SELECT AN IMAGE")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Image" })).toBeVisible();

    const layout = await page.evaluate(() => ({
      minWidth: getComputedStyle(document.body).minWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      cards: Array.from(document.querySelectorAll(".source-column, .inspector")).map(
        (element) => element.getBoundingClientRect().width,
      ),
    }));

    expect(layout.minWidth).toBe("0px");
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    for (const cardWidth of layout.cards) {
      expect(cardWidth).toBeLessThanOrEqual(layout.viewportWidth);
    }

    await page.locator('input[type="file"]').setInputFiles({
      name: "mobile-inspection.webp",
      mimeType: "image/webp",
      buffer: Buffer.from(createSmallWebP(123, 77)),
    });

    await expect(page.getByText("INSPECTION COMPLETE")).toBeVisible();
    await expect(page.locator(".inspector-sections button", { hasText: "Metadata" })).toBeEnabled();

    await page.locator(".inspector-sections button", { hasText: "Metadata" }).click();
    await expect(page.getByText("Metadata structure")).toBeVisible();

    const overflowAfterInspection = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: document.documentElement.clientHeight,
    }));

    expect(overflowAfterInspection.documentWidth).toBeLessThanOrEqual(
      overflowAfterInspection.viewportWidth,
    );
    expect(overflowAfterInspection.documentHeight).toBeGreaterThan(
      overflowAfterInspection.viewportHeight,
    );

    await page.getByRole("button", { name: "Release" }).click();
    await expect(page.getByText("SELECT AN IMAGE")).toBeVisible();
  });
}
