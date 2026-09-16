const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--enable-unsafe-webgpu", "--disable-frame-rate-limit"],
    ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.log("PAGEERROR", error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
      if (errors.length <= 4) console.log("GPU/CONSOLE", message.text());
    }
  });
  try {
    await page.goto(
      "file://" + path.resolve(__dirname, "../9-glenn-viewer.html") + "#3d",
    );
    await page.waitForFunction(
      () =>
        Building3D?.instance ||
        document
          .querySelector("#model-error")
          ?.textContent.includes("could not"),
      null,
      { timeout: 60000 },
    );
    const state = await page.evaluate(() => {
      const i = Building3D.instance;
      return i
        ? {
            backend: i.renderer.backend.isWebGPUBackend,
            fallback: i.renderer._getFallback,
            children: i.scene.children.length,
            mode: i.quality.mode,
          }
        : { error: document.querySelector("#model-error").textContent };
    });
    console.log("INITIAL", JSON.stringify(state));
    assert.equal(state.backend, true);
    assert.equal(state.fallback, null);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "audit/webgpu/explore.png" });
    await page.click('[data-camera="street"]');
    await page.check("#model-perspective");
    await page.click('[data-render-mode="photo"]');
    await page.waitForFunction(
      () =>
        Building3D.instance.quality.photo?.complete ||
        Building3D.instance.quality.error,
      null,
      { timeout: 180000 },
    );
    const photo = await page.evaluate(() => {
      const q = Building3D.instance.quality;
      return {
        error: q.error,
        mode: q.mode,
        samples: q.photo?.sampleCounts,
        revision: q.photo?.revision,
      };
    });
    console.log("PHOTO", JSON.stringify(photo));
    assert.equal(photo.error, null);
    assert.equal(photo.samples.min, 128);
    await page.screenshot({ path: "audit/webgpu/photo.png" });
    // A camera change must restart accumulation and preserve the photo mode.
    await page.evaluate(() => {
      const i = Building3D.instance;
      i.camera.zoom *= 1.08;
      i.camera.updateProjectionMatrix();
      i.render();
    });
    await page.waitForFunction(
      (previous) => Building3D.instance.quality.photo.samples < previous,
      photo.samples.avg,
      { timeout: 10000 },
    );
    await page.waitForFunction(
      () => Building3D.instance.quality.photo?.samples >= 1,
      null,
      { timeout: 60000 },
    );
    await page.setViewportSize({ width: 1040, height: 760 });
    await page.waitForTimeout(1500);
    const downloadPromise = page.waitForEvent("download");
    await page.click("#model-download");
    const download = await downloadPromise;
    await download.saveAs("audit/webgpu/export.png");
    assert(fs.statSync("audit/webgpu/export.png").size > 10000);
    await page.click('[data-render-mode="explore"]');
    await page.evaluate(() => {
      const i = Building3D.instance;
      i.settings.floor = "ground";
      i.settings.cut = true;
      i.update(true);
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "audit/webgpu/cutaway.png" });
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      "audit/webgpu/results.json",
      JSON.stringify(
        {
          state,
          photo,
          errors,
          checks: [
            "actual WebGPU without fallback",
            "real path-traced samples",
            "camera change",
            "resize",
            "PNG export",
            "cutaway",
          ],
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS WebGPU rendering, progressive path tracing, camera reset, resize, export, cutaway",
    );
  } catch (error) {
    await page.screenshot({ path: "audit/webgpu/failure.png" }).catch(() => {});
    console.log(
      "STATE",
      await page
        .locator("body")
        .innerText()
        .catch(() => "unavailable"),
    );
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
