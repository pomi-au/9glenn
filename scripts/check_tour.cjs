const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.join(__dirname, "..");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
    // Headless Metal presentation can stop RAF at the display frame limiter.
    args: ["--enable-unsafe-webgpu", "--disable-frame-rate-limit"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1500, height: 1000 },
    });
    const errors = [],
      remote = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("Browser error:", e.message);
    });
    page.on("request", (r) => {
      if (/^https?:/.test(r.url())) remote.push(r.url());
    });
    await page.goto("file://" + path.join(root, "9-glenn-viewer.html") + "#3d");
    await page.waitForFunction(() => window.Building3D?.instance);
    assert.equal(
      await page.evaluate(() => Building3D.instance.renderer.backend.isWebGPUBackend),
      true,
      "walking tour uses the WebGPU backend",
    );
    // Static shadows need no repeated rebuild while checking camera and input.
    await page.evaluate(() => {
      Building3D.instance.renderer.shadowMap.autoUpdate = false;
    });
    const saved = await page.evaluate(() => {
      const i = Building3D.instance;
      i.pivot.rotation.y = 0.4;
      return {
        camera: i.camera.position.toArray(),
        quaternion: i.pivot.quaternion.toArray(),
        settings: { ...i.settings },
      };
    });
    await page.evaluate(() => {
      window.tourFlightFrames = [];
      window.watchTourFlight = true;
      function captureFlight() {
        const i = Building3D.instance;
        if (i.transitioning) window.tourFlightFrames.push({
          position: i.tour.camera.position.toArray(),
          perspective: i.tour.camera.isPerspectiveCamera,
        });
        if (window.watchTourFlight) requestAnimationFrame(captureFlight);
      }
      requestAnimationFrame(captureFlight);
    });
    await page.click("#model-tour");
    await page.waitForFunction(
      () =>
        Building3D.instance.tour.enabled && !Building3D.instance.transitioning,
    );
    const flight = await page.evaluate(() => {
      window.watchTourFlight = false;
      return window.tourFlightFrames;
    });
    assert(flight.length >= 2 && flight.every((frame) => frame.perspective),
      "camera renders intermediate perspective poses during flight");
    assert(Math.hypot(...flight[0].position.map((value, axis) =>
      value - flight.at(-1).position[axis])) > 1,
    "camera moves through intermediate poses before the entrance");
    const pos = () =>
      page.evaluate(() => Building3D.instance.tour.camera.position.toArray());
    const spawn = await pos();
    assert(
      Math.abs(spawn[0] - 15.665) < 0.02 && Math.abs(spawn[2] - 15.045) < 0.02,
      "spawn from front door",
    );
    assert(Math.abs(spawn[1] - 1.654) < 0.02, "eye height above porch");
    if (!(await page.evaluate(() => Building3D.instance.tour.locked)))
      await page.click("#tour-resume");
    await page.waitForFunction(() => Building3D.instance.tour.locked);
    await page.waitForFunction(
      () => Building3D.instance.tour.target === "ground:front-entry-a",
    );
    assert(await page.locator("#tour-prompt").isVisible());
    const materialCheck = await page.evaluate(() => {
      const meshes = Building3D.instance.model.pickables;
      const a = meshes.find(
        (m) => m.userData.doorKey === "ground:front-entry-a",
      );
      const b = meshes.find(
        (m) => m.userData.doorKey === "ground:front-entry-b",
      );
      const selection = Building3D.instance.selection.objects;
      return (
        selection.includes(a) &&
        selection.includes(b) &&
        a.material.emissive.getHex() === 0 &&
        b.material.emissive.getHex() === 0
      );
    });
    assert(
      materialCheck,
      "both leaves outlined without tinting their materials",
    );
    await page.screenshot({ path: path.join(root, "audit/tour/entrance.png") });
    // Real keyboard events drive the controller; deterministic frame steps avoid
    // depending on the software GPU's variable frame rate for travelled distance.
    async function walk(key, frames = 35) {
      await page.keyboard.down(key);
      await page.evaluate((frames) => {
        const t = Building3D.instance.tour,
          now = performance.now();
        for (let j = 0; j <= frames; j++) t.update(now + j * 50);
      }, frames);
      await page.keyboard.up(key);
    }
    await walk("w");
    const closed = await pos();
    assert(
      closed[2] > 13.85 && closed[2] < 14.05,
      "closed front door blocks walking",
    );
    // Click without a pointer move (pointer-locked absolute coordinates would look around).
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(
      () =>
        !Building3D.instance.model.doors.get("ground:front-entry-a").animation,
    );
    assert(
      await page.evaluate(() =>
        ["ground:front-entry-a", "ground:front-entry-b"].every(
          (key) => Building3D.instance.model.doors.get(key).open,
        ),
      ),
    );
    await walk("w");
    const inside = await pos();
    assert(inside[2] < 13.3, "can pass through open front door");
    assert(Math.abs(inside[1] - spawn[1]) < 0.02, "remains at floor height");
    // Sidestep the opened leaf, then continue into the entry hall.
    await walk("d", 5);
    await walk("w", 16);
    await page.screenshot({ path: path.join(root, "audit/tour/inside.png") });
    const beforeMouse = await page.evaluate(
      () => Building3D.instance.tour.camera.rotation.y,
    );
    await page.mouse.move(850, 420);
    const afterMouse = await page.evaluate(
      () => Building3D.instance.tour.camera.rotation.y,
    );
    assert(Math.abs(afterMouse - beforeMouse) > 0.01, "mouse looks around");
    await page.evaluate(() =>
      Building3D.instance.tour.camera.rotation.set(0, 0, 0, "YXZ"),
    );
    const startStrafe = await pos();
    await walk("a", 5);
    const left = await pos();
    assert(left[0] < startStrafe[0] - 0.2, "A strafes left");
    await walk("d", 5);
    const right = await pos();
    assert(right[0] > left[0] + 0.2, "D strafes right");
    await walk("s", 4);
    const back = await pos();
    assert(back[2] > right[2] + 0.2, "S moves backward");
    // Follow the actual main-stair tread centres in both directions. This
    // exercises risers, winders and upper landing without a separate nav mesh.
    const stairRoutes = await page.evaluate(() => {
      function centroid(points) {
        let area = 0,
          x = 0,
          z = 0;
        for (let j = 0; j < points.length; j++) {
          const a = points[j],
            b = points[(j + 1) % points.length];
          const cross = a[0] * b[1] - b[0] * a[1];
          area += cross;
          x += (a[0] + b[0]) * cross;
          z += (a[1] + b[1]) * cross;
        }
        return [x / (3 * area) / 1000, z / (3 * area) / 1000];
      }
      return Building3D.instance.data.floors.flatMap((floor) =>
        floor.stairs.map((stair) => ({
          id: stair.id,
          points: stair.treads.map((t) => {
            const [x, z] = centroid(t.points);
            return [
              x + floor.offset[0] / 1000,
              (floor.base + t.elevation) / 1000 + 1.65,
              z + floor.offset[1] / 1000,
            ];
          }),
        })),
      );
    });
    async function followStairs(route) {
      await page.keyboard.down("w");
      const reached = await page.evaluate((route) => {
        const t = Building3D.instance.tour;
        let now = performance.now();
        const results = [];
        t.update(now);
        for (const goal of route) {
          for (let j = 0; j < 150; j++) {
            const dx = goal[0] - t.camera.position.x,
              dz = goal[2] - t.camera.position.z;
            const distance = Math.hypot(dx, dz);
            if (distance < 0.025) break;
            t.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, "YXZ");
            now += Math.min(50, (distance / 2.1) * 1000);
            t.update(now);
          }
          results.push(t.camera.position.toArray());
        }
        return results;
      }, route);
      await page.keyboard.up("w");
      reached.forEach((p, j) => {
        assert(
          Math.hypot(p[0] - route[j][0], p[2] - route[j][2]) < 0.04,
          `reaches stair tread ${j + 1}: ${p} vs ${route[j]}`,
        );
        assert(
          Math.abs(p[1] - route[j][1]) < 0.015,
          `follows stair height ${j + 1}`,
        );
      });
    }
    for (const stair of stairRoutes) {
      await page.evaluate(
        (p) => Building3D.instance.tour.camera.position.fromArray(p),
        stair.points[0],
      );
      await followStairs(stair.points.slice(1));
      await followStairs(stair.points.slice(0, -1).reverse());
      console.log("PASS stair tour", stair.id);
    }
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !Building3D.instance.tour.locked);
    const paused = await pos();
    await walk("w", 10);
    assert.deepEqual(await pos(), paused, "paused keyboard cannot move");
    assert(await page.locator("#tour-prompt").isHidden());
    assert(await page.locator("#tour-pause").isVisible());
    assert(
      await page.evaluate(() =>
        Building3D.instance.model.pickables
          .filter((m) => m.userData.doorKey)
          .every((m) => m.material.emissive.getHex() === 0),
      ),
      "pause restores original door materials",
    );
    await page.click("#tour-reset");
    assert.deepEqual(
      await pos(),
      spawn,
      "reset returns to entrance with door still open",
    );
    await page.click("#tour-resume");
    await page.waitForFunction(() => Building3D.instance.tour.locked);
    // Behind the closed second entry leaf, and beyond interaction reach.
    await page.evaluate(() => {
      const t = Building3D.instance.tour;
      t.camera.position.set(16.45, 1.654, 17.5);
      t.camera.rotation.set(0, 0, 0, "YXZ");
      t.update(performance.now());
    });
    assert.equal(
      await page.evaluate(() => Building3D.instance.tour.target),
      null,
      "distant door is not interactive",
    );
    // Facing a solid front wall with internal doors behind it must not select through the wall.
    await page.evaluate(() => {
      const t = Building3D.instance.tour;
      t.camera.position.set(14.6, 1.654, 14.8);
      t.camera.rotation.set(0, 0, 0, "YXZ");
      t.update(performance.now());
    });
    assert.equal(
      await page.evaluate(() => Building3D.instance.tour.target),
      null,
      "wall occludes internal targets",
    );
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForFunction(() => !Building3D.instance.tour.locked);
    await page.click("#tour-exit");
    await page.waitForFunction(
      () =>
        !Building3D.instance.transitioning &&
        !document.body.classList.contains("mode-tour"),
    );
    const restored = await page.evaluate(() => {
      const i = Building3D.instance;
      return {
        camera: i.camera.position.toArray(),
        quaternion: i.pivot.quaternion.toArray(),
        settings: { ...i.settings },
        orbit: i.orbit.enabled,
      };
    });
    assert.deepEqual(restored.camera, saved.camera);
    assert.deepEqual(restored.quaternion, saved.quaternion);
    assert.deepEqual(restored.settings, saved.settings);
    assert(restored.orbit, "overview controls restored");
    assert(
      await page.evaluate(
        () => Building3D.instance.model.doors.get("ground:front-entry-a").open,
      ),
      "door state retained",
    );
    await page.click("#model-tour");
    await page.waitForFunction(() => Building3D.instance.transitioning);
    await page.evaluate(() => {
      location.hash = "ground";
    });
    await page.waitForFunction(
      () =>
        !Building3D.instance.transitioning && !Building3D.instance.tour.enabled,
    );
    assert(
      await page.evaluate(
        () =>
          !document.pointerLockElement &&
          !document.body.classList.contains("mode-tour"),
      ),
      "route change cleans up transition and mouse capture",
    );
    // Direct tour route works in the portable, offline viewer too.
    await page.goto(
      "file://" + path.join(root, "9-glenn-viewer.html") + "#tour",
    );
    await page.waitForFunction(
      () =>
        Building3D.instance?.tour.enabled && !Building3D.instance.transitioning,
    );
    assert.deepEqual(await pos(), spawn);
    await page.evaluate(() => {
      Building3D.instance.renderer.domElement.requestPointerLock = () =>
        Promise.reject(new Error("Denied for test"));
    });
    await page.click("#tour-resume");
    await page.waitForFunction(() =>
      document
        .querySelector("#tour-message")
        .textContent.includes("could not start"),
    );
    assert(
      await page.locator("#tour-pause").isVisible(),
      "mouse capture failure leaves retry and exit available",
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(remote, []);
    fs.writeFileSync(
      path.join(root, "audit/tour/checks.json"),
      JSON.stringify(
        {
          cameraFlight: true,
          frontDoorSpawn: true,
          pointerLock: true,
          WASD: true,
          mouseLook: true,
          doorHighlight: true,
          allStairsAscentAndDescent: true,
          closedDoorCollision: true,
          openDoorPassage: true,
          pauseAndReset: true,
          reachAndOcclusion: true,
          overviewRestored: true,
          routeCleanup: true,
          offline: true,
          errors,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "PASS tour camera flight, entrance spawn, WASD/mouse, highlight, door collision/passage, pause/reset, occlusion, overview restoration and offline routing.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
