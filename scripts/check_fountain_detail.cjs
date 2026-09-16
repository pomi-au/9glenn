const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { buildSync } = require("esbuild");
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "audit/fountain-detail"),
  baseline = process.argv.includes("--baseline"),
  prefix = baseline ? "before-" : "",
  view = process.argv.find((a) => a.startsWith("--view="))?.split("=")[1];
fs.mkdirSync(out, { recursive: true });
const helper = buildSync({
  stdin: {
    contents:
      'import {Box3,Vector3} from "three";window.DetailTest={Box3,Vector3};',
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
        : { baseline, baselineCommit: "7219097" };
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
      const part =
        kind === "face"
          ? "fountain mermaid face with carved eyes nose and lips"
          : kind === "body"
            ? "fountain mermaid sculpted torso"
            : kind === "tail"
              ? "fountain mermaid scaled curled tail"
              : "fountain pedestal";
      const mesh =
          i.model.pickables.find((m) => m.userData.part === part) ||
          i.model.pickables.find((m) =>
            m.userData.part?.includes(
              kind === "face" ? "face with" : "sculpted torso",
            ),
          ),
        box = new T.Box3().setFromObject(mesh),
        target = box.getCenter(new T.Vector3());
      if (mesh.userData.part !== part && (kind === "face" || kind === "body")) {
        target
          .copy(mesh.position)
          .add(
            new T.Vector3(
              kind === "face" ? 0.06 : 0.025,
              kind === "face" ? 1.405 : 1.18,
              kind === "face" ? 0.025 : -0.025,
            ),
          );
      }
      if (kind === "full") {
        target.y = 0.88;
        target.z -= 0.03;
      }
      const offset =
          kind === "face"
            ? [0.08, 0.02, -0.65]
            : kind === "body"
              ? [0.12, 0.03, -1]
              : kind === "tail"
                ? [0.62, 0.08, -1.05]
                : [0.6, 0.15, -2.7],
        half =
          kind === "face"
            ? 0.185
            : kind === "tail"
              ? 0.36
              : kind === "body"
                ? 0.25
                : 0.9;
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
        .filter((m) => m.userData.part?.includes("mermaid"))
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
          baseline
            ? "tmp/fountain-detail-baseline.html"
            : "index.html",
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
    if (!baseline) {
      const regions = new Map(
        results.materials
          .filter((m) => m.material.userData.reliefRegion)
          .map((m) => [m.material.userData.reliefRegion, m.material]),
      );
      assert.equal(regions.size, 3);
      for (const [kind, material] of regions) {
        assert(
          material.normalMap?.std > 0.5,
          `${kind} loaded nonuniform normal map`,
        );
        assert(
          material.bumpMap?.std > 0.5,
          `${kind} loaded nonuniform height map`,
        );
        assert.equal(material.normalMap.width, 256);
        assert.equal(material.normalMap.channel, 0);
        assert.deepEqual(material.normalScale, [1, 1]);
      }
      assert.equal(
        new Set([...regions.values()].map((m) => m.normalMap.hash)).size,
        3,
      );
    }
    for (const kind of view
      ? view.split(",")
      : ["face", "tail", "body", "full"]) {
      results[kind] = { camera: await camera(kind) };
      await capture(kind + "-explore");
      results[kind].photo = await photo(kind);
      console.log(kind, JSON.stringify(results[kind].photo));
      if (!baseline && kind === "tail") {
        await page.evaluate(() => Building3D.instance.render());
        await frames();
        const withRelief = await page.screenshot();
        await page.evaluate(() => {
          const i = Building3D.instance,
            m = i.model.pickables.find(
              (m) => m.userData.part === "fountain mermaid scaled curled tail",
            );
          window.savedTailMaps = [m.material.normalMap, m.material.bumpMap];
          m.material.normalMap = null;
          m.material.bumpMap = null;
          m.material.needsUpdate = true;
          i.render();
        });
        await frames();
        const withoutRelief = await page.screenshot({
          path: path.join(out, "tail-relief-disabled.png"),
        });
        results.tail.liveReliefDifference = await page.evaluate(
          async ({ a, b }) => {
            const read = async (data) => {
              const img = new Image();
              img.src = "data:image/png;base64," + data;
              await img.decode();
              const c = document.createElement("canvas");
              c.width = img.width;
              c.height = img.height;
              const ctx = c.getContext("2d");
              ctx.drawImage(img, 0, 0);
              return ctx.getImageData(280, 300, 470, 420).data;
            };
            const x = await read(a),
              y = await read(b);
            let sum = 0,
              count = 0;
            for (let n = 0; n < x.length; n += 4) {
              const d = Math.max(
                Math.abs(x[n] - y[n]),
                Math.abs(x[n + 1] - y[n + 1]),
                Math.abs(x[n + 2] - y[n + 2]),
              );
              sum += d;
              if (d > 3) count++;
            }
            return {
              meanMaxChannelDifference: sum / (x.length / 4),
              pixelsChangedAbove3: count / (x.length / 4),
            };
          },
          {
            a: withRelief.toString("base64"),
            b: withoutRelief.toString("base64"),
          },
        );
        assert(
          results.tail.liveReliefDifference.pixelsChangedAbove3 > 0.001,
          "Normal relief visibly changes rendered tail pixels",
        );
        results.tail.photoReliefControl = await photo("tail-relief-disabled");
        await page.evaluate(() => {
          const i = Building3D.instance,
            m = i.model.pickables.find(
              (m) => m.userData.part === "fountain mermaid scaled curled tail",
            );
          [m.material.normalMap, m.material.bumpMap] = window.savedTailMaps;
          m.material.needsUpdate = true;
          i.render();
        });
      }
    }
    results.errors = errors;
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(out, prefix + "checks.json"),
      JSON.stringify(results, null, 2) + "\n",
    );
    console.log("PASS native fountain face/tail/full views");
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
