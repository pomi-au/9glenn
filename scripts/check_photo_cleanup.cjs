const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "audit/photo-cleanup");
const baseline = process.argv.includes("--baseline");
const alphaProbe = process.argv.includes("--alpha-probe");
const windowOnly = process.argv.includes("--window-only");
const prefix = alphaProbe ? "alpha-probe-" : baseline ? "before-" : "";
const viewer = path.join(
  root,
  baseline ? "tmp/photo-cleanup-baseline.html" : "9-glenn-viewer.html",
);
fs.mkdirSync(out, { recursive: true });
const helper = buildSync({
  stdin: {
    contents:
      'import {Vector3,Box3} from "three";window.PhotoCleanupTest={Vector3,Box3};',
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
    viewport: { width: 1100, height: 850 },
  });
  const errors = [],
    results = { baseline, baselineCommit: "23c2be4" };
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(m.text());
      console.error("BROWSER", m.text());
    }
  });
  const frame = () =>
    page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
  const capture = async (name) => {
    await frame();
    return page.screenshot({ path: path.join(out, `${prefix}${name}.png`) });
  };
  const accumulationHash = () =>
    page.evaluate(async () => {
      const i = Building3D.instance,
        p = i.quality.photo,
        device = i.renderer.backend.device;
      const texture = i.renderer.backend.get(p.target).texture;
      if (!(texture.usage & GPUTextureUsage.COPY_SRC))
        return { unavailable: "target is not copyable" };
      const bytesPerPixel =
        texture.format === "rgba32float"
          ? 16
          : texture.format === "rgba16float"
            ? 8
            : 0;
      if (!bytesPerPixel)
        return { unavailable: "unsupported target format " + texture.format };
      const row = Math.ceil((texture.width * bytesPerPixel) / 256) * 256;
      const buffer = device.createBuffer({
        size: row * texture.height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: row }, [
        texture.width,
        texture.height,
      ]);
      device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      const data = new Uint8Array(buffer.getMappedRange());
      let hash = 2166136261;
      for (let y = 0; y < texture.height; y++)
        for (let x = 0; x < texture.width * bytesPerPixel; x++)
          hash = Math.imul(hash ^ data[y * row + x], 16777619) >>> 0;
      buffer.unmap();
      buffer.destroy();
      return {
        hash: hash.toString(16),
        width: texture.width,
        height: texture.height,
        format: texture.format,
      };
    });
  async function photo(name, target = 64) {
    const started = Date.now();
    await page.evaluate(() => {
      const p = Building3D.instance.quality.photo;
      window.cleanupSnapshotReady = !p;
      if (p) {
        const old = p.setScene;
        p.setScene = function (...args) {
          const result = old.apply(this, args);
          window.cleanupSnapshotReady = true;
          p.setScene = old;
          return result;
        };
      }
    });
    await page.click('[data-render-mode="photo"]');
    await page.evaluate(() => Building3D.instance.render());
    await page.waitForFunction(
      (target) => {
        const q = Building3D.instance.quality;
        return (
          q.error ||
          (window.cleanupSnapshotReady &&
            !q.preparing &&
            q.photo?.samples >= target)
        );
      },
      target,
      { timeout: 240000 },
    );
    assert.equal(
      await page.evaluate(() => Building3D.instance.quality.error),
      null,
    );
    // Freeze accumulation while presenting the exact same sample buffer.
    const state = await page.evaluate(async () => {
      const p = Building3D.instance.quality.photo;
      window.cleanupRenderSample = p.renderSample;
      p.renderSample = () => p.present(false);
      await Building3D.instance.renderer.backend.device.queue.onSubmittedWorkDone();
      await p.measureSamples();
      await p.measureSamples();
      return {
        samples: p.samples,
        counts: p.sampleCounts,
        diagnostics: p.diagnostics || null,
      };
    });
    if (!baseline && !alphaProbe) {
      await page.evaluate(() => {
        const p = Building3D.instance.quality.photo;
        p.setDenoiseEnabled(false);
        p.present();
      });
      const raw = await capture(name + "-raw");
      state.rawCounts = await page.evaluate(() =>
        Building3D.instance.quality.photo.measureSamples(),
      );
      state.rawHash = await accumulationHash();
      await page.evaluate(() => {
        const p = Building3D.instance.quality.photo;
        p.setDenoiseEnabled(true);
        p.present();
      });
      const smooth = await capture(name);
      state.smoothCounts = await page.evaluate(() =>
        Building3D.instance.quality.photo.measureSamples(),
      );
      state.smoothHash = await accumulationHash();
      assert.deepEqual(
        state.rawHash,
        state.smoothHash,
        "denoising leaves the raw accumulated HDR bytes unchanged",
      );
      for (const field of ["min", "max", "avg"])
        assert.equal(
          state.rawCounts[field],
          state.smoothCounts[field],
          `raw and smoothed images retain the same ${field} sample count`,
        );
      state.denoise = await page.evaluate(
        () => Building3D.instance.quality.photo.denoiseDiagnostics,
      );
      state.comparison = await page.evaluate(
        async ({ raw, smooth, name }) => {
          const read = async (encoded) => {
            const i = new Image();
            i.src = "data:image/png;base64," + encoded;
            await i.decode();
            const c = document.createElement("canvas");
            c.width = i.width;
            c.height = i.height;
            const x = c.getContext("2d");
            x.drawImage(i, 0, 0);
            return {
              data: x.getImageData(0, 0, c.width, c.height).data,
              width: c.width,
            };
          };
          const a = await read(raw),
            b = await read(smooth);
          const regions = name.startsWith("window")
            ? {
                wall: [45, 280, 200, 310],
                floor: [170, 765, 310, 45],
                edge: [650, 220, 55, 190],
                foliage: [720, 480, 210, 120],
              }
            : name.startsWith("interior")
              ? {
                  wall: [550, 250, 260, 220],
                  floor: [350, 670, 310, 120],
                  edge: [965, 300, 40, 240],
                }
              : {
                  wall: [775, 436, 30, 40],
                  foliage: [520, 360, 210, 120],
                  roof: [415, 361, 330, 35],
                };
          const lum = (image, x, y) => {
            const n = (y * image.width + x) * 4;
            return (
              image.data[n] * 0.2126 +
              image.data[n + 1] * 0.7152 +
              image.data[n + 2] * 0.0722
            );
          };
          const stats = (im, [x, y, w, h]) => {
            let total = 0,
              hp = 0,
              gradient = 0,
              count = 0;
            for (let j = y + 1; j < y + h - 1; j++)
              for (let i = x + 1; i < x + w - 1; i++) {
                const v = lum(im, i, j),
                  avg =
                    (lum(im, i - 1, j) +
                      lum(im, i + 1, j) +
                      lum(im, i, j - 1) +
                      lum(im, i, j + 1)) /
                    4;
                total += v;
                hp += (v - avg) ** 2;
                gradient += Math.abs(lum(im, i + 1, j) - lum(im, i - 1, j));
                count++;
              }
            return {
              mean: total / count,
              highFrequencyRms: Math.sqrt(hp / count),
              horizontalGradient: gradient / count,
            };
          };
          return Object.fromEntries(
            Object.entries(regions).map(([key, roi]) => [
              key,
              { roi, raw: stats(a, roi), smooth: stats(b, roi) },
            ]),
          );
        },
        {
          raw: raw.toString("base64"),
          smooth: smooth.toString("base64"),
          name,
        },
      );
      if (name === "window-photo") {
        const comparison = state.comparison;
        assert(
          comparison.wall.smooth.highFrequencyRms <
            comparison.wall.raw.highFrequencyRms * 0.5,
          "denoising removes at least half the shaded-wall high-frequency noise",
        );
        assert(
          Math.abs(comparison.wall.smooth.mean / comparison.wall.raw.mean - 1) <
            0.15,
          "noise reduction preserves the wall brightness",
        );
        assert(
          comparison.edge.smooth.horizontalGradient >
            comparison.edge.raw.horizontalGradient * 0.75,
          "window frame edge remains sharp",
        );
        assert(
          comparison.foliage.smooth.horizontalGradient >
            comparison.foliage.raw.horizontalGradient * 0.3,
          "leaves seen through glazing retain visible fine detail",
        );
        const downloadPromise = page.waitForEvent("download");
        await page.click("#model-download");
        const download = await downloadPromise;
        const exportPath = path.join(out, "window-export.png");
        await download.saveAs(exportPath);
        state.export = await page.evaluate(async (encoded) => {
          const image = new Image();
          image.src = "data:image/png;base64," + encoded;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0);
          const data = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          let nonblack = 0;
          for (let n = 0; n < data.length; n += 4)
            if (data[n] + data[n + 1] + data[n + 2] > 24) nonblack++;
          return {
            width: canvas.width,
            height: canvas.height,
            nonblackFraction: nonblack / (canvas.width * canvas.height),
            denoise: Building3D.instance.quality.photo.denoiseDiagnostics,
          };
        }, fs.readFileSync(exportPath).toString("base64"));
        assert(
          state.export.width >= 1000 && state.export.nonblackFraction > 0.3,
          "actual saved Photo is a full-size nonblank cleaned image",
        );
      }
    } else await capture(name);
    state.elapsedMs = Date.now() - started;
    assert(state.samples >= target);
    console.log(name, JSON.stringify(state));
    await page.evaluate(() => {
      Building3D.instance.quality.photo.renderSample =
        window.cleanupRenderSample;
    });
    await page.click('[data-render-mode="explore"]');
    return state;
  }
  async function windowView() {
    await page.click('[data-camera="top"]');
    await page.uncheck("#model-perspective");
    results.windowCamera = await page.evaluate(() => {
      const i = Building3D.instance,
        T = PhotoCleanupTest;
      i.pivot.quaternion.identity();
      i.pivot.position.set(0, 0, 0);
      i.model.root.position.set(0, 0, 0);
      i.pivot.updateMatrixWorld(true);
      const pane = i.model.pickables.find(
          (m) => m.userData.name === "photo living window",
        ),
        box = new T.Box3().setFromObject(pane),
        target = box.getCenter(new T.Vector3());
      target.x += 0.45;
      target.y = 1.2;
      const eye = new T.Vector3(
        box.getCenter(new T.Vector3()).x - 1.1,
        1.65,
        box.min.z - 2.8,
      );
      i.camera.position.copy(eye);
      i.camera.lookAt(target);
      i.orbit.target.copy(target);
      const half = eye.distanceTo(target) * Math.tan((42 * Math.PI) / 360),
        rect = i.renderer.domElement.getBoundingClientRect();
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
      return { eye: eye.toArray(), target: target.toArray(), half };
    });
    await page.check("#model-perspective");
    await capture("window-explore");
    await page.evaluate(() => {
      Building3D.instance.quality.sceneChanged();
      Building3D.instance.render();
    });
    results.windowPhoto = await photo("window-photo");
  }
  async function lifecycle() {
    const before = await page.evaluate(
      () => Building3D.instance.quality.photo.denoiseDiagnostics,
    );
    await page.setViewportSize({ width: 1000, height: 780 });
    await page.waitForFunction(
      () => Building3D.instance.quality.photo.samples === 0,
    );
    const reset = await page.evaluate(() => {
      const i = Building3D.instance;
      i.camera.position.x += 0.4;
      i.orbit.target.x += 0.4;
      i.camera.updateMatrixWorld(true);
      i.render();
      return {
        samples: i.quality.photo.samples,
        diagnostics: i.quality.photo.denoiseDiagnostics,
      };
    });
    assert.equal(reset.samples, 0, "resize invalidates previous accumulation");
    await page.click('[data-render-mode="photo"]');
    await page.waitForFunction(
      () =>
        Building3D.instance.quality.error ||
        Building3D.instance.quality.photo.samples >= 2,
      null,
      { timeout: 60000 },
    );
    assert.equal(
      await page.evaluate(() => Building3D.instance.quality.error),
      null,
    );
    await page.evaluate(() => Building3D.instance.quality.photo.present());
    await capture("resized-camera-photo");
    const after = await page.evaluate(
      () => Building3D.instance.quality.photo.denoiseDiagnostics,
    );
    assert(
      after.revision > before.revision &&
        after.guidePasses > before.guidePasses,
      "resized and moved camera generates fresh denoiser guides",
    );
    assert.equal(
      after.width,
      1000,
      "denoised output follows the resized canvas",
    );
    results.lifecycle = { before, reset, after };
  }
  try {
    await page.goto("file://" + viewer + "#3d");
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
    if (windowOnly) {
      await windowView();
      if (!baseline) await lifecycle();
      assert.deepEqual(errors, []);
      results.errors = errors;
      fs.writeFileSync(
        path.join(out, `${prefix}window-checks.json`),
        JSON.stringify(results, null, 2) + "\n",
      );
      if (!baseline && fs.existsSync(path.join(out, "checks.json"))) {
        const previous = JSON.parse(
          fs.readFileSync(path.join(out, "checks.json"), "utf8"),
        );
        fs.writeFileSync(
          path.join(out, "checks.json"),
          JSON.stringify(
            {
              ...previous,
              windowCamera: results.windowCamera,
              windowPhoto: results.windowPhoto,
              lifecycle: results.lifecycle,
              errors,
            },
            null,
            2,
          ) + "\n",
        );
      }
      return;
    }
    await page.click('[data-camera="street"]');
    results.foliage = await page.evaluate(() => {
      const i = Building3D.instance,
        T = PhotoCleanupTest;
      return i.interaction.controllers
        .filter((c) => c.kind === "foliage")
        .map((c) => {
          const m = c.mesh,
            b = new T.Box3().setFromObject(m),
            p = b.getCenter(new T.Vector3()).project(i.camera),
            rect = i.renderer.domElement.getBoundingClientRect();
          return {
            id: c.id,
            count: m.count,
            center: b.getCenter(new T.Vector3()).toArray(),
            size: b.getSize(new T.Vector3()).toArray(),
            projected: [
              rect.left + (p.x * 0.5 + 0.5) * rect.width,
              rect.top + (-p.y * 0.5 + 0.5) * rect.height,
            ],
            visible: m.visible,
            alphaTest: m.material.alphaTest,
            side: m.material.side,
            opacity: m.material.opacity,
            transparent: m.material.transparent,
            map: m.material.map?.name,
          };
        });
    });
    await capture("street-explore");
    if (alphaProbe)
      await page.evaluate(() => {
        for (const c of Building3D.instance.interaction.controllers)
          if (c.kind === "foliage") c.mesh.material.alphaTest = 0;
      });
    await page.evaluate(() => {
      Building3D.instance.quality.sceneChanged();
      Building3D.instance.render();
    });
    results.streetPhoto = await photo("street-photo", alphaProbe ? 16 : 64);
    if (alphaProbe) {
      results.errors = errors;
      assert.deepEqual(errors, []);
      fs.writeFileSync(
        path.join(out, `${prefix}checks.json`),
        JSON.stringify(results, null, 2) + "\n",
      );
      return;
    }
    await windowView();
    if (!baseline) await lifecycle();
    assert.deepEqual(errors, []);
    results.errors = errors;
    fs.writeFileSync(
      path.join(out, `${prefix}checks.json`),
      JSON.stringify(results, null, 2) + "\n",
    );
    console.log("PASS actual native WebGPU Photo baseline views");
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
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
