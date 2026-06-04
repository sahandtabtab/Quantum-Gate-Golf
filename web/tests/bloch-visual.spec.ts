import { expect, test, type Page } from "@playwright/test";
import { PUZZLES, STANDARD_GATES } from "../src/quantum";

const PROGRESS_STORAGE_KEY = "quantum-gate-golf-progress-v1";

test("desktop Bloch scene renders nonblank WebGL pixels", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await openAndCheckScene(page, "desktop");
});

test("mobile Bloch scene renders nonblank WebGL pixels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAndCheckScene(page, "mobile");
});

test("mobile circuit wraps long sequences without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /QUBIT GOLF/ })).toBeVisible();
  await page.getByRole("button", { name: /Start sandbox/ }).click();
  await expect(page.getByRole("heading", { name: "Sandbox", exact: true })).toBeVisible();

  for (const gateName of ["H", "T", "H", "S", "TDG", "H", "SDG", "X"]) {
    await clickGate(page, gateName);
  }

  const wireMetrics = await page.locator(".mobileCircuit").getByLabel("Current gate sequence").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      clientWidth: element.clientWidth,
      height: rect.height,
      scrollWidth: element.scrollWidth,
    };
  });

  expect(wireMetrics.scrollWidth).toBeLessThanOrEqual(wireMetrics.clientWidth + 1);
  expect(wireMetrics.height).toBeGreaterThan(70);
});

test("sandbox accepts custom initial Bloch angles", async ({ page }) => {
  test.setTimeout(30000);
  await page.setViewportSize({ width: 1280, height: 840 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /QUBIT GOLF/ })).toBeVisible();
  await page.getByRole("button", { name: /Start sandbox/ }).click();
  await expect(page.getByRole("heading", { name: "Sandbox", exact: true })).toBeVisible();

  const initialPanel = page.getByLabel("Sandbox initial state");
  await initialPanel.getByRole("spinbutton", { name: /θ/ }).fill("90");
  await initialPanel.getByRole("spinbutton", { name: /φ/ }).fill("0");
  await expect(initialPanel.getByText("(θ, ϕ) = (90.00 deg, 0.00 deg)")).toBeVisible();

  await clickGate(page, "H");
  await page.getByRole("button", { name: "RUN" }).click();
  await expect(page.getByLabel("Current result").getByText("1")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("(θ, ϕ) = (0.00 deg, 0.00 deg)")).toBeVisible({ timeout: 5000 });
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
});

test("solving a level shows late celebration and next-level action", async ({ page }) => {
  test.setTimeout(45000);
  await page.setViewportSize({ width: 1280, height: 840 });
  await startFirstLevel(page);

  await page.getByRole("button", { name: /^H/ }).click();
  await expect(page.getByText("Solved").first()).not.toBeVisible();
  await page.getByRole("button", { name: "RUN" }).click();

  await expect(page.getByText("Solved").first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".celebrationBurst")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next level" })).toBeVisible({ timeout: 10000 });
});

test("solving the final level opens the certificate screen", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1280, height: 840 });
  await seedProgressThroughPenultimateLevel(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /QUBIT GOLF/ })).toBeVisible();
  await page.getByRole("button", { name: /Open Unitary design levels/ }).click();
  await page.getByRole("button", { name: /Start Unitary design Level 5: Design Y gate/ }).click();

  const finalPuzzle = PUZZLES[PUZZLES.length - 1];
  for (const gateName of finalPuzzle.solution) {
    await clickGate(page, gateName);
  }

  await page.getByRole("button", { name: "RUN" }).click();
  await expect(page.getByRole("heading", { name: "Certified Quantum Engineer!" })).toBeVisible({ timeout: 40000 });
  await expect(page.locator(".completionConfettiPiece").first()).toBeVisible();
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
  await expect(page.getByRole("heading", { name: /QUBIT GOLF/ })).toBeVisible();
  await page.getByRole("button", { name: /Open State-to-state transfer levels/ }).click();
  await page.getByRole("button", { name: /Start State-to-state transfer Level 1/ }).click();
  await expect(page.getByRole("button", { name: /^H/ })).toBeVisible();
  await expect(page.getByText("Solved").first()).not.toBeVisible();
}

async function seedProgressThroughPenultimateLevel(page: Page) {
  const progress = Object.fromEntries(
    PUZZLES.slice(0, -1).map((item) => [
      item.id,
      {
        solved: true,
        bestScore: 1200,
        bestGates: item.solution.length,
        xpAwarded: 100,
        xpSpent: 0,
      },
    ]),
  );

  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: PROGRESS_STORAGE_KEY, value: progress },
  );
}

async function clickGate(page: Page, gateName: string) {
  const gate = STANDARD_GATES[gateName];
  const label = new RegExp(`${escapeRegex(gate.description)}$`);
  await page.getByRole("button", { name: label }).click({ force: true });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}