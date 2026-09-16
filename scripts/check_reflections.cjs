const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "audit/reflections");
const baseline = process.argv.includes("--baseline");
const prefix = baseline ? "before-" : "";
const viewerPath = baseline
  ? path.join(root, "tmp/reflections-baseline.html")
  : path.join(root, "index.html");
fs.mkdirSync(out, { recursive: true });
const helper = buildSync({
  stdin: {
    contents:
      'import {Vector3,Box3,Mesh,BoxGeometry,MeshBasicMaterial,Color,PerspectiveCamera} from "three";window.ReflectionTest={Vector3,Box3,Mesh,BoxGeometry,MeshBasicMaterial,Color,PerspectiveCamera};',
    resolveDir: root,
  },
  bundle: true,
  write: false,
  format: "iife",
}).outputFiles[0].text;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    args: ["--enable-unsafe-webgpu", "--disable-frame-rate-limit"],
    ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 850 },
  });
  const errors = [],
    results = { baseline, baselineCommit: baseline ? "5a1282e" : null };
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const frame = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const capture = async (name) => {
    // A distant view can contain more reflection planes than one frame's
    // capture budget. Give the fair refresh queue a bounded chance to drain.
    await page.evaluate(async () => {
      for (let n = 0; n < 12; n++)
        await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    const bytes = await page.screenshot({
      path: path.join(out, `${prefix}${name}.png`),
    });
    return bytes.toString("base64");
  };
  async function camera(target, offset, half) {
    await page.evaluate(
      ({ target, offset, half }) => {
        const i = Building3D.instance,
          T = ReflectionTest,
          point = new T.Vector3(...target);
        i.pivot.quaternion.identity();
        i.pivot.position.set(0, 0, 0);
        i.model.root.position.set(0, 0, 0);
        i.pivot.updateMatrixWorld(true);
        const canvas = i.renderer.domElement.getBoundingClientRect();
        i.camera.up.set(0, 1, 0);
        i.camera.position.copy(point).add(new T.Vector3(...offset));
        i.camera.lookAt(point);
        i.camera.left = (-half * canvas.width) / canvas.height;
        i.camera.right = -i.camera.left;
        i.camera.top = half;
        i.camera.bottom = -half;
        i.camera.zoom = 1;
        i.camera.updateProjectionMatrix();
        i.camera.updateMatrixWorld(true);
        i.interaction.reset();
        i.quality.sceneChanged();
        i.render();
      },
      { target, offset, half },
    );
    await frame();
  }
  async function markerPixels(image) {
    return page.evaluate(async (image) => {
      const bitmap = new Image();
      bitmap.src = `data:image/png;base64,${image}`;
      await bitmap.decode();
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let count = 0,
        x = 0,
        y = 0;
      for (let row = 180; row < 760; row++)
        for (let col = 160; col < 1040; col++) {
          const k = (row * canvas.width + col) * 4;
          if (
            data[k] > data[k + 1] + 20 &&
            data[k + 2] > data[k + 1] + 12 &&
            data[k] > 65
          ) {
            count++;
            x += col;
            y += row;
          }
        }
      return { count, centroid: count ? [x / count, y / count] : null };
    }, image);
  }
  try {
    await page.goto("file://" + viewerPath + "#3d");
    await page.waitForFunction(
      () => window.Building3D?.instance?.interaction,
      null,
      { timeout: 60000 },
    );
    await page.addScriptTag({ content: helper });
    assert(
      await page.evaluate(
        () => Building3D.instance.renderer.backend.isWebGPUBackend,
      ),
      "native WebGPU backend is active",
    );
    await page.click('[data-camera="top"]');
    await page.uncheck("#model-perspective");
    results.inventory = await page.evaluate(() => {
      const i = Building3D.instance,
        T = ReflectionTest;
      i.pivot.quaternion.identity();
      i.pivot.position.set(0, 0, 0);
      i.model.root.position.set(0, 0, 0);
      i.pivot.updateMatrixWorld(true);
      i.interaction.reset();
      i.render();
      const describe = (mesh) => {
        const box = new T.Box3().setFromObject(mesh);
        mesh.geometry.computeBoundingBox();
        return {
          uuid: mesh.uuid,
          ...mesh.userData,
          center: box.getCenter(new T.Vector3()).toArray(),
          size: box.getSize(new T.Vector3()).toArray(),
          geometrySize: mesh.geometry.boundingBox
            .getSize(new T.Vector3())
            .toArray(),
          geometry: mesh.geometry.type,
          thickness: mesh.material.thickness,
          transmission: mesh.material.transmission,
        };
      };
      const windows = i.model.pickables
        .filter(
          (mesh) =>
            mesh.userData.kind === "window" &&
            (mesh.userData.opticalSurface === "glass" ||
              mesh.material.transmission > 0),
        )
        .map(describe);
      const water = i.interaction.controllers.find(
          (c) => c.kind === "water",
        ).mesh,
        box = new T.Box3().setFromObject(water),
        center = box.getCenter(new T.Vector3());
      center.copy(water.geometry.boundingBox.getCenter(new T.Vector3()));
      center.y =
        water.userData.restWaterLevel ?? water.geometry.boundingBox.max.y;
      water.localToWorld(center);
      window.reflectionTestWater = water;
      window.reflectionTestWaterPoint = center;
      return {
        windows,
        water: {
          center: center.toArray(),
          size: box.getSize(new T.Vector3()).toArray(),
          side: water.material.side,
        },
        furniture: i.model.pickables
          .filter((m) => m.userData.kind === "furniture")
          .slice(0, 10)
          .map(describe),
        optics: i.selection.optics?.diagnostics || null,
      };
    });
    fs.writeFileSync(
      path.join(out, `${prefix}inventory.json`),
      JSON.stringify(results.inventory, null, 2) + "\n",
    );
    console.log(
      "PANES",
      results.inventory.windows.length,
      "OPTICS",
      results.inventory.optics,
    );
    const water = results.inventory.water.center;
    await camera(water, [1.5, 2.5, 3.5], 1.8);
    await capture("pool-statue");
    await camera(water, [0, 0.9, 6], 2.4);
    await capture("pool-low-angle");
    const pane = results.inventory.windows
      .filter((w) => w.floor === "ground")
      .sort((a, b) => b.center[2] - a.center[2])[0];
    assert(pane, "actual window pane fixture exists");
    results.windowFixture = pane;
    const normal = pane.size[0] > pane.size[2] ? [0, 0, 1] : [1, 0, 0];
    await camera(
      pane.center,
      normal[2] ? [2, 0, 2.5] : [2.5, 0, 2],
      Math.min(1.4, pane.size[1] * 0.75),
    );
    await capture("window-angle");
    // An actual scene marker is outside the main frustum but its mirrored
    // position is visible at the pool centre. Screen-space copies cannot pass.
    await camera(water, [0, 0.9, 4], 1.1);
    results.markerFixture = await page.evaluate(() => {
      const i = Building3D.instance,
        T = ReflectionTest,
        R = reflectionTestWaterPoint;
      const marker = new T.Mesh(
        new T.BoxGeometry(0.42, 0.42, 0.42),
        new T.MeshBasicMaterial({ color: 0xff00ff, toneMapped: false }),
      );
      marker.name = "reflection-test-marker";
      marker.position.copy(R).add(new T.Vector3(0, 1.08, -4.8));
      i.scene.add(marker);
      marker.updateMatrixWorld(true);
      window.reflectionTestMarker = marker;
      i.quality.sceneChanged();
      i.render();
      return {
        position: marker.position.toArray(),
        projection: marker.position.clone().project(i.camera).toArray(),
        mirroredProjection: new T.Vector3(
          marker.position.x,
          2 * R.y - marker.position.y,
          marker.position.z,
        )
          .project(i.camera)
          .toArray(),
      };
    });
    assert(
      Math.abs(results.markerFixture.projection[1]) > 1.1,
      "marker source lies outside the main view",
    );
    const original = await capture("offscreen-marker");
    results.markerOriginal = await markerPixels(original);
    await page.evaluate(() => {
      const i = Building3D.instance;
      reflectionTestMarker.position.x += 0.6;
      reflectionTestMarker.updateMatrixWorld(true);
      i.quality.sceneChanged();
      i.render();
    });
    results.markerMoved = await markerPixels(
      await capture("offscreen-marker-moved"),
    );
    if (!baseline) {
      assert(
        results.markerOriginal.count > 40,
        "offscreen object appears in actual scene reflection",
      );
      assert(results.markerMoved.count > 40, "moving object remains reflected");
      assert(
        results.markerMoved.centroid[0] >
          results.markerOriginal.centroid[0] + 30,
        "reflection follows object's horizontal motion",
      );
    }
    await page.evaluate(() => {
      const i = Building3D.instance;
      i.scene.remove(reflectionTestMarker);
      reflectionTestMarker.geometry.dispose();
      reflectionTestMarker.material.dispose();
      i.quality.sceneChanged();
      i.render();
    });
    if (!baseline) {
      for (const pane of results.inventory.windows)
        assert(
          Math.abs(Math.min(...pane.geometrySize) - 0.006) < 1e-6,
          `${pane.name}: actual 6 mm pane geometry`,
        );
      results.windowMarkers = [];
      for (const side of [1, -1])
        for (const perspective of [false, true]) {
          const R = [12.7, 1.85, pane.center[2]],
            offset = [0.9, 0, side * 1.4];
          const half = perspective
            ? Math.hypot(...offset) * Math.tan((42 * Math.PI) / 360)
            : 0.5;
          await camera(R, offset, half);
          await page.evaluate(
            (R) => Building3D.instance.orbit.target.set(...R),
            R,
          );
          await page.locator("#model-perspective").setChecked(perspective);
          await frame();
          const fixture = await page.evaluate(
            ({ R, side, perspective }) => {
              const i = Building3D.instance,
                T = ReflectionTest;
              const source = new T.Mesh(
                new T.BoxGeometry(0.22, 0.22, 0.22),
                new T.MeshBasicMaterial({
                  color: new T.Color(8, 0, 8),
                  toneMapped: false,
                }),
              );
              source.name = "window-reflection-test-marker";
              source.position.set(R[0] - 0.9, R[1], R[2] + side * 1.4);
              i.scene.add(source);
              source.updateMatrixWorld(true);
              window.reflectionTestMarker = source;
              let camera = i.camera;
              if (perspective) {
                const rect = i.renderer.domElement.getBoundingClientRect();
                camera = new T.PerspectiveCamera(
                  42,
                  rect.width / rect.height,
                  0.1,
                  220,
                );
                camera.position.copy(i.camera.position);
                camera.quaternion.copy(i.camera.quaternion);
                camera.updateMatrixWorld(true);
              }
              i.quality.sceneChanged();
              i.render();
              return {
                projection: source.position.clone().project(camera).toArray(),
                position: source.position.toArray(),
              };
            },
            { R, side, perspective },
          );
          assert(
            Math.abs(fixture.projection[0]) > 1.1,
            "window source lies outside main frustum",
          );
          const label = `window-${side === 1 ? "outside" : "inside"}-${perspective ? "perspective" : "orthographic"}`;
          const reflected = await markerPixels(
            await capture(label + "-reflection"),
          );
          assert(
            reflected.count > 30,
            `${label}: offscreen source reflects from this side`,
          );
          await page.evaluate(
            ({ R, side }) => {
              const i = Building3D.instance;
              reflectionTestMarker.position.set(
                R[0] - 0.27,
                R[1],
                R[2] - side * 0.42,
              );
              reflectionTestMarker.updateMatrixWorld(true);
              i.quality.sceneChanged();
              i.render();
            },
            { R, side },
          );
          const transmitted = await markerPixels(
            await capture(label + "-through-glass"),
          );
          assert(
            transmitted.count > 100,
            `${label}: object remains visible through glass`,
          );
          results.windowMarkers.push({
            side,
            perspective,
            fixture,
            reflected,
            transmitted,
          });
          console.log(
            "WINDOW",
            label,
            JSON.stringify({ reflected, transmitted }),
          );
          await page.evaluate(() => {
            const i = Building3D.instance;
            i.scene.remove(reflectionTestMarker);
            reflectionTestMarker.geometry.dispose();
            reflectionTestMarker.material.dispose();
            i.quality.sceneChanged();
            i.render();
          });
          await page.uncheck("#model-perspective");
        }
      await camera(pane.center, [2, 0, 2.5], 1.4);
      results.selection = await page.evaluate((uuid) => {
        const i = Building3D.instance,
          pane = i.model.pickables.find((m) => m.uuid === uuid),
          before = i.selection.optics.diagnostics.frames;
        i.selection.select([pane]);
        i.render();
        return {
          selected: i.selection.objects.length,
          before,
          after: i.selection.optics.diagnostics.frames,
        };
      }, pane.uuid);
      assert.equal(results.selection.selected, 1);
      assert(
        results.selection.after > results.selection.before,
        "selected window continues reflection updates",
      );
      await capture("selected-window");
      results.cutaway = await page.evaluate(() => {
        const i = Building3D.instance;
        i.settings.floor = "ground";
        i.settings.cut = true;
        i.update(false);
        i.render();
        return {
          enabled: i.model.floorGroups.get("ground").clipGroup.enabled,
          optics: i.selection.optics.diagnostics,
        };
      });
      assert(results.cutaway.enabled, "actual cutaway is enabled");
      await capture("selected-window-cutaway");
      await page.evaluate(() => {
        const i = Building3D.instance;
        i.selection.select([]);
        i.settings.floor = "all";
        i.settings.cut = false;
        i.update(false);
        i.render();
      });
      results.performance = {};
      for (const view of ["house", "pool"]) {
        if (view === "house") {
          await page.evaluate(() => {
            const i = Building3D.instance,
              rect = i.renderer.domElement.getBoundingClientRect();
            i.camera.left = (-20 * rect.width) / rect.height;
            i.camera.right = -i.camera.left;
            i.camera.top = 20;
            i.camera.bottom = -20;
            i.camera.zoom = 1;
            i.camera.updateProjectionMatrix();
          });
          await page.click('[data-camera="iso"]');
          await frame();
        } else await camera(water, [1.5, 2.5, 3.5], 1.8);
        await capture(`performance-${view}`);
        results.performance[view] = await page.evaluate(async () => {
          const i = Building3D.instance,
            original = i.selection.render.bind(i.selection),
            records = [];
          i.selection.render = (camera) => {
            i.selection.optics.invalidate();
            const start = performance.now();
            original(camera);
            records.push({ start, cpu: performance.now() - start });
          };
          try {
            i.render();
            await new Promise((resolve) => {
              const step = () => {
                if (records.length >= 14) resolve();
                else requestAnimationFrame(step);
              };
              requestAnimationFrame(step);
            });
          } finally {
            i.selection.render = original;
          }
          const samples = records.slice(2),
            times = samples.slice(1).map((s, n) => s.start - samples[n].start),
            mean = times.reduce((a, b) => a + b, 0) / times.length;
          return {
            frameMs: mean,
            approxFps: 1000 / mean,
            submissionMs:
              samples.reduce((sum, s) => sum + s.cpu, 0) / samples.length,
            frames: samples.length,
            optics: i.selection.optics.diagnostics,
          };
        });
        console.log(
          "PERFORMANCE",
          view,
          JSON.stringify(results.performance[view]),
        );
      }
    }
    if (!baseline) {
      await camera(water, [1.5, 2.5, 3.5], 1.8);
      const start = Date.now();
      await page.click('[data-render-mode="photo"]');
      await page.waitForFunction(
        () =>
          Building3D.instance.quality.photo?.samples >= 8 ||
          Building3D.instance.quality.error,
        null,
        { timeout: 180000 },
      );
      assert.equal(
        await page.evaluate(() => Building3D.instance.quality.error),
        null,
      );
      results.photo = await page.evaluate(() => ({
        samples: Building3D.instance.quality.photo.samples,
      }));
      results.photo.elapsedMs = Date.now() - start;
      await capture("pool-photo");
    }
    fs.rmSync(path.join(out, `${prefix}failure.json`), { force: true });
    fs.rmSync(path.join(out, `${prefix}failure.png`), { force: true });
    results.errors = errors;
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(out, `${prefix}checks.json`),
      JSON.stringify(results, null, 2) + "\n",
    );
    console.log(
      "PASS",
      JSON.stringify({
        baseline,
        marker: results.markerOriginal,
        moved: results.markerMoved,
        photo: results.photo,
      }),
    );
  } catch (error) {
    await page
      .screenshot({ path: path.join(out, `${prefix}failure.png`) })
      .catch(() => {});
    fs.writeFileSync(
      path.join(out, `${prefix}failure.json`),
      JSON.stringify({ error: String(error), results, errors }, null, 2) + "\n",
    );
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
