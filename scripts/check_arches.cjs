const assert = require("node:assert/strict");
const path = require("node:path");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
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
      viewport: { width: 1512, height: 982 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      "file://" + path.join(__dirname, "../9-glenn-viewer.html") + "#3d",
    );
    await page.waitForFunction(() => window.Building3D?.instance);
    const checks = await page.evaluate(() => {
      const i = Building3D.instance,
        g = i.data.floors.find((f) => f.id === "ground"),
        wall = g.walls.find((w) => w.id === "portico-front"),
        cut = wall.cuts.find((c) => c.arch);
      const frame = g.cuts.find((c) => c.id === "entry-glazing");
      return {
        width: cut.bounds.maxX - cut.bounds.minX,
        radius: cut.archProfile.radius,
        spring: cut.head - cut.archProfile.radius,
        head: cut.head,
        shoulderOpen: !i.wallContains(wall, 14950, 15975, 2100),
        shoulderSolid: i.wallContains(wall, 14950, 15975, 2200),
        crownOpen: !i.wallContains(wall, 16075, 15975, 2900),
        aboveSolid: i.wallContains(wall, 16075, 15975, 3000),
        frameRadius: frame.archProfile.radius,
        frameHead: frame.head,
        bands: i.model.pickables.filter(
          (m) => m.userData.name === "Arched impost band",
        ).length,
        caps: i.model.pickables.filter(
          (m) => m.userData.name === "Arch pier plinth cap",
        ).length,
      };
    });
    assert.deepEqual(checks, {
      width: 2410,
      radius: 820,
      spring: 2143,
      head: 2963,
      shoulderOpen: true,
      shoulderSolid: true,
      crownOpen: true,
      aboveSolid: true,
      frameRadius: 820,
      frameHead: 2963,
      bands: 4,
      caps: 4,
    });
    await page.locator('[data-floor="ground"]').click();
    await page.evaluate(() => {
      const i = Building3D.instance;
      i.camera.position.set(16.075, 2.5, 70);
      i.orbit.target.set(16.075, 1.8, 15.975);
      i.camera.zoom = 7.5;
      i.camera.updateProjectionMatrix();
      i.orbit.update();
      i.render();
    });
    await page
      .locator("#model-canvas")
      .screenshot({ path: "tmp/arch-fix/3d-front-after.png" });
    await page.evaluate(() => {
      const i = Building3D.instance;
      i.camera.position.set(26, 5, 35);
      i.orbit.target.set(16.075, 1.8, 15.0);
      i.camera.zoom = 7;
      i.camera.updateProjectionMatrix();
      i.orbit.update();
      i.render();
    });
    await page
      .locator("#model-canvas")
      .screenshot({ path: "tmp/arch-fix/3d-angle-after.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS arch widths, crown/spring levels, shouldered aperture, recessed fanlight, 4 impost bands and 4 pier caps",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
