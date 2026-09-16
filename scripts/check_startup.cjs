const assert = require("node:assert/strict");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const base = process.env.VIEWER_BASE_URL || "http://127.0.0.1:8147/";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
    args: ["--enable-unsafe-webgpu"],
  });
  try {
    // Hold every external script: the initial HTML must already be the final shell.
    const shell = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await shell.route(/\.js(?:\?.*)?$/, (route) => route.abort());
    await shell.goto(base + "#compare/ground");
    assert.equal(
      await shell
        .locator(".app-header")
        .evaluate((el) => el.getBoundingClientRect().height),
      50,
    );
    assert.equal(await shell.locator("#mode-compare").count(), 1);
    assert.equal(await shell.locator(".header-meta").count(), 0);
    assert.equal(await shell.locator("#triple-view").isVisible(), true);
    assert.equal(await shell.locator("#workspace-controls").isVisible(), false);
    assert.equal(await shell.locator(".main > .toolbar").isVisible(), false);
    assert.equal(
      await shell
        .locator("#mode-compare")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(255, 255, 255)",
      "The selected tab matches the initial hash before scripts run",
    );
    await shell.screenshot({ path: "tmp/startup-before-scripts.png" });
    await shell.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await shell.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await shell.close();

    let release,
      requested = 0;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/assets/model-3d.js*", async (route) => {
      requested++;
      await held;
      await route.continue();
    });
    await page.goto(base);
    await page.waitForSelector("#stage svg");
    assert.equal(requested, 0, "Drawings never downloads the WebGPU bundle");
    await page.selectOption("#quick-drawing", "first");
    await page.waitForFunction(
      () => document.querySelector("#view-title").textContent === "First floor",
    );
    await page.click("#controls-toggle");
    assert(
      await page
        .locator("#workspace-controls")
        .evaluate((el) => el.matches(":popover-open")),
    );
    await page.click(".controls-close");
    await page.click("#mode-compare");
    await page.waitForSelector("#triple-loading", { state: "visible" });
    assert.equal(requested, 1);
    assert.equal(
      await page
        .locator(".app-header")
        .evaluate((el) => el.getBoundingClientRect().height),
      50,
    );
    await page.click("#mode-2d");
    await page.waitForSelector("#stage", { state: "visible" });
    release();
    await page.waitForFunction(() => Boolean(window.Building3D));
    assert.equal(
      await page.evaluate(() => Boolean(Building3D.instance)),
      false,
      "Leaving the pending view does not start a stale model",
    );
    await page.click("#mode-compare");
    await page.waitForFunction(() =>
      Boolean(window.TripleView?.instance?.drawing),
    );
    await page.waitForSelector("#triple-loading", { state: "hidden" });
    assert.equal(await page.locator(".triple-panes figure:visible").count(), 3);
    assert.equal(requested, 1, "The engine is loaded only once");
    assert.deepEqual(errors, []);
    await page.screenshot({ path: "tmp/startup-comparison-ready.png" });
    await page.close();

    // A failed download must keep navigation usable and offer a real retry.
    const retry = await browser.newPage();
    let attempts = 0;
    await retry.route("**/assets/model-3d.js*", (route) =>
      ++attempts === 1 ? route.abort() : route.continue(),
    );
    await retry.goto(base + "#3d");
    await retry.waitForSelector("#model-loading button", { state: "visible" });
    assert.match(
      await retry.locator("#model-loading").innerText(),
      /could not load/,
    );
    await retry.click("#model-loading button");
    await retry.waitForFunction(() => Boolean(window.Building3D?.instance));
    await retry.waitForSelector("#model-loading", { state: "hidden" });
    assert.equal(attempts, 2);
    assert.equal(
      await retry.evaluate(
        () => Building3D.instance.renderer.backend.isWebGPUBackend,
      ),
      true,
    );
    await retry.click("#model-tour");
    await retry.waitForSelector("body.mode-tour #tour-hud", {
      state: "visible",
    });
    // Escape releases the mouse captured by the walkthrough.
    await retry.keyboard.press("Escape");
    await retry.click("#tour-exit");
    await retry.waitForFunction(
      () => !document.body.classList.contains("mode-tour"),
    );
    assert.equal(await retry.locator("#model-view").isVisible(), true);
    await retry.close();
    console.log(
      "PASS final layout before scripts, mobile startup, independent 2D, route changes during download, three-pane startup, one engine download and failed-download retry",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
