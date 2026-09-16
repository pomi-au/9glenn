const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { buildSync } = require("esbuild");
const clipping = require("polygon-clipping");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "audit/site-surfaces"),
  baseline = process.argv.includes("--baseline"),
  prefix = baseline ? "before-" : "",
  view = process.argv.find((a) => a.startsWith("--view="))?.split("=")[1];
fs.mkdirSync(out, { recursive: true });
const helper = buildSync({
  stdin: {
    contents:
      'import {Box3,Vector3} from "three";window.SurfaceTest={Box3,Vector3};',
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
        : { baseline, baselineCommit: "e21b064" };
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
        T = SurfaceTest;
      i.pivot.quaternion.identity();
      i.pivot.position.set(0, 0, 0);
      i.model.root.position.set(0, 0, 0);
      i.pivot.updateMatrixWorld(true);
      const poses = {
        approach: { target: [3, -0.3, 17.3], eye: [-4, 7, 27], half: 6.6 },
        pavement: { target: [12, -0.514, 23], eye: [13, 1.5, 25.3], half: 1.6 },
        soil: {
          target: [-1.3, -0.514, 21.5],
          eye: [0.4, 1.3, 23.2],
          half: 1.4,
        },
      };
      const p = poses[kind];
      i.camera.position.set(...p.eye);
      i.camera.up.set(0, 1, 0);
      i.camera.lookAt(...p.target);
      i.orbit.target.set(...p.target);
      const r = i.renderer.domElement.getBoundingClientRect();
      i.camera.left = (-p.half * r.width) / r.height;
      i.camera.right = -i.camera.left;
      i.camera.top = p.half;
      i.camera.bottom = -p.half;
      i.camera.zoom = 1;
      i.camera.updateProjectionMatrix();
      i.camera.updateMatrixWorld(true);
      i.interaction.reset();
      i.quality.sceneChanged();
      i.render();
      return p;
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
      const i = Building3D.instance,
        g = i.data.floors.find((f) => f.id === "ground"),
        areas = g.source.geometry.filter((a) => a.type === "site-area");
      return i.model.pickables
        .filter(
          (m) =>
            m.userData.kind === "landscape" &&
            areas.some((a) => a.id === m.userData.siteId),
        )
        .map((m) => {
          const area = areas.find((a) => a.id === m.userData.siteId),
            p = m.geometry.attributes.position,
            index = m.geometry.index;
          let top = -Infinity,
            bottom = Infinity,
            maximumTopUVError = 0;
          const triangles = [];
          for (let n = 0; n < p.count; n++) {
            top = Math.max(top, p.getY(n) + m.position.y);
            bottom = Math.min(bottom, p.getY(n) + m.position.y);
          }
          for (let n = 0; n < (index?.count || p.count); n += 3) {
            const ids = [0, 1, 2].map((k) =>
                index ? index.getX(n + k) : n + k,
              ),
              t = ids.map((k) => [
                p.getX(k) + m.position.x,
                p.getZ(k) + m.position.z,
              ]);
            const cross =
              (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]) -
              (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]);
            if (cross > 1e-8) {
              triangles.push([t]);
              const uv = m.geometry.attributes.uv;
              for (const k of ids)
                maximumTopUVError = Math.max(
                  maximumTopUVError,
                  Math.abs(
                    uv.getX(k) -
                      p.getX(k) -
                      (m.userData.finishVariation?.uvOffset[0] || 0),
                  ),
                  Math.abs(
                    uv.getY(k) -
                      p.getZ(k) -
                      (m.userData.finishVariation?.uvOffset[1] || 0),
                  ),
                );
            }
          }
          return {
            id: area.id,
            sourceMaterial: area.material,
            grade: area.grade,
            points: area.points,
            top,
            bottom,
            triangles,
            maximumTopUVError,
            metadata: m.userData,
            material: {
              name: m.material.name,
              userData: m.material.userData,
              normalScale: m.material.normalScale?.toArray(),
              bumpScale: m.material.bumpScale,
              map: stats(m.material.map),
              normalMap: stats(m.material.normalMap),
              bumpMap: stats(m.material.bumpMap),
              roughnessMap: stats(m.material.roughnessMap),
            },
          };
        });
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
          (window.detailSnapshot && !q.preparing && q.photo?.samples >= 32)
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
    assert(value.samples >= 32);
    await page.evaluate(() => {
      Building3D.instance.quality.photo.renderSample = window.detailRender;
    });
    await page.click('[data-render-mode="explore"]');
    return value;
  }
  try {
    await page.goto(
      "file://" +
        path.join(
          root,
          baseline ? "tmp/site-surfaces-baseline.html" : "index.html",
        ) +
        "#3d",
    );
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
    const drive = results.materials.find((m) => m.id === "driveway");
    assert(
      Math.abs(drive.top + 0.514) < 1e-5,
      "Driveway meets -0.514m garage datum",
    );
    const surfaces = results.materials
      .filter((m) => m.sourceMaterial !== "grass")
      .map((m) => ({ ...m, polygon: clipping.union(...m.triangles) }));
    const area = (mp) =>
      mp.reduce(
        (sum, p) =>
          sum +
          p.reduce((s, r, j) => {
            let a = 0;
            for (let n = 0; n < r.length; n++) {
              const next = r[(n + 1) % r.length];
              a += r[n][0] * next[1] - next[0] * r[n][1];
            }
            return s + Math.abs(a / 2) * (j ? -1 : 1);
          }, 0),
        0,
      );
    results.maximumSurfaceOverlap = 0;
    for (let a = 0; a < surfaces.length; a++)
      for (let b = a + 1; b < surfaces.length; b++) {
        const overlap = area(
          clipping.intersection(surfaces[a].polygon, surfaces[b].polygon),
        );
        results.maximumSurfaceOverlap = Math.max(
          results.maximumSurfaceOverlap,
          overlap,
        );
        assert(
          overlap < 1e-6,
          `${surfaces[a].id}/${surfaces[b].id} actual surface overlap`,
        );
      }
    if (!baseline) {
      assert.equal(drive.sourceMaterial, "asphalt");
      const before = JSON.parse(
        fs.readFileSync(path.join(out, "before-checks.json")),
      );
      const geometry = (ms) =>
        ms.map(({ id, grade, points, top, bottom, triangles }) => ({
          id,
          grade,
          points,
          top,
          bottom,
          triangles,
        }));
      assert.deepEqual(
        geometry(results.materials),
        geometry(before.materials),
        "Surface polygons, triangles and grade preserved",
      );
      results.geometryUnchanged = true;
      for (const mesh of surfaces)
        assert(mesh.maximumTopUVError < 1e-5, `${mesh.id} world-metre top UVs`);
      for (const mesh of surfaces)
        for (const kind of ["map", "normalMap", "roughnessMap"])
          assert(
            mesh.material[kind]?.std > 0.5,
            `${mesh.id} loaded nonuniform ${kind}`,
          );
    }
    for (const kind of view
      ? view.split(",")
      : ["approach", "pavement", "soil"]) {
      results[kind] = { camera: await camera(kind) };
      await capture(kind + "-explore");
      results[kind].photo = await photo(kind);
      console.log(kind, JSON.stringify(results[kind].photo));
    }
    await page.click("#controls-toggle");
    await page.uncheck("#model-landscape");
    assert(
      await page.evaluate(
        () =>
          !Building3D.instance.model.root.getObjectByName("landscaping")
            .visible,
      ),
    );
    await page.check("#model-landscape");
    assert(
      await page.evaluate(
        () =>
          Building3D.instance.model.root.getObjectByName("landscaping").visible,
      ),
    );
    results.landscapeToggle = true;
    results.errors = errors;
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(out, prefix + "checks.json"),
      JSON.stringify(results, null, 2) + "\n",
    );
    console.log(
      "PASS native site surface views, materials, grade and visibility",
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
