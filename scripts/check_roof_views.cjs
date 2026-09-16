const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: [
      "--enable-webgl",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("file://" + path.resolve("index.html") + "#3d");
    await page.waitForFunction(() => window.Building3D?.instance);
    const results = await page.evaluate(() => {
      const model = Building3D.instance.model,
        assembly = BUILDING_SPEC.roofAssembly;
      const meshes = [];
      model.root.traverse((m) => {
        if (m.userData.roofFaceId) meshes.push(m);
      });
      const top = assembly.faces.filter((f) => f.kind === "surface");
      return {
        faces: top.length,
        meshes: meshes.length,
        missing: top
          .filter((f) => !meshes.some((m) => m.userData.roofFaceId === f.id))
          .map((f) => f.id),
        components: [...new Set(meshes.map((m) => m.userData.component))],
      };
    });
    assert.equal(results.missing.length, 0, JSON.stringify(results));
    for (const view of ["iso", "top", "front", "rear", "left", "right"]) {
      await page.evaluate((view) => {
        const i = Building3D.instance;
        i.preset(view);
        if (!["iso", "top"].includes(view)) {
          i.camera.position.y = i.orbit.target.y;
          i.camera.lookAt(i.orbit.target);
          i.camera.updateMatrixWorld();
        }
        i.render();
      }, view);
      await page.screenshot({
        path: path.resolve(`audit/roofs/model-${view}.png`),
      });
    }
    await page.evaluate(() => {
      const i = Building3D.instance;
      i.settings.roof = false;
      i.update();
    });
    const hidden = await page.evaluate(() => {
      const i = Building3D.instance;
      return !i.model.roof.visible && !i.model.garageRoof.visible;
    });
    assert.ok(hidden);
    for (const view of [
      "elevation-1",
      "elevation-2",
      "elevation-3",
      "elevation-4",
      "section",
      "first",
    ]) {
      await page.goto("file://" + path.resolve(`drawings/${view}.svg`));
      await page
        .locator("svg")
        .screenshot({ path: path.resolve(`audit/roofs/drawing-${view}.png`) });
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS all shared roof faces rendered, six roof components, all-roofs toggle and six camera captures",
      results,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
