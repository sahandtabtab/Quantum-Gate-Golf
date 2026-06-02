import { expect, test, type Page } from "@playwright/test";

test("desktop Bloch scene renders nonblank WebGL pixels", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openAndCheckScene(page, "desktop");
});

test("mobile Bloch scene renders nonblank WebGL pixels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAndCheckScene(page, "mobile");
});

test("gate edits wait for RUN before revealing a result", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 840 });
  await startFirstLevel(page);

  const puzzleStatus = page.getByLabel("Puzzle status");
  await page.getByRole("button", { name: /^H/ }).click();
  await expect(page.locator(".desktopCircuit").getByLabel("Current gate sequence").getByText("H")).toBeVisible();
  await expect(puzzleStatus.getByText("Running")).not.toBeVisible({ timeout: 100 });
  await expect(page.getByText("Solved").first()).not.toBeVisible({ timeout: 100 });

  await page.getByRole("button", { name: "RUN" }).click();
  await expect(puzzleStatus.getByText("Running")).toBeVisible();
  await expect(page.getByText("Solved").first()).not.toBeVisible({ timeout: 100 });
});

test("solving a level shows late celebration and next-level action", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 840 });
  await startFirstLevel(page);

  await page.getByRole("button", { name: /^H/ }).click();
  await expect(page.getByText("Solved").first()).not.toBeVisible();
  await page.getByRole("button", { name: "RUN" }).click();

  await expect(page.getByText("Solved").first()).toBeVisible({ timeout: 3000 });
  await expect(page.locator(".celebrationBurst")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next level" })).toBeVisible();
});

async function openAndCheckScene(page: Page, name: string) {
  await startFirstLevel(page);

  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  if (name === "mobile") {
    const hGate = page.getByRole("button", { name: /^H/ });
    await expect(hGate).toBeVisible();
    const gateBox = await hGate.boundingBox();
    expect(gateBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(844);
  }
  await page.waitForTimeout(600);

  const pixelStats = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const gl = canvasElement.getContext("webgl2") ?? canvasElement.getContext("webgl");
    if (!gl) {
      return { width: canvasElement.width, height: canvasElement.height, paintedPixels: 0 };
    }

    const pixels = new Uint8Array(canvasElement.width * canvasElement.height * 4);
    gl.readPixels(0, 0, canvasElement.width, canvasElement.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const background = [7, 19, 25];
    let paintedPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      const colorDistance =
        Math.abs(pixels[index] - background[0]) +
        Math.abs(pixels[index + 1] - background[1]) +
        Math.abs(pixels[index + 2] - background[2]);
      if (alpha > 0 && colorDistance > 30) {
        paintedPixels += 1;
      }
    }

    return { width: canvasElement.width, height: canvasElement.height, paintedPixels };
  });

  expect(pixelStats.width).toBeGreaterThan(100);
  expect(pixelStats.height).toBeGreaterThan(100);
  expect(pixelStats.paintedPixels).toBeGreaterThan(500);

  await page.screenshot({ path: `test-results/bloch-${name}.png`, fullPage: false, timeout: 10000 });
}

async function startFirstLevel(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /QUANTUM GATE GOLF/ })).toBeVisible();
  await page.getByRole("button", { name: /Start Level 1/ }).click();
  await expect(page.getByRole("button", { name: /^H/ })).toBeVisible();
  await expect(page.getByText("Solved").first()).not.toBeVisible();
}

async function canvasChecksum(page: Page): Promise<number> {
  return page.locator("canvas").first().evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const gl = canvasElement.getContext("webgl2") ?? canvasElement.getContext("webgl");
    if (!gl) {
      return 0;
    }

    const pixels = new Uint8Array(canvasElement.width * canvasElement.height * 4);
    gl.readPixels(0, 0, canvasElement.width, canvasElement.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let checksum = 0;
    const stride = 64;
    for (let index = 0; index < pixels.length; index += 4 * stride) {
      checksum += pixels[index] * 3 + pixels[index + 1] * 5 + pixels[index + 2] * 7 + pixels[index + 3] * 11;
    }
    return checksum;
  });
}


