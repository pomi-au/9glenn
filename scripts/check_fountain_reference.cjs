const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { buildSync } = require("esbuild");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "audit/fountain-reference"),
  prefix = "integrated-",
  view = process.argv.find((a) => a.startsWith("--view="))?.split("=")[1];
fs.mkdirSync(out, { recursive: true });
const helper = buildSync({
  stdin: {
    contents:
      'import {Box3,Vector3,Scene} from "three";import {createPhotoScene} from "./model/photo-scene.js";window.DetailTest={Box3,Vector3,Scene,createPhotoScene};',
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
      viewport: { width: 1000, height: 900 },
    }),
    errors = [],
    results =
      view && fs.existsSync(path.join(out, prefix + "checks.json"))
        ? JSON.parse(fs.readFileSync(path.join(out, prefix + "checks.json")))
        : { viewer: "current integrated standalone" };
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(m.text());
      console.error(m.text());
    }
  });
  const frames = () =>
    page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
  async function capture(name) {
    await frames();
    await page.screenshot({ path: path.join(out, prefix + name + ".png") });
  }
  async function camera(kind) {
    return page.evaluate((kind) => {
      const i = Building3D.instance,
        T = DetailTest;
      i.pivot.quaternion.identity();
      i.pivot.position.set(0, 0, 0);
      i.model.root.position.set(0, 0, 0);
      i.pivot.updateMatrixWorld(true);
      const parts = i.model.pickables.filter((m) => m.userData.sculptureStyle),
        box = new T.Box3();
      for (const mesh of parts) box.expandByObject(mesh);
      const eyes = i.model.pickables.find(
        (m) => m.userData.part === "fountain mermaid eyelids and eyes",
      );
      const target =
        kind === "face"
          ? new T.Box3().setFromObject(eyes).getCenter(new T.Vector3())
          : box.getCenter(new T.Vector3());
      if (kind === "face") target.y -= 0.015;
      const offset =
        kind === "face"
          ? [0.08, 0.015, -0.7]
          : kind === "front"
            ? [0, 0.08, -3.6]
            : [1.5, 0.25, -3.2];
      const half = kind === "face" ? 0.22 : (box.max.y - box.min.y) * 0.63;
      const part = kind;
      i.camera.position.copy(target).add(new T.Vector3(...offset));
      i.camera.up.set(0, 1, 0);
      i.camera.lookAt(target);
      i.orbit.target.copy(target);
      const rect = i.renderer.domElement.getBoundingClientRect();
      i.camera.left = (-half * rect.width) / rect.height;
      i.camera.right = -i.camera.left;
      i.camera.top = half;
      i.camera.bottom = -half;
      i.camera.zoom = 1;
      i.camera.updateProjectionMatrix();
      i.camera.updateMatrixWorld(true);
      i.interaction.reset();
      i.quality.sceneChanged();
      i.render();
      return {
        part,
        eye: i.camera.position.toArray(),
        target: target.toArray(),
        half,
      };
    }, kind);
  }
  async function inventory() {
    return page.evaluate(() => {
      const stats = (map) => {
        if (!map?.image) return null;
        const image = map.image;
        let data = image.data;
        if (!data) {
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0);
          data = ctx.getImageData(0, 0, image.width, image.height).data;
        }
        const channels = data.length / (image.width * image.height);
        let hash = 2166136261,
          min = 255,
          max = 0,
          s = 0,
          ss = 0,
          count = 0;
        for (
          let n = 0;
          n < data.length;
          n +=
            Math.max(1, Math.floor((image.width * image.height) / 65536)) *
            channels
        ) {
          const v = data[n];
          hash = Math.imul(hash ^ v, 16777619) >>> 0;
          min = Math.min(min, v);
          max = Math.max(max, v);
          s += v;
          ss += v * v;
          count++;
        }
        return {
          name: map.name,
          width: image.width,
          height: image.height,
          channel: map.channel,
          repeat: map.repeat.toArray(),
          offset: map.offset.toArray(),
          min,
          max,
          std: Math.sqrt(ss / count - (s / count) ** 2),
          hash: hash.toString(16),
        };
      };
      return Building3D.instance.model.pickables
        .filter((m) => m.userData.sculptureStyle)
        .map((m) => ({
          part: m.userData.part,
          triangles:
            (m.geometry.index?.count || m.geometry.attributes.position.count) /
            3,
          uv1: !!m.geometry.attributes.uv1,
          material: {
            name: m.material.name,
            color: m.material.color?.getHexString(),
            metalness: m.material.metalness,
            roughness: m.material.roughness,
            normalScale: m.material.normalScale?.toArray(),
            bumpScale: m.material.bumpScale,
            userData: m.material.userData,
            map: stats(m.material.map),
            normalMap: stats(m.material.normalMap),
            bumpMap: stats(m.material.bumpMap),
          },
        }));
    });
  }
  async function photo(kind) {
    await page.evaluate(() => {
      const p = Building3D.instance.quality.photo;
      window.detailSnapshot = !p;
      if (p) {
        const old = p.setScene;
        p.setScene = function (...a) {
          const value = old.apply(this, a);
          window.detailSnapshot = true;
          p.setScene = old;
          return value;
        };
      }
    });
    await page.click('[data-render-mode="photo"]');
    await page.waitForFunction(
      () => {
        const q = Building3D.instance.quality;
        return (
          q.error ||
          (window.detailSnapshot && !q.preparing && q.photo?.samples >= 1)
        );
      },
      null,
      { timeout: 180000 },
    );
    assert.equal(
      await page.evaluate(() => Building3D.instance.quality.error),
      null,
    );
    await page.evaluate(() => {
      const i = Building3D.instance,
        w = i.interaction.controllers.find((c) => c.kind === "water");
      window.photoWater = {
        position: Array.from(w.mesh.geometry.attributes.position.array),
        normal: Array.from(w.mesh.geometry.attributes.normal.array),
        impacts: w.diagnostics.impactCount,
      };
      window.photoSamples = [];
      window.photoTimer = setInterval(
        () => window.photoSamples.push(i.quality.photo.samples),
        100,
      );
    });
    await page.waitForFunction(
      () =>
        Building3D.instance.quality.error ||
        Building3D.instance.quality.photo.samples >= 80,
      null,
      { timeout: 180000 },
    );
    assert.equal(
      await page.evaluate(() => Building3D.instance.quality.error),
      null,
    );
    await page.evaluate(() => {
      const p = Building3D.instance.quality.photo;
      window.detailRender = p.renderSample;
      p.renderSample = () => p.present(false);
      p.present();
    });
    await capture(kind + "-photo");
    const downloadPromise = page.waitForEvent("download");
    await page.click("#model-download");
    await (
      await downloadPromise
    ).saveAs(path.join(out, prefix + kind + "-export.png"));
    const value = await page.evaluate(() => ({
      samples: Building3D.instance.quality.photo.samples,
      counts: Building3D.instance.quality.photo.sampleCounts,
      denoise: Building3D.instance.quality.photo.denoiseDiagnostics,
    }));
    assert(value.samples >= 80);
    value.freeze = await page.evaluate(() => {
      clearInterval(window.photoTimer);
      const i = Building3D.instance,
        w = i.interaction.controllers.find((c) => c.kind === "water");
      return {
        positionStable: Array.from(
          w.mesh.geometry.attributes.position.array,
        ).every((v, k) => v === window.photoWater.position[k]),
        normalStable: Array.from(w.mesh.geometry.attributes.normal.array).every(
          (v, k) => v === window.photoWater.normal[k],
        ),
        impactBefore: window.photoWater.impacts,
        impactAfter: w.diagnostics.impactCount,
        samples: window.photoSamples,
      };
    });
    assert(value.freeze.positionStable && value.freeze.normalStable);
    assert.equal(value.freeze.impactBefore, value.freeze.impactAfter);
    assert(
      value.freeze.samples.every((s, n, a) => !n || s >= a[n - 1]),
      "Photo converges without fountain reset loop",
    );
    await page.evaluate(() => {
      Building3D.instance.quality.photo.renderSample = window.detailRender;
    });
    await page.click('[data-render-mode="explore"]');
    return value;
  }
  async function motion() {
    await page.evaluate(() => {
      const w = Building3D.instance.interaction.controllers.find(
        (c) => c.kind === "water",
      );
      window.fountainMotionBefore = {
        position: w.mesh.geometry.attributes.position.array.slice(),
        normal: w.mesh.geometry.attributes.normal.array.slice(),
        impacts: w.diagnostics.impactCount,
      };
    });
    await page.waitForFunction(
      () => {
        const w = Building3D.instance.interaction.controllers.find(
          (c) => c.kind === "water",
        );
        return (
          w.diagnostics.impactCount >= window.fountainMotionBefore.impacts + 2
        );
      },
      null,
      { timeout: 10000 },
    );
    await frames(8);
    const result = await page.evaluate(() => {
      const i = Building3D.instance,
        w = i.interaction.controllers.find((c) => c.kind === "water"),
        saved = window.fountainMotionBefore,
        p = w.mesh.geometry.attributes.position,
        n = w.mesh.geometry.attributes.normal;
      let positionDelta = 0,
        normalDelta = 0;
      for (let k = 0; k < p.array.length; k++)
        positionDelta = Math.max(
          positionDelta,
          Math.abs(p.array[k] - saved.position[k]),
        );
      for (let k = 0; k < n.array.length; k++)
        normalDelta = Math.max(
          normalDelta,
          Math.abs(n.array[k] - saved.normal[k]),
        );
      return {
        positionDelta,
        normalDelta,
        impactsBefore: saved.impacts,
        water: w.diagnostics,
        reflection: i.selection.optics.diagnostics,
        fountain:
          i.model.pickables.find((m) => m.userData.fountain)?.userData
            .fountain || null,
      };
    });
    assert(
      result.positionDelta > 0.00005,
      "stream impacts deform actual water vertices",
    );
    assert(
      result.normalDelta > 0.001,
      "surface normals move for live reflected-water distortion",
    );
    assert(
      result.water.maxHeight > 0,
      "stream produces a visible surface wave",
    );
    const flow = result.fountain;
    assert(
      flow && flow.time >= flow.flightTime && flow.incomingVelocity[1] < 0,
      "impacts begin after the falling stream reaches the surface",
    );
    for (const axis of [0, 2])
      assert(
        Math.abs(
          flow.impact[axis] -
            flow.nozzle[axis] -
            flow.incomingVelocity[axis] * flow.flightTime,
        ) < 1e-5,
        "stream impact follows its horizontal ballistic velocity",
      );
    const initialY = flow.incomingVelocity[1] + 9.81 * flow.flightTime;
    assert(
      Math.abs(
        flow.nozzle[1] +
          initialY * flow.flightTime -
          4.905 * flow.flightTime ** 2 -
          flow.impact[1],
      ) < 1e-5,
      "stream falls under gravity to its measured contact point",
    );
    return result;
  }
  try {
    await page.goto("file://" + path.join(root, "index.html") + "#3d");
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
    );
    await page.click('[data-camera="top"]');
    await page.uncheck("#model-perspective");
    results.materials = await inventory();
    assert(results.materials.length >= 10, "All sculpture parts tagged");
    for (const m of results.materials) {
      assert(m.material.map?.std > 0, "Loaded bronze colour");
      assert(m.material.normalMap?.std > 0, "Loaded bronze normal");
      assert(m.material.bumpMap?.std > 0, "Loaded bronze height");
    }
    results.sculptureSnapshot = await page.evaluate(() => {
      const i = Building3D.instance,
        T = DetailTest,
        scene = new T.Scene(),
        parts = i.model.pickables.filter((m) => m.userData.sculptureStyle);
      i.scene.updateMatrixWorld(true);
      for (const source of parts) {
        const clone = source.clone();
        clone.children = [];
        source.matrixWorld.decompose(
          clone.position,
          clone.quaternion,
          clone.scale,
        );
        scene.add(clone);
      }
      const snapshot = T.createPhotoScene(scene, i.camera),
        meshes = [];
      snapshot.scene.traverse((m) => {
        if (m.isMesh) meshes.push(m);
      });
      const preserved = parts.every((p) =>
        meshes.some(
          (m) =>
            m.userData.part === p.userData.part &&
            m.material === p.material &&
            m.material.normalMap === p.material.normalMap,
        ),
      );
      const result = {
        source: parts.length,
        photo: meshes.length,
        mapsPreserved: preserved,
      };
      snapshot.dispose();
      return result;
    });
    assert.equal(
      results.sculptureSnapshot.photo,
      results.sculptureSnapshot.source,
    );
    assert(results.sculptureSnapshot.mapsPreserved);
    await camera("front");
    results.motion = await motion();
    for (const kind of view ? view.split(",") : ["front", "angle", "face"]) {
      results[kind] = { camera: await camera(kind) };
      await capture(kind + "-explore");
      if (kind !== "front") {
        results[kind].photo = await photo(kind);
        console.log(
          kind,
          JSON.stringify({
            samples: results[kind].photo.samples,
            counts: results[kind].photo.counts,
            denoise: results[kind].photo.denoise,
            frozen:
              results[kind].photo.freeze.positionStable &&
              results[kind].photo.freeze.normalStable,
          }),
        );
      }
    }
    results.alignment = await page.evaluate(() => {
      const i = Building3D.instance,
        T = DetailTest,
        stream = i.model.pickables.find((m) => m.userData.fountain),
        p = stream.geometry.attributes.position,
        point = new T.Vector3()
          .fromBufferAttribute(p, p.count - 1)
          .applyMatrix4(stream.matrixWorld),
        basin = i.model.pickables.find(
          (m) => m.userData.part === "fountain basin water",
        ),
        box = new T.Box3().setFromObject(basin),
        water = i.interaction.controllers.find((c) => c.kind === "water").mesh;
      return {
        endpoint: point.toArray(),
        impact: stream.userData.fountain.impact,
        waterLevel: water.userData.restWaterLevel,
        sampledSurface: i.interaction.controllers
          .find((c) => c.kind === "water")
          .sampleHeight(
            ...[
              stream.userData.fountain.impact[0],
              stream.userData.fountain.impact[2],
            ],
          ),
        basinTop: box.max.y,
        nozzle: stream.userData.fountain.nozzle,
        torusCount: i.model.pickables.filter(
          (m) =>
            m.geometry.type === "TorusGeometry" &&
            m.userData.part?.includes("ripple"),
        ).length,
      };
    });
    assert.equal(results.alignment.torusCount, 0);
    assert(
      Math.abs(results.alignment.impact[1] - results.alignment.sampledSurface) <
        0.006,
      "Stream reaches the current wave surface within its contact radius",
    );
    for (let k = 0; k < 3; k++)
      assert(
        Math.abs(results.alignment.endpoint[k] - results.alignment.impact[k]) <
          1e-5,
      );
    assert(
      Math.abs(results.alignment.nozzle[1] - results.alignment.basinTop) <
        0.015,
      "Bowl water meets pouring lip",
    );
    results.status = "Passed";
    results.errors = errors;
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(out, prefix + "checks.json"),
      JSON.stringify(results, null, 2) + "\n",
    );
    console.log(
      "PASS integrated reference fountain, actual Photo maps, frozen waves and ballistic impacts",
    );
  } catch (error) {
    await page
      .screenshot({ path: path.join(out, prefix + "failure.png") })
      .catch(() => {});
    fs.writeFileSync(
      path.join(out, prefix + "failure.json"),
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
