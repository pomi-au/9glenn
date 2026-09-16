const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.resolve(__dirname, "..");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
    args: ["--enable-unsafe-webgpu", "--disable-frame-rate-limit"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1400, height: 950 },
    });
    const errors = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error(e.message);
    });
    await page.goto(
      "file://" + path.join(root, "index.html") + "#tour",
    );
    await page.waitForFunction(
      () =>
        Building3D.instance?.tour.enabled && !Building3D.instance.transitioning,
    );
    assert(
      await page.evaluate(
        () =>
          !Building3D.instance.model.root.getObjectByName(
            "tour-outdoor-ground",
          ),
      ),
      "Starting tour must not add a separate green ground plane",
    );
    assert(
      await page.evaluate(() =>
        Building3D.instance.model.pickables.some(
          (m) => m.userData.siteId === "entrance-path" && m.userData.walkable,
        ),
      ),
      "Tour uses the existing landscape surfaces",
    );
    await page.click("#tour-resume");
    await page.waitForFunction(() => Building3D.instance.tour.locked);
    const snapshot = () =>
      page.evaluate(() => ({
        position: Building3D.instance.tour.camera.position.toArray(),
        mode: Building3D.instance.tour.movementMode,
      }));
    async function go(x, z, blocked = false) {
      await page.keyboard.down("w");
      const result = await page.evaluate(
        ({ x, z }) => {
          const t = Building3D.instance.tour;
          let now = performance.now(),
            stagnant = 0;
          t.update(now);
          for (let j = 0; j < 700; j++) {
            const dx = x - t.camera.position.x,
              dz = z - t.camera.position.z;
            const distance = Math.hypot(dx, dz);
            if (distance < 0.025) break;
            t.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, "YXZ");
            const speed = t.movementMode === "swimming" ? 1.2 : 2.1;
            now += Math.min(50, (distance / speed) * 1000);
            const before = t.camera.position.clone();
            t.update(now);
            if (
              Math.hypot(
                before.x - t.camera.position.x,
                before.z - t.camera.position.z,
              ) < 0.00001
            )
              stagnant++;
            else stagnant = 0;
            if (stagnant > 4) break;
          }
          return {
            position: t.camera.position.toArray(),
            mode: t.movementMode,
          };
        },
        { x, z },
      );
      await page.keyboard.up("w");
      await page.evaluate(() => {
        const t = Building3D.instance.tour,
          now = performance.now();
        for (let j = 0; j < 25; j++) t.update(now + j * 50);
      });
      if (!blocked)
        assert(
          Math.hypot(result.position[0] - x, result.position[2] - z) < 0.04,
          `Reach ${x},${z}, got ${JSON.stringify(result)}`,
        );
      return snapshot();
    }
    const fountainX = await page.evaluate(() => {
      const pool = Building3D.instance.data.floors
        .find((f) => f.id === "ground")
        .source.geometry.find((g) => g.type === "pool");
      return (
        pool.parts.fountain.reduce((sum, p) => sum + p[0], 0) /
        pool.parts.fountain.length /
        1000
      );
    });
    const routeX = fountainX + 0.8;
    // Walk out of the porch and around the house; no teleport to the pool.
    await go(15.665, 16.65);
    await go(routeX, 16.65);
    let state = await go(routeX, 14.2);
    assert.equal(state.mode, "walking");
    assert(Math.abs(state.position[1] - 1.65) < 0.02);
    await page.screenshot({
      path: path.join(root, "audit/tour/pool-paving.png"),
    });
    state = await go(routeX, 13);
    assert.equal(state.mode, "wading");
    assert(Math.abs(state.position[1] - 1.3) < 0.025);
    state = await go(routeX, 10);
    assert.equal(state.mode, "swimming");
    const level = await page.evaluate(() => {
      const mesh = Building3D.instance.model.pickables.find(
        (m) => m.userData.part === "water",
      );
      mesh.geometry.computeBoundingBox();
      return mesh.geometry.boundingBox.max.y + mesh.position.y;
    });
    assert(
      Math.abs(state.position[1] - (level + 0.22)) < 0.02,
      "Buoyant camera stays above water",
    );
    assert(await page.locator(".tour-water-status").isVisible());
    assert.match(
      await page.locator(".tour-water-status").textContent(),
      /Swimming/,
    );
    await page.screenshot({ path: path.join(root, "audit/tour/swimming.png") });
    state = await go(33, 10, true);
    assert(
      state.position[0] < 31.5 && state.mode === "swimming",
      "Deep wall blocks swimming onto paving",
    );
    await go(routeX, 10);
    state = await go(routeX, 5.9);
    assert.equal(state.mode, "wading");
    state = await go(routeX, 4.9);
    assert.equal(state.mode, "walking", "Can exit via rear rounded platform");
    state = await go(routeX, 7);
    assert.equal(state.mode, "swimming", "Can enter via rear rounded platform");
    state = await go(routeX, 13);
    assert.equal(state.mode, "wading");
    state = await go(fountainX, 13, true);
    assert(
      state.position[0] > fountainX + 0.4,
      "Fountain pedestal blocks the swimmer/wader",
    );
    await go(routeX, 13);
    state = await go(routeX, 14.2);
    assert.equal(state.mode, "walking", "Can exit via front rounded platform");
    assert(Math.abs(state.position[1] - 1.65) < 0.02);
    assert(await page.locator(".tour-water-status").isHidden());
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !Building3D.instance.tour.locked);
    await page.click("#tour-reset");
    state = await snapshot();
    assert.equal(state.mode, "walking");
    assert(
      Math.abs(state.position[0] - 15.665) < 0.01 &&
        Math.abs(state.position[2] - 15.045) < 0.01,
      "Reset returns to front door",
    );
    await page.click("#tour-exit");
    await page.waitForFunction(
      () =>
        !Building3D.instance.transitioning && !Building3D.instance.tour.enabled,
    );
    assert(
      await page.evaluate(
        () =>
          !Building3D.instance.model.root.getObjectByName(
            "tour-outdoor-ground",
          ),
      ),
      "No separate outdoor tour ground in overview",
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(root, "audit/tour/swimming-checks.json"),
      JSON.stringify(
        {
          frontDoorToPool: true,
          pavingWalking: true,
          frontEntryAndExit: true,
          rearEntryAndExit: true,
          surfaceSwimming: true,
          deepWallCollision: true,
          fountainCollision: true,
          resetAndExit: true,
          errors,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "PASS continuous porch-to-pool walk, paving, both pool entries/exits, swimming height, deep walls, fountain and tour reset/cleanup.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
