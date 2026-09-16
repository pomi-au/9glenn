const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const { spawnSync } = require("node:child_process");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const root = path.resolve(__dirname, "..");
const out = path.resolve(
  root,
  process.env.ENVIRONMENT_AUDIT_DIR || "audit/interaction",
);
fs.mkdirSync(out, { recursive: true });
const testGeometry = buildSync({
  stdin: {
    contents:
      'import { Vector3, Box3, BoxGeometry } from "three"; window.InteractionTestGeometry = { Vector3, Box3, BoxGeometry };',
    resolveDir: root,
  },
  bundle: true,
  write: false,
  format: "iife",
}).outputFiles[0].text;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--enable-unsafe-webgpu", "--disable-frame-rate-limit"],
    ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 850 },
    deviceScaleFactor: 1,
    recordVideo: { dir: out, size: { width: 1200, height: 850 } },
  });
  const page = await context.newPage();
  const errors = [],
    results = {};
  let succeeded = false,
    demoDuration = 0,
    demoEnded = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  async function diagnostics() {
    return page.evaluate(() => Building3D.instance.interaction.diagnostics);
  }
  async function impulseCount() {
    return (await diagnostics()).pointer.impulses;
  }
  async function reset() {
    await page.mouse.move(8, 8);
    await page.evaluate(() => {
      const i = Building3D.instance;
      i.interaction.reset();
      i.render();
    });
  }
  async function waitFrame() {
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  }
  async function focus(kind) {
    await reset();
    await page.evaluate((kind) => {
      const i = Building3D.instance,
        T = InteractionTestGeometry;
      i.pivot.quaternion.identity();
      i.pivot.position.set(0, 0, 0);
      i.model.root.position.set(0, 0, 0);
      i.pivot.updateMatrixWorld(true);
      const controllers = i.interaction.controllers.filter(
        (c) => c.kind === kind,
      );
      const c =
        controllers.find((c) => c.id.endsWith("front-shade-tree")) ||
        controllers[0];
      if (!c) throw new Error(`No ${kind} controller`);
      const target = c.targets[0];
      let point;
      if (kind === "grass") {
        // Pick a real root in the open lawn between the two existing trees.
        const matrices = c.mesh.instanceMatrix.array;
        let nearest = Infinity;
        for (let n = 12; n < matrices.length; n += 16) {
          const distance =
            (matrices[n] - 18) ** 2 + (matrices[n + 2] - 19) ** 2;
          if (distance < nearest) {
            nearest = distance;
            point = new T.Vector3(
              matrices[n],
              matrices[n + 1],
              matrices[n + 2],
            );
          }
        }
        c.group.localToWorld(point);
      } else {
        point = new T.Box3().setFromObject(target).getCenter(new T.Vector3());
      }
      i.camera.up.set(
        0,
        kind === "foliage" ? 1 : 0,
        kind === "foliage" ? 0 : -1,
      );
      i.camera.position
        .copy(point)
        .add(
          kind === "foliage"
            ? new T.Vector3(0, 2, 20)
            : new T.Vector3(0, 25, 0),
        );
      i.camera.lookAt(point);
      const canvas = i.renderer.domElement.getBoundingClientRect();
      const aspect = canvas.width / canvas.height;
      i.camera.left = -3 * aspect;
      i.camera.right = 3 * aspect;
      i.camera.top = 3;
      i.camera.bottom = -3;
      i.camera.zoom = 1;
      i.camera.updateProjectionMatrix();
      i.camera.updateMatrixWorld(true);
      window.environmentTestTarget = { id: c.id, kind, point: point.toArray() };
      i.interaction.reset();
      i.render();
    }, kind);
    await waitFrame();
    const position = await page.evaluate(() => {
      const i = Building3D.instance,
        T = InteractionTestGeometry;
      const p = new T.Vector3(...environmentTestTarget.point).project(i.camera);
      const box = i.renderer.domElement.getBoundingClientRect();
      return {
        ...environmentTestTarget,
        x: box.left + (p.x * 0.5 + 0.5) * box.width,
        y: box.top + (-p.y * 0.5 + 0.5) * box.height,
      };
    });
    if (kind === "foliage") {
      // Alpha-cut leaf images have holes. Find a visible opaque stroke patch,
      // rather than assuming the canopy bounding-box centre is a leaf pixel.
      for (const [dx, dy] of [
        [0, 0],
        [60, 0],
        [-60, 0],
        [0, 60],
        [0, -60],
        [60, 60],
        [-60, -60],
      ]) {
        let opaque = true;
        for (const [sx, sy] of [
          [0, 0],
          [-30, 0],
          [30, 0],
          [0, -30],
          [0, 30],
        ]) {
          await reset();
          await page.mouse.move(position.x + dx + sx, position.y + dy + sy);
          await waitFrame();
          if ((await diagnostics()).pointer.lastTarget !== position.id) {
            opaque = false;
            break;
          }
        }
        if (opaque) {
          await reset();
          return { ...position, x: position.x + dx, y: position.y + dy };
        }
      }
      throw new Error(
        "No opaque foliage fixture found for horizontal/vertical pointer strokes",
      );
    }
    return position;
  }
  async function geometrySnapshot(id) {
    return page.evaluate((id) => {
      const c = Building3D.instance.interaction.controllers.find(
        (c) => c.id === id,
      );
      const mesh = c.mesh || c.targets[0];
      const source =
        mesh.instanceMatrix?.array || mesh.geometry.attributes.position.array;
      return Array.from(source);
    }, id);
  }
  async function sweep(
    point,
    { reverse = false, interval = 24, steps = 8, axis = "x", span = 60 } = {},
  ) {
    const left = point[axis] - span / 2,
      right = point[axis] + span / 2;
    const start = reverse ? right : left,
      end = reverse ? left : right;
    const move = (position) =>
      page.mouse.move(
        axis === "x" ? position : point.x,
        axis === "y" ? position : point.y,
      );
    await move(start);
    await waitFrame();
    for (let n = 1; n <= steps; n++) {
      await delay(interval);
      await move(start + ((end - start) * n) / steps);
    }
    await waitFrame();
    return diagnostics();
  }
  try {
    await page.goto("file://" + path.join(root, "9-glenn-viewer.html") + "#3d");
    await page.waitForFunction(
      () => window.Building3D?.instance?.interaction,
      null,
      { timeout: 60000 },
    );
    await page.addScriptTag({ content: testGeometry });
    await page.evaluate(() => {
      const i = Building3D.instance;
      // Isolate pointer-driven springs from the fountain's continuous forcing.
      // Fountain animation, water driving and Photo freeze are covered by
      // check_fountain.cjs; this suite must be able to observe exact rest.
      i.model.updateWater = () => false;
      i.interaction.reset();
    });
    assert(
      await page.evaluate(
        () => Building3D.instance.renderer.backend.isWebGPUBackend,
      ),
    );
    await page.click('[data-camera="top"]');
    await page.uncheck("#model-perspective");
    await page.evaluate(() => {
      const i = Building3D.instance;
      i.pivot.quaternion.identity();
      i.pivot.position.set(0, 0, 0);
      i.model.root.position.set(0, 0, 0);
      i.pivot.updateMatrixWorld(true);
      i.render();
    });
    for (const kind of ["grass", "foliage", "water"]) {
      const point = await focus(kind);
      const before = await geometrySnapshot(point.id);
      const count = await impulseCount();
      await page.mouse.move(point.x, point.y);
      await waitFrame();
      assert.equal(
        (await diagnostics()).pointer.lastTarget,
        point.id,
        `${kind}: fixture exposes the intended surface`,
      );
      assert.equal(
        await impulseCount(),
        count,
        `${kind}: first entry injects no impulse`,
      );
      await page.mouse.move(point.x, point.y);
      await waitFrame();
      assert.equal(
        await impulseCount(),
        count,
        `${kind}: stationary pointer injects no impulse`,
      );
      await reset();
      const response = await sweep(point);
      assert(
        response.pointer.impulses > count,
        `${kind}: real hover applies local impulses`,
      );
      const after = await geometrySnapshot(point.id);
      assert.notDeepEqual(
        after,
        before,
        `${kind}: actual exported geometry deforms`,
      );
      if (kind === "grass") {
        for (let index = 12; index < before.length; index += 16)
          assert.deepEqual(
            after.slice(index, index + 3),
            before.slice(index, index + 3),
            "grass roots stay fixed while blades bend",
          );
        assert.equal(
          response.pointer.grassMeshIsTarget,
          false,
          "grass uses lawn proxies instead of per-blade raycasts",
        );
      }
      if (kind === "water") {
        assert.equal(
          await page.evaluate(
            (id) =>
              Building3D.instance.interaction.controllers.find(
                (c) => c.id === id,
              ).mesh.material.side,
            point.id,
          ),
          0,
          "water bottom backfaces must not become a second refracting layer above the tiled floor",
        );
      }
      results[kind] = response;
      await page.screenshot({ path: path.join(out, `${kind}-response.png`) });
      if (kind === "foliage") {
        await reset();
        const vertical = await sweep(point, { axis: "y" });
        assert(
          Math.abs(vertical.pointer.lastVelocity[1]) > 0.01,
          "vertical screen stroke reaches foliage as world-Y motion",
        );
        assert.notDeepEqual(
          await geometrySnapshot(point.id),
          before,
          "vertical foliage strokes deform the actual canopy",
        );
        results.foliageVertical = vertical.pointer;
      }
      await page.mouse.move(8, 8);
      await page.waitForFunction(
        () => !Building3D.instance.interaction.diagnostics.moving,
        null,
        { timeout: 20000 },
      );
      console.log(
        `PASS ${kind}: hover, real geometry response, fixed roots and rest`,
      );
    }
    const grass = await focus("grass");
    await reset();
    const slow = await sweep(grass, { interval: 100 });
    await reset();
    const fast = await sweep(grass, { interval: 12 });
    const speed = (d) => Math.hypot(...d.pointer.lastVelocity);
    assert(
      speed(fast) > speed(slow) * 1.2,
      "faster real pointer motion produces larger surface velocity",
    );
    await reset();
    const opposite = await sweep(grass, { reverse: true, interval: 24 });
    assert(
      fast.pointer.lastVelocity.reduce(
        (dot, value, axis) => dot + value * opposite.pointer.lastVelocity[axis],
        0,
      ) < 0,
      "opposite hover direction reverses the applied velocity",
    );
    results.speed = {
      slow: speed(slow),
      fast: speed(fast),
      forward: fast.pointer.lastVelocity,
      reverse: opposite.pointer.lastVelocity,
    };
    console.log("PASS pointer speed/direction", JSON.stringify(results.speed));
    await reset();
    await page.mouse.move(grass.x, grass.y);
    await waitFrame();
    const beforeDrag = await impulseCount();
    await page.mouse.down();
    await page.mouse.move(grass.x + 30, grass.y, { steps: 5 });
    await page.mouse.up();
    await waitFrame();
    assert.equal(
      await impulseCount(),
      beforeDrag,
      "camera drag injects no environmental force",
    );
    await focus("grass");
    const beforeUi = await impulseCount();
    await page.locator(".render-quality-bar").hover();
    await waitFrame();
    assert.equal(
      await impulseCount(),
      beforeUi,
      "overlay UI injects no environmental force",
    );
    // Reuse a real architectural blocker so the normal occlusion candidate list sees it.
    const occludedPoint = await focus("grass");
    await page.evaluate(() => {
      const i = Building3D.instance,
        T = InteractionTestGeometry;
      const wall = i.model.pickables.find((m) => m.userData.kind === "wall");
      window.environmentTestWall = {
        wall,
        geometry: wall.geometry,
        position: wall.position.clone(),
        quaternion: wall.quaternion.clone(),
        scale: wall.scale.clone(),
        visible: wall.visible,
      };
      wall.geometry = new T.BoxGeometry(2, 0.2, 2);
      const point = new T.Vector3(...environmentTestTarget.point).add(
        new T.Vector3(0, 1, 0),
      );
      wall.position.copy(wall.parent.worldToLocal(point));
      wall.quaternion.identity();
      wall.scale.set(1, 1, 1);
      wall.visible = true;
      i.model.root.updateMatrixWorld(true);
      i.interaction.reset();
      i.render();
    });
    const beforeOcclusion = await impulseCount();
    await sweep(occludedPoint);
    assert.equal(
      await impulseCount(),
      beforeOcclusion,
      "architectural wall blocks vegetation interaction behind it",
    );
    await page.evaluate(() => {
      const saved = environmentTestWall;
      saved.wall.geometry.dispose();
      saved.wall.geometry = saved.geometry;
      saved.wall.position.copy(saved.position);
      saved.wall.quaternion.copy(saved.quaternion);
      saved.wall.scale.copy(saved.scale);
      saved.wall.visible = saved.visible;
      Building3D.instance.model.root.updateMatrixWorld(true);
      Building3D.instance.interaction.reset();
    });
    const photoPoint = await focus("grass");
    console.log("Checking Photo interruption and snapshot resumption");
    const photoStarted = Date.now();
    await page.click('[data-render-mode="photo"]');
    await page.waitForFunction(
      () =>
        Building3D.instance.quality.photo?.samples >= 1 ||
        Building3D.instance.quality.error,
      null,
      { timeout: 120000 },
    );
    assert.equal(
      await page.evaluate(() => Building3D.instance.quality.error),
      null,
    );
    results.photoPreparationMs = Date.now() - photoStarted;
    await page.evaluate(() => {
      const photo = Building3D.instance.quality.photo;
      const setScene = photo.setScene.bind(photo);
      window.environmentSnapshotCalls = 0;
      photo.setScene = (...args) => {
        environmentSnapshotCalls++;
        return setScene(...args);
      };
    });
    await sweep(photoPoint);
    assert(
      (await diagnostics()).moving,
      "Photo interaction remains in preview while vegetation settles",
    );
    assert.equal(
      await page.evaluate(() => environmentSnapshotCalls),
      0,
      "no path-traced snapshot rebuild while moving",
    );
    await page.mouse.move(8, 8);
    await page.waitForFunction(
      () => {
        const i = Building3D.instance;
        return (
          !i.interaction.diagnostics.moving &&
          environmentSnapshotCalls > 0 &&
          i.quality.photo?.samples >= 1
        );
      },
      null,
      { timeout: 120000 },
    );
    assert.equal(
      await page.evaluate(() => environmentSnapshotCalls),
      1,
      "one settled snapshot rebuild resumes Photo sampling",
    );
    await page.screenshot({ path: path.join(out, "settled-photo.png") });
    await page.click('[data-render-mode="explore"]');
    const demoStarted = Date.now();
    for (const kind of ["grass", "water", "foliage"]) {
      await focus(kind);
      const point = await page.evaluate((kind) => {
        const i = Building3D.instance,
          T = InteractionTestGeometry;
        const point = new T.Vector3(...environmentTestTarget.point);
        const halfHeight = kind === "grass" ? 0.4 : kind === "water" ? 1.8 : 3;
        const offset =
          kind === "grass"
            ? new T.Vector3(0, 0.8, 1.5)
            : kind === "water"
              ? new T.Vector3(1.5, 2.5, 3.5)
              : new T.Vector3(0, 2, 20);
        i.camera.up.set(0, 1, 0);
        i.camera.position.copy(point).add(offset);
        i.camera.lookAt(point);
        const box = i.renderer.domElement.getBoundingClientRect(),
          aspect = box.width / box.height;
        i.camera.left = -halfHeight * aspect;
        i.camera.right = halfHeight * aspect;
        i.camera.top = halfHeight;
        i.camera.bottom = -halfHeight;
        i.camera.updateProjectionMatrix();
        i.camera.updateMatrixWorld(true);
        i.interaction.reset();
        i.render();
        const projected = point.project(i.camera);
        return {
          x: box.left + (projected.x * 0.5 + 0.5) * box.width,
          y: box.top + (-projected.y * 0.5 + 0.5) * box.height,
        };
      }, kind);
      await Promise.all([
        (async () => {
          for (let n = 0; n < 5; n++)
            await sweep(point, {
              reverse: Boolean(n % 2),
              axis: kind === "foliage" ? "y" : "x",
              span: 240,
              interval: 20,
            });
        })(),
        (async () => {
          await delay(700);
          await page.screenshot({
            path: path.join(out, `${kind}-angled-motion.png`),
          });
        })(),
      ]);
      await page.mouse.move(8, 8);
      await delay(800);
    }
    demoEnded = Date.now();
    demoDuration = (demoEnded - demoStarted) / 1000;
    await page.evaluate(() => {
      const i = Building3D.instance;
      i.settings.floor = "first";
      i.update(true);
    });
    await waitFrame();
    const hidden = await impulseCount();
    await sweep(photoPoint);
    assert.equal(
      await impulseCount(),
      hidden,
      "hidden ground environment does not interact",
    );
    await page.click("#mode-2d");
    const inactive = await diagnostics();
    await delay(250);
    assert.equal(
      (await diagnostics()).revision,
      inactive.revision,
      "inactive view does not keep simulating",
    );
    assert.deepEqual(errors, []);
    results.final = await diagnostics();
    results.errors = errors;
    fs.writeFileSync(
      path.join(out, "checks.json"),
      JSON.stringify(results, null, 2) + "\n",
    );
    succeeded = true;
    console.log(
      "PASS real hover, first-entry/stationary/drag/UI filtering, speed/direction, actual grass/foliage/water deformation, occlusion, hidden/inactive states and Photo settling/resumption",
    );
  } catch (error) {
    await page
      .screenshot({ path: path.join(out, "failure.png") })
      .catch(() => {});
    const state = await diagnostics().catch(() => ({}));
    if (state.controllers)
      state.controllers = state.controllers.filter(
        (c) => c.kind !== "foliage" || c.id.endsWith("front-shade-tree"),
      );
    console.error("INTERACTION STATE", JSON.stringify(state));
    throw error;
  } finally {
    const video = page.video();
    await context.close();
    if (video && succeeded) {
      const raw = path.join(out, "interaction-recording.webm");
      await video.saveAs(raw);
      const clip = path.join(out, "landscape-interaction.webm");
      const encoded = spawnSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-sseof",
        String(-demoDuration - (Date.now() - demoEnded) / 1000),
        "-i",
        raw,
        "-t",
        String(demoDuration),
        "-an",
        "-c:v",
        "libvpx-vp9",
        "-crf",
        "32",
        "-b:v",
        "0",
        "-y",
        clip,
      ]);
      if (encoded.status !== 0) fs.copyFileSync(raw, clip);
      fs.unlinkSync(raw);
      fs.rmSync(path.join(out, "failure.png"), { force: true });
    }
    if (video) await video.delete();
    if (succeeded)
      for (const name of fs.readdirSync(out))
        if (name.startsWith("page@") && name.endsWith(".webm"))
          fs.unlinkSync(path.join(out, name));
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
