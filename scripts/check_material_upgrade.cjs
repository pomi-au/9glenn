const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const { spawnSync } = require("node:child_process");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "audit/material-upgrade");
const baseline = process.argv.includes("--baseline");
const prefix = baseline ? "before-" : "";
fs.mkdirSync(out, { recursive: true });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const helper = buildSync({
  stdin: {
    contents:
      'import {Vector3,Box3} from "three";window.MaterialTestGeometry={Vector3,Box3};',
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
  const context = await browser.newContext({
    viewport: { width: 1200, height: 850 },
  });
  let page = await context.newPage();
  const errors = [],
    results = { baseline };
  let success = false;
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
  const diagnostics = () =>
    page.evaluate(() => Building3D.instance.interaction.diagnostics);
  async function reset() {
    await page.mouse.move(8, 8);
    await page.evaluate(() => {
      Building3D.instance.interaction.reset();
      Building3D.instance.render();
    });
    await frame();
  }
  async function focus(kind) {
    await reset();
    return page.evaluate((kind) => {
      const i = Building3D.instance,
        T = MaterialTestGeometry;
      i.settings.floor = "all";
      i.settings.cut = false;
      i.settings.roof = true;
      i.update(false);
      i.pivot.quaternion.identity();
      i.pivot.position.set(0, 0, 0);
      i.model.root.position.set(0, 0, 0);
      i.pivot.updateMatrixWorld(true);
      const all = i.interaction.controllers.filter((c) => c.kind === kind);
      const c = all.find((c) => c.id.endsWith("front-shade-tree")) || all[0];
      let point;
      if (kind === "grass") {
        let best = Infinity;
        const matrices = c.mesh.instanceMatrix.array;
        for (let n = 12; n < matrices.length; n += 16) {
          const d = (matrices[n] - 18) ** 2 + (matrices[n + 2] - 19) ** 2;
          if (d < best) {
            best = d;
            point = new T.Vector3(
              matrices[n],
              matrices[n + 1],
              matrices[n + 2],
            );
          }
        }
        c.group.localToWorld(point);
      } else {
        const box = new T.Box3().setFromObject(c.mesh);
        point = box.getCenter(new T.Vector3());
        if (kind === "water") point.y = box.max.y;
      }
      const offset =
        kind === "grass"
          ? [0, 0.75, 1.8]
          : kind === "water"
            ? [1.5, 2.5, 3.5]
            : [0, 2, 20];
      const half = kind === "grass" ? 0.65 : kind === "water" ? 1.8 : 2.5;
      i.camera.up.set(0, 1, 0);
      i.camera.position.copy(point).add(new T.Vector3(...offset));
      i.camera.lookAt(point);
      const box = i.renderer.domElement.getBoundingClientRect();
      i.camera.left = (-half * box.width) / box.height;
      i.camera.right = -i.camera.left;
      i.camera.top = half;
      i.camera.bottom = -half;
      i.camera.zoom = 1;
      i.camera.updateProjectionMatrix();
      i.camera.updateMatrixWorld(true);
      i.interaction.reset();
      i.render();
      return {
        id: c.id,
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
      };
    }, kind);
  }
  async function opaqueFoliage(point) {
    for (const [dx, dy] of [
      [0, 0],
      [60, 0],
      [-60, 0],
      [0, 60],
      [0, -60],
      [60, 60],
      [-60, -60],
    ]) {
      let visible = true;
      for (const sy of [-55, 0, 55]) {
        await reset();
        await page.mouse.move(point.x + dx, point.y + dy + sy);
        await frame();
        if ((await diagnostics()).pointer.lastTarget !== point.id) {
          visible = false;
          break;
        }
      }
      if (visible) {
        await reset();
        return { ...point, x: point.x + dx, y: point.y + dy };
      }
    }
    throw new Error("No opaque leaf patch found for normal vertical stroke");
  }
  async function sweep(
    point,
    { reverse = false, vertical = false, span = 160 } = {},
  ) {
    const move = (t) =>
      page.mouse.move(
        point.x + (vertical ? 0 : t),
        point.y + (vertical ? t : 0),
      );
    await move(((reverse ? 1 : -1) * span) / 2);
    await frame();
    for (let n = 1; n <= 12; n++) {
      await delay(24);
      await move((reverse ? -1 : 1) * span * (n / 12 - 0.5));
    }
    await frame();
    return diagnostics();
  }
  async function snapshot(name) {
    // Compare a stable canvas crop; application labels cannot count as movement.
    const box = await page
      .locator("#model-canvas canvas")
      .first()
      .boundingBox();
    const clip = {
      x: Math.round(box.x + box.width / 2 - 260),
      y: Math.round(box.y + box.height / 2 - 170),
      width: 520,
      height: 340,
    };
    const roi = await page.screenshot({ clip });
    await page.screenshot({ path: path.join(out, `${prefix}${name}.png`) });
    return roi.toString("base64");
  }
  async function imageDifference(before, after) {
    return page.evaluate(
      async ([before, after]) => {
        const load = (data) =>
          new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.src = `data:image/png;base64,${data}`;
          });
        const images = await Promise.all([load(before), load(after)]);
        const canvas = document.createElement("canvas");
        canvas.width = images[0].width;
        canvas.height = images[0].height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        const pixels = images.map((image) => {
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, canvas.width, canvas.height).data;
        });
        let sum = 0,
          changed = 0;
        for (let n = 0; n < pixels[0].length; n += 4) {
          let largest = 0;
          for (let k = 0; k < 3; k++) {
            const difference = Math.abs(pixels[0][n + k] - pixels[1][n + k]);
            sum += difference;
            largest = Math.max(largest, difference);
          }
          if (largest >= 20) changed++;
        }
        const total = canvas.width * canvas.height;
        return {
          changedPixels: changed,
          changedFraction: changed / total,
          meanAbsoluteDifference: sum / (total * 3),
          width: canvas.width,
          height: canvas.height,
        };
      },
      [before, after],
    );
  }
  async function recordDemo() {
    // Screenshot capture can resize Chrome's screencast for a frame, so record
    // this demonstration in an uninterrupted rendering session.
    const demo = await browser.newContext({
      viewport: { width: 1200, height: 850 },
      recordVideo: { dir: out, size: { width: 1200, height: 850 } },
    });
    page = await demo.newPage();
    const video = page.video();
    try {
      await page.goto(
        "file://" + path.join(root, "index.html") + "#3d",
      );
      await page.waitForFunction(() => Building3D.instance?.interaction, null, {
        timeout: 60000,
      });
      await page.addScriptTag({ content: helper });
      await page.click('[data-camera="top"]');
      await page.uncheck("#model-perspective");
      await page.evaluate(() => {
        const cursor = document.createElement("div");
        Object.assign(cursor.style, {
          position: "fixed",
          width: "18px",
          height: "18px",
          border: "2px solid white",
          boxShadow: "0 0 0 1px #1769a6",
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: "10000",
          transform: "translate(-50%,-50%)",
          left: "-50px",
          top: "-50px",
        });
        document.body.append(cursor);
        window.addEventListener("pointermove", (event) => {
          cursor.style.left = `${event.clientX}px`;
          cursor.style.top = `${event.clientY}px`;
        });
      });
      const started = Date.now();
      for (const kind of ["grass", "water", "foliage"]) {
        let point = await focus(kind);
        if (kind === "foliage") point = await opaqueFoliage(point);
        await delay(500);
        for (let n = 0; n < 5; n++)
          await sweep(point, {
            reverse: !!(n % 2),
            vertical: kind === "foliage",
            span: kind === "foliage" ? 110 : 220,
          });
        await page.mouse.move(8, 8);
        await delay(900);
      }
      const duration = (Date.now() - started) / 1000;
      await demo.close();
      const source = await video.path();
      const encoded = spawnSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-sseof",
        String(-duration),
        "-i",
        source,
        "-an",
        "-c:v",
        "libvpx-vp9",
        "-crf",
        "28",
        "-b:v",
        "0",
        "-y",
        path.join(out, "material-interaction.webm"),
      ]);
      assert.equal(encoded.status, 0, String(encoded.stderr));
    } finally {
      await demo.close();
      await video.delete();
    }
  }
  if (process.argv.includes("--demo-only")) {
    try {
      await recordDemo();
    } finally {
      await context.close();
      await browser.close();
    }
    console.log("PASS uninterrupted native WebGPU demonstration");
    return;
  }
  try {
    await page.goto("file://" + path.join(root, "index.html") + "#3d");
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
    results.materials = await page.evaluate(() => {
      const i = Building3D.instance,
        materials = new Map();
      const pixels = (map) => {
        if (!map?.image) return null;
        const image = map.image;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        let data;
        if (image.data) {
          const channels = image.data.length / (image.width * image.height);
          data = new Uint8ClampedArray(128 * 128 * 4);
          for (let y = 0; y < 128; y++)
            for (let x = 0; x < 128; x++) {
              const source =
                (Math.floor((y / 128) * image.height) * image.width +
                  Math.floor((x / 128) * image.width)) *
                channels;
              for (let k = 0; k < 3; k++)
                data[(y * 128 + x) * 4 + k] =
                  image.data[source + Math.min(k, channels - 1)];
            }
        } else {
          context.drawImage(image, 0, 0, 128, 128);
          data = context.getImageData(0, 0, 128, 128).data;
        }
        const min = [255, 255, 255],
          max = [0, 0, 0],
          sum = [0, 0, 0],
          square = [0, 0, 0];
        for (let n = 0; n < data.length; n += 4)
          for (let k = 0; k < 3; k++) {
            const v = data[n + k];
            min[k] = Math.min(min[k], v);
            max[k] = Math.max(max[k], v);
            sum[k] += v;
            square[k] += v * v;
          }
        return {
          width: image.width,
          height: image.height,
          min,
          max,
          deviation: sum.map((s, k) =>
            Math.sqrt(square[k] / 16384 - (s / 16384) ** 2),
          ),
          repeat: map.repeat.toArray(),
          offset: map.offset.toArray(),
          colorSpace: map.colorSpace,
        };
      };
      i.model.root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]) {
          if (!materials.has(material.uuid))
            materials.set(material.uuid, {
              name: material.name,
              userData: material.userData,
              color: material.color?.getHexString(),
              map: pixels(material.map),
              normalMap: pixels(material.normalMap),
              bumpMap: pixels(material.bumpMap),
              roughnessMap: pixels(material.roughnessMap),
              kinds: [],
              objects: 0,
              invalidUVs: 0,
              missingUVs: 0,
              meshes: [],
            });
          const value = materials.get(material.uuid);
          value.objects++;
          if (!value.kinds.includes(mesh.userData.kind))
            value.kinds.push(mesh.userData.kind);
          const uv = mesh.geometry.attributes.uv;
          if (!uv) value.missingUVs++;
          else
            for (const coordinate of uv.array)
              if (!Number.isFinite(coordinate)) value.invalidUVs++;
          if (value.meshes.length < 4)
            value.meshes.push({ name: mesh.name, ...mesh.userData });
        }
      });
      return [...materials.values()];
    });
    fs.writeFileSync(
      path.join(out, `${prefix}materials.json`),
      JSON.stringify(results.materials, null, 2) + "\n",
    );
    if (!baseline) {
      for (const kind of ["bark", "plaster", "carpet", "oak", "timber"]) {
        const mapped = results.materials.filter(
          (m) => m.userData.generatedTexture === kind,
        );
        assert(mapped.length, `${kind}: actual scene uses the upgraded finish`);
        for (const material of mapped) {
          assert(
            material.map?.width >= 512 &&
              Math.max(...material.map.deviation) > 2,
            `${kind}: loaded nonuniform albedo`,
          );
          assert(
            Math.max(
              ...((material.normalMap || material.bumpMap)?.deviation || [0]),
            ) > 0.2,
            `${kind}: loaded nonuniform surface relief`,
          );
          assert.equal(
            material.invalidUVs + material.missingUVs,
            0,
            `${kind}: actual geometry has finite UVs`,
          );
          assert(
            material.roughnessMap &&
              Math.max(...material.roughnessMap.deviation) > 0.3,
            `${kind}: spatially varying roughness`,
          );
        }
      }
      const doors = results.materials.filter((m) => m.kinds.includes("door"));
      assert(
        doors.some(
          (m) => m.map && (m.normalMap || m.bumpMap) && m.roughnessMap,
        ),
        "door leaves have mapped grain, relief and roughness",
      );
      for (const kind of ["plaster", "oak", "timber", "carpet"]) {
        const variants = results.materials.filter(
          (m) => m.userData.generatedTexture === kind,
        );
        const signatures = new Set(
          variants.map((m) => JSON.stringify([m.color, m.map?.offset])),
        );
        assert(
          signatures.size >= 2,
          `${kind}: different objects use varied tint or texture placement`,
        );
      }
    }
    console.log(
      "MATERIALS",
      results.materials
        .filter((m) => m.userData.generatedTexture)
        .map((m) => [m.userData.generatedTexture, m.color, m.map?.offset]),
    );
    for (const kind of ["grass", "water", "foliage"]) {
      let point = await focus(kind);
      if (kind === "foliage") point = await opaqueFoliage(point);
      await frame();
      const before = await snapshot(`${kind}-rest`);
      const impulsesBefore = (await diagnostics()).pointer.impulses;
      const response = await sweep(point, {
        vertical: kind === "foliage",
        span: kind === "foliage" ? 110 : 220,
      });
      const after = await snapshot(`${kind}-motion`);
      const difference = await imageDifference(before, after);
      const state = response.controllers.find((c) => c.id === point.id);
      results[kind] = {
        state,
        pointer: response.pointer,
        imageDifference: difference,
      };
      if (kind === "grass") {
        results.grass.geometry = await page.evaluate(() => {
          const mesh = Building3D.instance.interaction.controllers.find(
            (c) => c.kind === "grass",
          ).mesh;
          let height = 0;
          const positions = mesh.geometry.attributes.position;
          for (let n = 0; n < positions.count; n++)
            height = Math.max(height, positions.getY(n));
          return {
            clumps: mesh.count,
            bladesPerClump: mesh.userData.bladesPerClump,
            maxSharedBladeHeight: height,
            triangles: (mesh.geometry.index.count / 3) * mesh.count,
          };
        });
        if (!baseline) {
          assert(
            state.blades >= 500000,
            "actual lawn has substantially more blades than the previous 300992",
          );
          assert(
            results.grass.geometry.maxSharedBladeHeight >= 0.25,
            "actual grass geometry contains tall blades",
          );
          assert.equal(
            response.pointer.grassMeshIsTarget,
            false,
            "dense grass retains proxy picking",
          );
        }
      }
      if (!baseline) {
        assert(
          response.pointer.lastTarget === point.id &&
            response.pointer.impulses > impulsesBefore,
          `${kind}: real pointer reaches intended surface`,
        );
        assert(
          difference.changedFraction > 0.005 &&
            difference.meanAbsoluteDifference > 0.25,
          `${kind}: visible surface movement exceeds pixel-noise threshold`,
        );
      }
      console.log(kind.toUpperCase(), JSON.stringify(results[kind]));
      for (let n = 0; n < 3; n++)
        await sweep(point, {
          reverse: !!(n % 2),
          vertical: kind === "foliage",
          span: kind === "foliage" ? 110 : 220,
        });
      await page.mouse.move(8, 8);
      await delay(800);
    }
    // Material closeups retain the actual object and its architectural setting.
    for (const category of ["bark", "wall", "door", "carpet", "floor"]) {
      const captured = await page.evaluate((category) => {
        const i = Building3D.instance,
          T = MaterialTestGeometry;
        i.settings.floor = "ground";
        i.settings.cut = false;
        i.settings.roof = false;
        i.update(false);
        const matches = [];
        i.model.root.traverse((mesh) => {
          if (!mesh.isMesh) return;
          const mats = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          const has = (key) =>
            mats.some((m) => m.userData.generatedTexture === key);
          const match =
            category === "bark"
              ? (has("bark") || mesh.geometry.type === "CylinderGeometry") &&
                mesh.userData.siteId === "front-shade-tree"
              : category === "wall"
                ? mesh.userData.kind === "wall" &&
                  mesh.userData.floor === "ground"
                : category === "door"
                  ? mesh.userData.kind === "door" &&
                    mesh.userData.floor === "ground"
                  : category === "carpet"
                    ? has("carpet") && mesh.userData.floor === "ground"
                    : mesh.userData.kind === "room" &&
                      has("oak") &&
                      mesh.userData.floor === "ground";
          if (match) matches.push(mesh);
        });
        if (!matches.length) return null;
        const mesh =
          matches.find(
            (m) =>
              category === "door" &&
              m.userData.doorKey === "ground:front-entry-a",
          ) ||
          matches.sort((a, b) => {
            if (category === "bark") {
              return (
                new T.Box3().setFromObject(a).min.y -
                new T.Box3().setFromObject(b).min.y
              );
            }
            const sa = new T.Box3().setFromObject(a).getSize(new T.Vector3()),
              sb = new T.Box3().setFromObject(b).getSize(new T.Vector3());
            return (
              sb.x * sb.y +
              sb.z * sb.y +
              sb.x * sb.z -
              sa.x * sa.y -
              sa.z * sa.y -
              sa.x * sa.z
            );
          })[0];
        const box = new T.Box3().setFromObject(mesh),
          size = box.getSize(new T.Vector3()),
          point = box.getCenter(new T.Vector3());
        let offset, half;
        if (category === "floor" || category === "carpet") {
          point.y = box.max.y + 0.02;
          offset = [0.5, 1.6, 1.2];
          half = 1.1;
        } else if (category === "bark") {
          point.y = box.min.y + Math.min(0.8, size.y * 0.5);
          offset = [0, 0.05, 1.1];
          half = 0.65;
        } else {
          point.y = Math.max(
            box.min.y + 0.75,
            Math.min(point.y, box.min.y + 1.3),
          );
          offset = size.x > size.z ? [0.15, 0, 1] : [1, 0, 0.15];
          half = category === "door" ? 0.8 : 0.7;
          if (category === "door") {
            offset = new T.Vector3(0, 0, 1)
              .transformDirection(mesh.matrixWorld)
              .multiplyScalar(0.8)
              .toArray();
          }
        }
        i.camera.position.copy(point).add(new T.Vector3(...offset));
        i.camera.up.set(0, 1, 0);
        i.camera.lookAt(point);
        const canvas = i.renderer.domElement.getBoundingClientRect();
        i.camera.left = (-half * canvas.width) / canvas.height;
        i.camera.right = -i.camera.left;
        i.camera.top = half;
        i.camera.bottom = -half;
        i.camera.zoom = 1;
        i.camera.updateProjectionMatrix();
        i.camera.updateMatrixWorld(true);
        i.interaction.reset();
        i.render();
        return {
          object: mesh.userData,
          size: size.toArray(),
          camera: i.camera.position.toArray(),
          target: point.toArray(),
        };
      }, category);
      if (captured) {
        await frame();
        await page.screenshot({
          path: path.join(out, `${prefix}${category}-detail.png`),
        });
      } else if (!baseline)
        throw new Error(`${category}: no actual closeup fixture found`);
      results[`${category}Detail`] = captured;
    }
    await page.evaluate(() => {
      const i = Building3D.instance,
        T = MaterialTestGeometry;
      const room = i.model.pickables.find(
        (m) => m.userData.kind === "room" && m.userData.name === "LIVING",
      );
      const box = new T.Box3().setFromObject(room);
      const eye = new T.Vector3(
        box.min.x + 0.6,
        box.max.y + 1.65,
        box.max.z - 0.6,
      );
      const target = new T.Vector3(
        box.max.x - 0.6,
        box.max.y + 0.8,
        box.min.z + 0.6,
      );
      i.camera.position.copy(eye);
      i.camera.lookAt(target);
      i.orbit.target.copy(target);
      const half = eye.distanceTo(target) * Math.tan((42 * Math.PI) / 360);
      const canvas = i.renderer.domElement.getBoundingClientRect();
      i.camera.left = (-half * canvas.width) / canvas.height;
      i.camera.right = -i.camera.left;
      i.camera.top = half;
      i.camera.bottom = -half;
      i.camera.zoom = 1;
      i.camera.updateProjectionMatrix();
      i.camera.updateMatrixWorld(true);
    });
    await page.check("#model-perspective");
    await frame();
    await page.screenshot({
      path: path.join(out, `${prefix}room-context.png`),
    });
    await page.uncheck("#model-perspective");
    if (!baseline) {
      const point = await focus("grass"),
        started = Date.now();
      await page.click('[data-render-mode="photo"]');
      await page.waitForFunction(
        () =>
          Building3D.instance.quality.photo?.samples >= 1 ||
          Building3D.instance.quality.error,
        null,
        { timeout: 180000 },
      );
      assert.equal(
        await page.evaluate(() => Building3D.instance.quality.error),
        null,
      );
      results.photoPreparationMs = Date.now() - started;
      await page.evaluate(() => {
        const p = Building3D.instance.quality.photo,
          setScene = p.setScene.bind(p);
        window.materialSnapshotCalls = 0;
        p.setScene = (...args) => {
          materialSnapshotCalls++;
          return setScene(...args);
        };
      });
      await sweep(point, { span: 220 });
      assert(
        (await diagnostics()).moving,
        "normal pointer stroke interrupts Photo",
      );
      assert.equal(await page.evaluate(() => materialSnapshotCalls), 0);
      await page.mouse.move(8, 8);
      await page.waitForFunction(
        () =>
          !Building3D.instance.interaction.diagnostics.moving &&
          materialSnapshotCalls === 1 &&
          Building3D.instance.quality.photo.samples >= 1,
        null,
        { timeout: 180000 },
      );
      results.photoSnapshotCalls = await page.evaluate(
        () => materialSnapshotCalls,
      );
      await page.screenshot({ path: path.join(out, "grass-photo.png") });
      console.log(
        "PHOTO",
        results.photoPreparationMs,
        "ms first sample; exactly one rebuild after settling",
      );
    }
    assert.deepEqual(errors, []);
    results.errors = errors;
    fs.writeFileSync(
      path.join(out, `${prefix}checks.json`),
      JSON.stringify(results, null, 2) + "\n",
    );
    fs.rmSync(path.join(out, `${prefix}failure.json`), { force: true });
    success = true;
  } catch (error) {
    fs.writeFileSync(
      path.join(out, `${prefix}failure.json`),
      JSON.stringify(
        {
          error: String(error),
          results,
          diagnostics: await diagnostics().catch(() => null),
          errors,
        },
        null,
        2,
      ) + "\n",
    );
    throw error;
  } finally {
    await context.close();
    try {
      if (success && !baseline) await recordDemo();
    } finally {
      await browser.close();
    }
  }
  console.log(
    `PASS ${baseline ? "baseline captures" : "upgraded materials, real visible motion and settled Photo"}`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
