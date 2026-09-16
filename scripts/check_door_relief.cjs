const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "audit/door-relief");
const baseline = process.argv.includes("--baseline");
const prefix = baseline ? "before-" : "";
const viewer = path.join(
  root,
  baseline ? "tmp/door-relief-baseline.html" : "9-glenn-viewer.html",
);
fs.mkdirSync(out, { recursive: true });
const helper = buildSync({
  stdin: {
    contents:
      'import {Vector3,Box3} from "three";window.DoorReliefTest={Vector3,Box3};',
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
      viewport: { width: 1200, height: 950 },
    }),
    errors = [],
    results = { baseline, baselineCommit: baseline ? "e5dca89" : null };
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const frame = () =>
    page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
  async function capture(name) {
    await frame();
    await page.screenshot({ path: path.join(out, `${prefix}${name}.png`) });
  }
  async function focus(
    keys,
    { oblique = false, detail = false, interior = false } = {},
  ) {
    await page.mouse.move(8, 8);
    return page.evaluate(
      ({ keys, oblique, detail, interior }) => {
        const i = Building3D.instance,
          T = DoorReliefTest;
        i.pivot.quaternion.identity();
        i.pivot.position.set(0, 0, 0);
        i.model.root.position.set(0, 0, 0);
        i.pivot.updateMatrixWorld(true);
        const meshes = i.model.pickables.filter((m) =>
          keys.includes(m.userData.doorKey),
        );
        const box = new T.Box3();
        meshes.forEach((m) => box.union(new T.Box3().setFromObject(m)));
        const point = box.getCenter(new T.Vector3()),
          mesh = meshes[0];
        const normal = new T.Vector3(0, 0, 1).transformDirection(
            mesh.matrixWorld,
          ),
          tangent = new T.Vector3(1, 0, 0).transformDirection(mesh.matrixWorld);
        if (detail)
          point.copy(
            new T.Box3().setFromObject(mesh).getCenter(new T.Vector3()),
          );
        i.camera.position
          .copy(point)
          .addScaledVector(normal, interior ? 0.65 : oblique ? 1.7 : 2.5)
          .addScaledVector(tangent, oblique ? (interior ? 0.2 : 0.85) : 0);
        i.camera.up.set(0, 1, 0);
        i.camera.lookAt(point);
        const rect = i.renderer.domElement.getBoundingClientRect(),
          half = detail ? 0.5 : 1.22;
        i.camera.left = (-half * rect.width) / rect.height;
        i.camera.right = -i.camera.left;
        i.camera.top = half;
        i.camera.bottom = -half;
        i.camera.zoom = 1;
        i.camera.updateProjectionMatrix();
        i.camera.updateMatrixWorld(true);
        i.selection.select([]);
        document.querySelector("#model-selection").hidden = true;
        i.interaction.reset();
        i.quality.sceneChanged();
        i.render();
        const click = new T.Box3()
          .setFromObject(mesh)
          .getCenter(new T.Vector3())
          .project(i.camera);
        return {
          target: point.toArray(),
          eye: i.camera.position.toArray(),
          normal: normal.toArray(),
          click: {
            x: rect.left + (click.x * 0.5 + 0.5) * rect.width,
            y: rect.top + (-click.y * 0.5 + 0.5) * rect.height,
          },
        };
      },
      { keys, oblique, detail, interior },
    );
  }
  async function inventory() {
    return page.evaluate(() => {
      const i = Building3D.instance,
        T = DoorReliefTest;
      const mapStats = (map) => {
        if (!map?.image) return null;
        const image = map.image;
        let data,
          width = image.width,
          height = image.height;
        if (image.data) data = image.data;
        else {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0);
          data = context.getImageData(0, 0, width, height).data;
        }
        const channels = data.length / (width * height),
          min = [Infinity, Infinity, Infinity],
          max = [-Infinity, -Infinity, -Infinity],
          sum = [0, 0, 0],
          square = [0, 0, 0];
        let count = 0;
        const stride = Math.max(1, Math.floor((width * height) / 65536));
        for (let pixel = 0; pixel < width * height; pixel += stride) {
          count++;
          for (let k = 0; k < 3; k++) {
            const v = data[pixel * channels + Math.min(k, channels - 1)];
            min[k] = Math.min(min[k], v);
            max[k] = Math.max(max[k], v);
            sum[k] += v;
            square[k] += v * v;
          }
        }
        return {
          width,
          height,
          channel: map.channel,
          wrapS: map.wrapS,
          wrapT: map.wrapT,
          offset: map.offset.toArray(),
          repeat: map.repeat.toArray(),
          min,
          max,
          deviation: sum.map((s, k) =>
            Math.sqrt(Math.max(0, square[k] / count - (s / count) ** 2)),
          ),
        };
      };
      return i.model.pickables
        .filter(
          (m) =>
            m.userData.kind === "door" &&
            (m.userData.doorRelief ||
              m.material.userData?.wood ||
              m.material.userData?.generatedTexture === "timber"),
        )
        .map((mesh) => {
          const geometry = mesh.geometry,
            position = geometry.attributes.position,
            index = geometry.index;
          geometry.computeBoundingBox();
          let volume = 0;
          const count = index ? index.count : position.count;
          for (let n = 0; n < count; n += 3) {
            const a = index ? index.getX(n) : n,
              b = index ? index.getX(n + 1) : n + 1,
              c = index ? index.getX(n + 2) : n + 2;
            volume +=
              (position.getX(a) *
                (position.getY(b) * position.getZ(c) -
                  position.getZ(b) * position.getY(c)) +
                position.getY(a) *
                  (position.getZ(b) * position.getX(c) -
                    position.getX(b) * position.getZ(c)) +
                position.getZ(a) *
                  (position.getX(b) * position.getY(c) -
                    position.getY(b) * position.getX(c))) /
              6;
          }
          const uv = geometry.attributes.uv1,
            uvBounds = uv
              ? {
                  min: [Infinity, Infinity],
                  max: [-Infinity, -Infinity],
                  finite: true,
                }
              : null;
          if (uv)
            for (let n = 0; n < uv.count; n++) {
              for (let axis = 0; axis < 2; axis++) {
                const v = axis ? uv.getY(n) : uv.getX(n);
                uvBounds.finite &&= Number.isFinite(v);
                uvBounds.min[axis] = Math.min(uvBounds.min[axis], v);
                uvBounds.max[axis] = Math.max(uvBounds.max[axis], v);
              }
            }
          return {
            uuid: mesh.uuid,
            ...mesh.userData,
            geometry: geometry.type,
            geometryRelief: geometry.userData.carvedDoor,
            bounds: {
              min: geometry.boundingBox.min.toArray(),
              max: geometry.boundingBox.max.toArray(),
              size: geometry.boundingBox.getSize(new T.Vector3()).toArray(),
            },
            position: mesh.position.toArray(),
            triangles: count / 3,
            signedVolume: volume,
            uv1: uvBounds,
            material: {
              name: mesh.material.name,
              color: mesh.material.color?.getHexString(),
              userData: mesh.material.userData,
              bumpScale: mesh.material.bumpScale,
              normalScale: mesh.material.normalScale?.toArray(),
              normalMap: mapStats(mesh.material.normalMap),
              bumpMap: mapStats(mesh.material.bumpMap),
              map: mapStats(mesh.material.map),
            },
          };
        });
    });
  }
  async function photo(name, targetSamples = 32) {
    const started = Date.now();
    await page.evaluate(() => {
      const photo = Building3D.instance.quality.photo;
      window.doorPhotoReset = !photo;
      if (photo) {
        const setScene = photo.setScene;
        photo.setScene = function (...args) {
          const result = setScene.apply(this, args);
          window.doorPhotoReset = true;
          photo.setScene = setScene;
          return result;
        };
      }
    });
    await page.click('[data-render-mode="photo"]');
    // Start this camera's preparation before looking at the retained sample counter.
    await page.evaluate(() => Building3D.instance.render());
    await page.waitForFunction(
      (target) => {
        const quality = Building3D.instance.quality;
        return (
          quality.error ||
          (window.doorPhotoReset &&
            quality.mode === "photo" &&
            !quality.preparing &&
            quality.photo?.samples >= target)
        );
      },
      targetSamples,
      { timeout: 180000 },
    );
    assert.equal(
      await page.evaluate(() => Building3D.instance.quality.error),
      null,
    );
    await capture(name);
    const value = await page.evaluate(() => ({
      samples: Building3D.instance.quality.photo.samples,
      error: Building3D.instance.quality.error,
    }));
    value.elapsedMs = Date.now() - started;
    value.targetSamples = targetSamples;
    assert(
      value.samples >= targetSamples,
      "captured Photo belongs to the current camera and meets its sample target",
    );
    await page.click('[data-render-mode="explore"]');
    return value;
  }
  try {
    await page.goto("file://" + viewer + "#3d");
    await page.waitForFunction(
      () => window.Building3D?.instance?.interaction,
      null,
      { timeout: 60000 },
    );
    await page.addScriptTag({ content: helper });
    await page.click('[data-camera="top"]');
    await page.uncheck("#model-perspective");
    assert(
      await page.evaluate(
        () => Building3D.instance.renderer.backend.isWebGPUBackend,
      ),
    );
    results.doors = await inventory();
    fs.writeFileSync(
      path.join(out, `${prefix}materials.json`),
      JSON.stringify(results.doors, null, 2) + "\n",
    );
    console.log(
      "SOLID DOORS",
      JSON.stringify({
        count: results.doors.length,
        carved: results.doors.filter((d) => d.geometryRelief).length,
        trianglesPerLeaf: [...new Set(results.doors.map((d) => d.triangles))],
      }),
    );
    const keys = ["ground:front-entry-a", "ground:front-entry-b"];
    const beforeStates = await page.evaluate(
      (keys) =>
        keys.map((key) => {
          const d = Building3D.instance.model.doors.get(key);
          return {
            key,
            hinge: d.leaf.position.toArray(),
            closedAngle: d.closedAngle,
            swing: d.swing,
          };
        }),
      keys,
    );
    results.frontCamera = await focus(keys);
    await capture("front-closed");
    results.frontPhoto = await photo("front-closed-photo", baseline ? 32 : 128);
    await focus(keys, { oblique: true });
    await capture("front-oblique");
    results.obliquePhoto = await photo("front-oblique-photo");
    await focus(keys, { oblique: true, detail: true });
    await capture("front-carving-detail");
    const front = await focus(keys);
    await page.mouse.click(front.click.x, front.click.y);
    await page.waitForFunction(
      (keys) =>
        keys.every((key) => {
          const d = Building3D.instance.model.doors.get(key);
          return d.open && !d.animation;
        }),
      keys,
      { timeout: 15000 },
    );
    results.open = await page.evaluate(
      (keys) => ({
        selected: Building3D.instance.selection.objects.map(
          (m) => m.userData.doorKey,
        ),
        states: keys.map((key) => {
          const d = Building3D.instance.model.doors.get(key);
          return {
            key,
            hinge: d.leaf.position.toArray(),
            angle: d.leaf.rotation.y,
            open: d.open,
          };
        }),
      }),
      keys,
    );
    assert.deepEqual(
      new Set(results.open.selected),
      new Set(keys),
      "real click still selects both paired leaf meshes",
    );
    for (let n = 0; n < keys.length; n++) {
      assert.deepEqual(
        results.open.states[n].hinge,
        beforeStates[n].hinge,
        "door hinges remain fixed during opening",
      );
      assert(
        Math.abs(
          results.open.states[n].angle -
            (beforeStates[n].closedAngle -
              (beforeStates[n].swing * 70 * Math.PI) / 180),
        ) < 1e-6,
        "paired leaf still opens70degrees",
      );
    }
    await capture("front-open-selected");
    await page.evaluate(() => {
      Building3D.instance.selection.select([]);
      Building3D.instance.render();
    });
    await capture("front-open");
    await page.evaluate(() => {
      Building3D.instance.model.toggleDoor("ground:front-entry-a");
      Building3D.instance.render();
    });
    await page.waitForFunction(
      () =>
        !Building3D.instance.model.doors.get("ground:front-entry-a").animation,
    );
    await page.mouse.move(8, 8);
    const interior =
      results.doors.find((d) => d.doorKey === "ground:laundry-linen") ||
      results.doors.find(
        (d) => d.floor === "ground" && !d.doorKey.includes("front-entry"),
      );
    assert(interior, "interior solid door fixture exists");
    results.interiorKey = interior.doorKey;
    await focus([interior.doorKey], { oblique: true, interior: true });
    await capture("interior-door");
    await focus([interior.doorKey], {
      oblique: true,
      detail: true,
      interior: true,
    });
    await capture("interior-carving-detail");
    if (!baseline) {
      const previous = JSON.parse(
        fs.readFileSync(path.join(out, "before-materials.json"), "utf8"),
      );
      assert.equal(
        results.doors.length,
        previous.length,
        "all existing solid leaves remain present",
      );
      for (const door of results.doors) {
        assert(
          door.geometryRelief && door.doorRelief,
          "solid leaf uses carved geometry and retains geometry metadata",
        );
        assert(
          door.triangles > 100 && door.signedVolume > 0,
          "actual leaf has detailed positive-volume geometry",
        );
        const original = previous.find((d) => d.doorKey === door.doorKey);
        assert(original, "carved leaf retains its original door key");
        if (original) {
          for (let axis = 0; axis < 3; axis++)
            for (const bound of ["min", "max"])
              assert(
                Math.abs(
                  door.bounds[bound][axis] - original.bounds[bound][axis],
                ) < 1e-6,
                "carving preserves the old slab envelope",
              );
          assert.deepEqual(
            door.position,
            original.position,
            "carving preserves original local slab position",
          );
        }
        assert(
          door.uv1?.finite &&
            door.uv1.min.every((v) => v >= -1e-6) &&
            door.uv1.max.every((v) => v <= 1 + 1e-6),
          "whole-leaf relief UV1 remains unshifted within0–1",
        );
        for (const name of ["normalMap", "bumpMap"]) {
          const map = door.material[name];
          assert(
            map?.width >= 256 && Math.max(...map.deviation) > 0.2,
            `${name} loads nonuniform relief pixels`,
          );
          assert.equal(
            map.channel,
            1,
            `${name} uses the dedicated whole-leaf UV channel`,
          );
          assert.deepEqual(
            map.offset,
            [0, 0],
            "relief map has no finish-variation offset",
          );
          assert.deepEqual(
            map.repeat,
            [1, 1],
            "relief map covers the complete leaf once",
          );
        }
      }
    }
    results.errors = errors;
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(out, `${prefix}checks.json`),
      JSON.stringify(results, null, 2) + "\n",
    );
    fs.rmSync(path.join(out, `${prefix}failure.png`), { force: true });
    fs.rmSync(path.join(out, `${prefix}failure.json`), { force: true });
    console.log(
      "PASS door captures, actual paired click/swing, materials, geometry envelope and Photo",
      JSON.stringify({
        frontPhoto: results.frontPhoto,
        obliquePhoto: results.obliquePhoto,
        doors: results.doors.length,
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
