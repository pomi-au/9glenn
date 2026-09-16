const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSync } = require("esbuild");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "audit/fountain");
const baseline = process.argv.includes("--baseline"),
  prefix = baseline ? "before-" : "";
const waterOnly = process.argv.includes("--water-only");
const viewer = path.join(
  root,
  baseline ? "tmp/fountain-baseline.html" : "index.html",
);
fs.mkdirSync(out, { recursive: true });
const helper = buildSync({
  stdin: {
    contents:
      'import {Box3,Vector3} from "three";window.FountainTest={Box3,Vector3};',
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
    }),
    errors = [],
    results = { baseline, baselineCommit: "1e08bc0" };
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(m.text());
      console.error(m.text());
    }
  });
  const frames = (n) =>
    page.evaluate(async (n) => {
      for (let i = 0; i < n; i++)
        await new Promise((r) => requestAnimationFrame(r));
    }, n);
  const capture = async (name) => {
    await frames(8);
    return page.screenshot({ path: path.join(out, `${prefix}${name}.png`) });
  };
  async function camera(close) {
    await page.mouse.move(8, 8);
    return page.evaluate((close) => {
      const i = Building3D.instance,
        T = FountainTest;
      i.pivot.quaternion.identity();
      i.pivot.position.set(0, 0, 0);
      i.model.root.position.set(0, 0, 0);
      i.pivot.updateMatrixWorld(true);
      const pedestal = i.model.pickables.find(
          (m) => m.userData.part === "fountain pedestal",
        ),
        box = new T.Box3().setFromObject(pedestal),
        center = box.getCenter(new T.Vector3());
      const impact = i.model.pickables.find((m) => m.userData.fountain)
        ?.userData.fountain.impact;
      const target =
          close === "water"
            ? new T.Vector3(...impact)
            : close
              ? new T.Vector3(center.x, 0.65, center.z - 0.45)
              : new T.Vector3(29.6, 0.6, 9.5),
        offset =
          close === "water"
            ? new T.Vector3(0, 0.24, -1.6)
            : close
              ? new T.Vector3(1.7, 0.65, -2.1)
              : new T.Vector3(13, 11, 11),
        half = close === "water" ? 0.53 : close ? 1.13 : 4.7;
      i.orbit.target.copy(target);
      i.camera.position.copy(target).add(offset);
      i.camera.up.set(0, 1, 0);
      i.camera.lookAt(target);
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
        target: target.toArray(),
        eye: i.camera.position.toArray(),
        half,
      };
    }, close);
  }
  async function photo() {
    const started = Date.now();
    await page.click('[data-render-mode="photo"]');
    if (!baseline) {
      await page.waitForFunction(
        () =>
          Building3D.instance.quality.error ||
          Building3D.instance.quality.photo?.samples >= 1,
        null,
        { timeout: 180000 },
      );
      await page.evaluate(() => {
        const i = Building3D.instance,
          w = i.interaction.controllers.find((c) => c.kind === "water");
        window.fountainPhotoWater = Array.from(
          w.mesh.geometry.attributes.position.array,
        );
        window.fountainPhotoNormals = Array.from(
          w.mesh.geometry.attributes.normal.array,
        );
        window.fountainPhotoImpacts = w.diagnostics.impactCount;
        window.fountainSamples = [];
        window.fountainSampleTimer = setInterval(
          () => window.fountainSamples.push(i.quality.photo.samples),
          100,
        );
      });
    }
    await page.waitForFunction(
      () =>
        Building3D.instance.quality.error ||
        (!Building3D.instance.quality.preparing &&
          Building3D.instance.quality.photo?.samples >= 32),
      null,
      { timeout: 180000 },
    );
    assert.equal(
      await page.evaluate(() => Building3D.instance.quality.error),
      null,
    );
    await page.evaluate(() => {
      const p = Building3D.instance.quality.photo;
      window.fountainSample = p.renderSample;
      p.renderSample = () => p.present(false);
      p.present();
    });
    await capture("fountain-photo");
    if (!baseline) {
      const downloadPromise = page.waitForEvent("download");
      await page.click("#model-download");
      const download = await downloadPromise;
      await download.saveAs(path.join(out, "fountain-photo-export.png"));
    }
    const value = await page.evaluate(() => ({
      samples: Building3D.instance.quality.photo.samples,
      counts: Building3D.instance.quality.photo.sampleCounts,
      denoise: Building3D.instance.quality.photo.denoiseDiagnostics,
    }));
    value.elapsedMs = Date.now() - started;
    assert(value.samples >= 32);
    if (!baseline) {
      value.frozen = await page.evaluate(() => {
        clearInterval(window.fountainSampleTimer);
        const i = Building3D.instance,
          w = i.interaction.controllers.find((c) => c.kind === "water");
        return {
          sameVertices: Array.from(
            w.mesh.geometry.attributes.position.array,
          ).every((v, n) => v === window.fountainPhotoWater[n]),
          sameNormals: Array.from(
            w.mesh.geometry.attributes.normal.array,
          ).every((v, n) => v === window.fountainPhotoNormals[n]),
          impactsBefore: window.fountainPhotoImpacts,
          impactsAfter: w.diagnostics.impactCount,
          samples: window.fountainSamples,
          water: w.diagnostics,
        };
      });
      assert(
        value.frozen.sameVertices && value.frozen.sameNormals,
        "Photo keeps its captured deformed water surface stable",
      );
      assert.equal(
        value.frozen.impactsBefore,
        value.frozen.impactsAfter,
        "Photo freezes fountain emission rather than restarting accumulation",
      );
      assert(
        value.frozen.samples.every((s, n, a) => !n || s >= a[n - 1]),
        "Photo samples converge without a reset loop",
      );
      assert(
        value.frozen.water.maxHeight > 0.00005,
        "Photo retains an actual displaced water surface",
      );
    }
    await page.evaluate(() => {
      Building3D.instance.quality.photo.renderSample = window.fountainSample;
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
  async function record(name) {
    const clip = await page.evaluate(async () => {
      const peaks = [];
      const timer = setInterval(
        () =>
          peaks.push(
            Building3D.instance.interaction.controllers.find(
              (c) => c.kind === "water",
            ).diagnostics.maxHeight,
          ),
        100,
      );
      const stream = Building3D.instance.renderer.domElement.captureStream(24),
        chunks = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm",
        videoBitsPerSecond: 16000000,
      });
      const done = new Promise((resolve) => {
        recorder.onstop = resolve;
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.start();
      await new Promise((resolve) => setTimeout(resolve, 6000));
      recorder.stop();
      await done;
      clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      const data = new Uint8Array(
        await new Blob(chunks, { type: "video/webm" }).arrayBuffer(),
      );
      let binary = "";
      for (let offset = 0; offset < data.length; offset += 32768)
        binary += String.fromCharCode(...data.subarray(offset, offset + 32768));
      return { data: btoa(binary), peaks };
    });
    fs.writeFileSync(
      path.join(out, `${name}.webm`),
      Buffer.from(clip.data, "base64"),
    );
    results.recordings ??= {};
    results.recordings[name] = {
      observations: clip.peaks.length,
      minReportedPeak: Math.min(...clip.peaks),
      maxReportedPeak: Math.max(...clip.peaks),
    };
    return `${name}.webm`;
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
    results.inventory = await page.evaluate(() =>
      Building3D.instance.model.pickables
        .filter((m) => m.userData.part?.startsWith("fountain"))
        .map((m) => ({
          part: m.userData.part,
          geometry: m.geometry.type,
          triangles:
            (m.geometry.index?.count || m.geometry.attributes.position.count) /
            3,
          position: m.position.toArray(),
          material: {
            name: m.material.name,
            transparent: m.material.transparent,
            transmission: m.material.transmission,
            roughness: m.material.roughness,
          },
          data: m.userData,
        })),
    );
    if (!waterOnly) {
      results.poolCamera = await camera(false);
      await capture("pool-overview");
      results.closeCamera = await camera(true);
      if (!baseline) results.motion = await motion();
      await capture("fountain-explore");
      results.photo = await photo();
    }
    if (!baseline) {
      if (!waterOnly) results.video = await record("fountain-motion");
      results.waterCamera = await camera("water");
      results.waterMotion = await motion();
      await capture("water-impact-explore");
      results.waterVideo = await record("water-impact-motion");
      await capture("water-impact-later");
    }
    results.errors = errors;
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(out, waterOnly ? "water-checks.json" : `${prefix}checks.json`),
      JSON.stringify(results, null, 2) + "\n",
    );
    console.log(
      "PASS fountain native captures",
      JSON.stringify(results.photo || results.waterMotion),
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
